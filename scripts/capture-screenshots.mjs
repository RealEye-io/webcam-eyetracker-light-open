/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Manual screenshot capture script.
 *
 * Captures 5 screenshots of the demo app workflow (with real CSS) using Playwright:
 *   1. demo-intro.png            — initial screen before calibration
 *      (also refreshed as demo-before-calibration.png for the README)
 *   2. demo-ready.png            — tracker ready after starting webcam
 *   3. demo-calibration-mid.png  — calibration in progress (8/17)
 *   4. demo-tracking.png         — active gaze prediction
 *   5. demo-tracking-panel.png   — gaze prediction with side panel open
 *
 * Uses the virtual camera test mode with a person image face source
 * (no real webcam required).
 *
 * Run:
 *   npm run dev  (in one terminal)
 *   node scripts/capture-screenshots.mjs  (in another)
 */
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../test-results/generated-screenshots');
const PUBLIC_OUTPUT_DIR = path.resolve(__dirname, '../public/screenshots');
const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;

const PORT = process.env.REIO_WEBCAM_ET_LIGHT_PORT || 8089;
const BASE_URL = `http://localhost:${PORT}`;

/** Helper to click the current calibration point */
async function clickCurrentCalibrationPoint(page) {
    const cp = page.locator('[data-testid="calibration-point"][data-current="true"]');
    await cp.waitFor({ state: 'visible' });
    await cp.click({ force: true });
}

async function scrollToTop(page) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
}

async function main() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
        permissions: ['camera'],
    });

    // Inject test config before page loads
    await context.addInitScript(() => {
        (window).__REALCAMERA_TEST_CONFIG__ = {
            enabled: true,
            blockPhysicalDevices: true,
            virtualPermission: 'allow',
            virtualVideoConstraintsOverride: { width: 640, height: 480, frameRate: 30 },
        };
        (window).__WEBCAM_ET_LIGHT_E2E_CONFIG__ = {
            enabled: true,
            renderFullApp: true,
            delegate: 'CPU',
            runningMode: 'VIDEO',
        };
    });

    const page = await context.newPage();
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => consoleMessages.push(`[error] ${err.message}`));

    // Navigate to the app with E2E mode params
    await page.goto(`${BASE_URL}/?realcameraTest=1&webcamEtLightE2E=1`, {
        waitUntil: 'networkidle',
    });

    // Wait for webpack to finish
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Log console messages for debugging
    console.log('Console messages:', consoleMessages.slice(-20).join('\n'));

    // Wait for RealCamera API
    await page.waitForFunction(
        () => Boolean((window).__realcameraTestApi__),
        { timeout: 15_000 }
    ).catch(async () => {
        const avail = await page.evaluate(() => {
            return {
                hasRealCameraApi: Boolean((window).__realcameraTestApi__),
                hasE2EConfig: Boolean((window).__WEBCAM_ET_LIGHT_E2E_CONFIG__),
                hasRealCameraConfig: Boolean((window).__REALCAMERA_TEST_CONFIG__),
                hasDemoApi: Boolean((window).__webcamETLightDemo__),
            };
        });
        console.log('Available APIs:', JSON.stringify(avail, null, 2));
    });

    // Set the new person image before capturing the initial states so the docs shots use the updated preview asset.
    await page.evaluate(async () => {
        const api = (window).__realcameraTestApi__;
        const devices = api?.listVirtualDevices();
        if (devices?.length) {
            await api.setVirtualSourceForDevice(devices[0].id, {
                type: 'image',
                url: '/person_in_camera.webp',
            });
        }
    });

    await scrollToTop(page);

    // --- Screenshot 1: Intro screen ---
    await page.waitForTimeout(500);
    const path1 = path.join(OUTPUT_DIR, 'demo-intro.png');
    await page.screenshot({ path: path1, fullPage: true, animations: 'disabled' });
    fs.copyFileSync(path1, path.join(OUTPUT_DIR, 'demo-before-calibration.png'));
    console.log('✓ Screenshot: demo-intro.png');

    // Wait for tracker to be ready and face detection to kick in
    console.log('Waiting for tracker to be ready...');
    await page.waitForFunction(
        () => {
            const api = (window).__webcamETLightDemo__;
            const state = api?.getState();
            return Boolean(state && state.canStartCalibration);
        },
        { timeout: 60_000 }
    );
    console.log('Tracker ready!');

    await page.waitForTimeout(1000);
    await scrollToTop(page);

    // --- Screenshot 2: Ready for calibration ---
    const path2 = path.join(OUTPUT_DIR, 'demo-ready.png');
    await page.screenshot({ path: path2, fullPage: true, animations: 'disabled' });
    console.log('✓ Screenshot: demo-ready.png');

    // ---- Calibration ----
    // Start calibration
    await page.click('[data-testid="start-calibration-button"]');
    await page.waitForSelector('[data-testid="calibration-overlay"]', { state: 'visible' });
    console.log('Calibration started');

    // Complete 8 of 17 calibration points
    for (let i = 1; i <= 8; i++) {
        await clickCurrentCalibrationPoint(page);
        console.log(`  Calibration point ${i}/17`);
    }

    await page.waitForTimeout(400);
    await scrollToTop(page);

    // --- Screenshot 3: Calibration mid-process (8/17) ---
    const path3 = path.join(OUTPUT_DIR, 'demo-calibration-mid.png');
    await page.screenshot({ path: path3, fullPage: true, animations: 'disabled' });
    console.log('✓ Screenshot: demo-calibration-mid.png');

    // Complete the remaining 9 points using the real app flow.
    for (let i = 9; i <= 17; i++) {
        await clickCurrentCalibrationPoint(page);
        console.log(`  Calibration point ${i}/17`);
    }

    await page.waitForSelector('[data-testid="calibration-overlay"]', { state: 'hidden', timeout: 15_000 });

    // Wait for calibrated state
    console.log('Waiting for calibrated state...');
    await page.waitForFunction(
        () => {
            const dot = document.querySelector('[data-testid="tracker-status-dot"]');
            return dot && dot.getAttribute('data-state') === 'calibrated';
        },
        { timeout: 10_000 }
    );
    console.log('Calibrated!');

    // Start tracking
    await page.click('[data-testid="tracking-toggle-button"]');

    // Wait for tracking to start
    console.log('Waiting for tracking...');
    await page.waitForFunction(
        () => {
            const api = (window).__webcamETLightDemo__;
            const st = api?.getState();
            return Boolean(st && st.isTracking && st.hasGaze);
        },
        { timeout: 15_000 }
    );

    await page.waitForSelector('[data-testid="gaze-dot"]', { state: 'visible' });
    console.log('Tracking active!');

    await page.waitForTimeout(1000);
    await scrollToTop(page);

    // --- Screenshot 4: Gaze tracking ---
    const path4 = path.join(OUTPUT_DIR, 'demo-tracking.png');
    await page.screenshot({ path: path4, fullPage: true, animations: 'disabled' });
    console.log('✓ Screenshot: demo-tracking.png');

    await scrollToTop(page);

    // Open settings and diagnostics panels for the final screenshot.
    const settingsButton = page.getByRole('button', { name: /Show Settings|Hide Settings/ });
    if (await settingsButton.count()) {
        const settingsVisible = await page.locator('.settings-panel').isVisible().catch(() => false);
        if (!settingsVisible) {
            await settingsButton.first().click({ force: true });
            await page.waitForSelector('.settings-panel', { state: 'visible' });
        }
    }

    const diagnosticsButton = page.getByRole('button', { name: /Show Diagnostics|Hide Diagnostics/ });
    if (await diagnosticsButton.count()) {
        const diagnosticsVisible = await page.locator('.diagnostics-panel').isVisible().catch(() => false);
        if (!diagnosticsVisible) {
            await diagnosticsButton.first().click({ force: true });
            await page.waitForSelector('.diagnostics-panel', { state: 'visible' });
        }
    }

    await scrollToTop(page);

    // --- Screenshot 5: Tracking with panel open ---
    const path5 = path.join(OUTPUT_DIR, 'demo-tracking-panel.png');
    await page.screenshot({ path: path5, fullPage: true, animations: 'disabled' });
    console.log('✓ Screenshot: demo-tracking-panel.png');

    const filenames = [
        'demo-intro.png',
        'demo-before-calibration.png',
        'demo-ready.png',
        'demo-calibration-mid.png',
        'demo-tracking.png',
        'demo-tracking-panel.png',
    ];

    for (const filename of filenames) {
        fs.copyFileSync(path.join(OUTPUT_DIR, filename), path.join(PUBLIC_OUTPUT_DIR, filename));
    }

    await browser.close();
    console.log('Done!');
}

main().catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
});
