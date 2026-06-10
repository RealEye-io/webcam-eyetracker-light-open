/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Screenshot capture for demo app documentation.
 *
 * Produces five screenshots of the demo app covering the full workflow:
 *   1. demo-intro.png            — initial screen before calibration
 *      (also refreshed as demo-before-calibration.png for the README)
 *   2. demo-ready.png            — tracker ready for calibration after starting webcam
 *   3. demo-calibration-mid.png  — calibration in progress (8/17 points completed)
 *   4. demo-tracking.png         — active gaze prediction with gaze dot
 *   5. demo-tracking-panel.png   — gaze prediction with side panel open (Tech Info + Settings)
 *
 * Uses the full App with virtual camera emulation and a person image face source
 * (no real webcam required). All states are captured sequentially in a single test
 * to avoid re-navigating the page.
 *
 * Run: REIO_WEBCAM_ET_LIGHT_PORT=8089 npx playwright test tests/e2e/screenshot-capture.spec.ts
 */

/// <reference types="node" />

import path from 'path';
import fs from 'fs';
import { test, expect } from './fixtures/demo';

const OUTPUT_DIR = path.resolve(process.cwd(), 'test-results/generated-screenshots');
const PUBLIC_OUTPUT_DIR = path.resolve(process.cwd(), 'public/screenshots');
const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;

test.describe('Screenshot capture for demo docs', () => {
    test('captures all 5 demo workflow screenshots', async ({ page, demoApp }) => {
        const calibrationPointTimeoutMs = 10_000;
        const scrollToTop = async () => {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(150);
        };

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        await page.setViewportSize({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
        await demoApp.goto({
            e2eConfig: {
                enabled: true,
                renderFullApp: true,
                forceFaceDetection: true,
                delegate: 'CPU',
                runningMode: 'VIDEO',
            }
        });

        await demoApp.setPersonSource();

        await scrollToTop();

        // --- Screenshot 1: Intro screen (before face detection) ---
        await page.waitForTimeout(500);
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'demo-intro.png'),
            fullPage: true,
            animations: 'disabled',
        });
        fs.copyFileSync(
            path.join(OUTPUT_DIR, 'demo-intro.png'),
            path.join(OUTPUT_DIR, 'demo-before-calibration.png')
        );
        console.log('✓ Screenshot: demo-intro.png');

        // In renderFullApp mode with virtual camera, the webcam auto-streams from the virtual device.
        // Tracker initializes on page load in DEMO_E2E_MODE. Start preview explicitly, then wait for face detection.
        await demoApp.startPreview();
        await demoApp.waitForTrackerReady();
        await demoApp.waitForFaceDetected();
        await expect(page.getByTestId('start-calibration-button')).toBeEnabled();
        await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'ready');

        await page.waitForTimeout(600);
        await scrollToTop();

        // --- Screenshot 2: Ready for calibration ---
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'demo-ready.png'),
            fullPage: true,
            animations: 'disabled',
        });
        console.log('✓ Screenshot: demo-ready.png');

        // --- Start calibration ---
        await page.getByTestId('start-calibration-button').click({ force: true });
        await expect(page.getByTestId('calibration-overlay')).toBeVisible();

        // Complete 8 of 17 points
        for (let i = 1; i <= 8; i++) {
            await page.waitForSelector('[data-testid="calibration-point"][data-current="true"][data-completed="false"]', { timeout: calibrationPointTimeoutMs });
            await page.click('[data-testid="calibration-point"][data-current="true"]', { force: true });

            // Wait for progress to confirm this point was captured
            await expect(page.getByTestId('calibration-progress')).toContainText(`${i} /`, { timeout: 5000 });
        }

        await page.waitForTimeout(400);
        await scrollToTop();

        // --- Screenshot 3: Calibration mid-process (8/17) ---
        // The calibration overlay is position:fixed (covers viewport only).
        // Use fullPage:false so we don't capture the main app behind the overlay.
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'demo-calibration-mid.png'),
            fullPage: false,
            animations: 'disabled',
        });
        console.log('✓ Screenshot: demo-calibration-mid.png');

        // Complete the remaining 9 points using the real app flow.
        for (let i = 9; i <= 17; i++) {
            await page.waitForSelector('[data-testid="calibration-point"][data-current="true"][data-completed="false"]', { timeout: calibrationPointTimeoutMs });
            await page.click('[data-testid="calibration-point"][data-current="true"]', { force: true });

            if (i < 17) {
                await expect(page.getByTestId('calibration-progress')).toContainText(`${i} /`, { timeout: 5000 });
            }
        }

        await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 10_000 });

        await expect(page.getByTestId('tracker-status-dot')).toBeVisible({ timeout: 5000 });
        await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'calibrated');

        // --- Start tracking ---
        // Calibration auto-starts tracking; only click if not already tracking.
        const trackingButtonText = await page.getByTestId('tracking-toggle-button').textContent();
        if (trackingButtonText?.includes('Start')) {
            await page.getByTestId('tracking-toggle-button').click({ force: true });
        }
        await page.waitForFunction(() => {
            const api = (window as Window & {
                __webcamETLightDemo__?: { getState: () => { isTracking: boolean; hasGaze: boolean } };
            }).__webcamETLightDemo__;
            const st = api?.getState();
            return Boolean(st && st.isTracking && st.hasGaze);
        }, { timeout: 15_000 });
        await expect(page.getByTestId('gaze-dot')).toBeVisible();
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Stop Tracking');

        await page.waitForTimeout(600);
        await scrollToTop();

        // --- Screenshot 4: Gaze tracking ---
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'demo-tracking.png'),
            fullPage: true,
            animations: 'disabled',
        });
        console.log('✓ Screenshot: demo-tracking.png');

        await scrollToTop();

        // --- Screenshot 5: Tracking with settings + diagnostics open ---
        const settingsButton = page.getByRole('button', { name: /Show Settings|Hide Settings/ });
        if (await settingsButton.count()) {
            const settingsVisible = await page.locator('.settings-panel').isVisible().catch(() => false);
            if (!settingsVisible) {
                await settingsButton.first().click({ force: true });
                await expect(page.locator('.settings-panel')).toBeVisible();
            }
        }

        const diagnosticsButton = page.getByRole('button', { name: /Show Diagnostics|Hide Diagnostics/ });
        if (await diagnosticsButton.count()) {
            const diagnosticsVisible = await page.locator('.diagnostics-panel').isVisible().catch(() => false);
            if (!diagnosticsVisible) {
                await diagnosticsButton.first().click({ force: true });
                await expect(page.locator('.diagnostics-panel')).toBeVisible();
            }
        }

        await scrollToTop();

        // Always capture the final screenshot
        await page.screenshot({
            path: path.join(OUTPUT_DIR, 'demo-tracking-panel.png'),
            fullPage: true,
            animations: 'disabled',
        });
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
    });
});
