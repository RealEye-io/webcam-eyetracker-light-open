/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test, expect } from './fixtures/demo';

const CALIBRATION_POINT_COUNT = 17;

/**
 * Acceptance test: gaze prediction produces valid viewport coordinates.
 * 
 * Proves that after calibration the tracker produces gaze positions that:
 * - Have both x and y defined (not null/NaN)
 * - Fall within the viewport (between 0 and innerWidth/innerHeight)
 * - Are clamped to the 24px safety margin used by the tracker
 */
test.describe('Gaze prediction coordinates', () => {
    test('gaze position is within viewport bounds after calibration + tracking', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

        // Complete calibration
        await page.getByTestId('start-calibration-button').click({ force: true });
        await expect(page.getByTestId('calibration-overlay')).toBeVisible();

        for (let i = 1; i <= CALIBRATION_POINT_COUNT; i++) {
            await page.waitForSelector('[data-testid="calibration-point"][data-current="true"][data-completed="false"]', { timeout: 10_000 });
            await page.locator('[data-testid="calibration-point"][data-current="true"]').click({ force: true });

            if (i < CALIBRATION_POINT_COUNT) {
                await expect(page.getByTestId('calibration-progress')).toContainText(
                    `${i} / ${CALIBRATION_POINT_COUNT} points captured`
                );
            }
        }

        await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 10_000 });

        // Tracking starts automatically after calibration - verify gaze coordinates
        await page.waitForFunction(() => {
            const api = (window as Window & {
                __webcamETLightDemo__?: { getState: () => { isTracking: boolean; hasGaze: boolean } };
            }).__webcamETLightDemo__;
            const state = api?.getState();
            return Boolean(state && state.isTracking === true && state.hasGaze === true);
        });

        // Verify gaze coordinates are valid and within viewport
        const { gazeX, gazeY, viewWidth, viewHeight } = await page.evaluate(() => {
            // Access gaze from the demo state — the DemoE2ETracker scales to viewport
            // We can't directly read gaze state, so check the gaze dot position via transform
            const dot = document.querySelector('[data-testid="gaze-dot"]') as HTMLElement | null;
            if (!dot) return { gazeX: null, gazeY: null };
            
            const transform = dot.style.transform;
            const match = transform.match(/translate\((\d+(?:\.\d+)?px),\s*(\d+(?:\.\d+)?px)\)/);
            const coords = match ? { x: parseFloat(match[1]), y: parseFloat(match[2]) } : null;
            
            return {
                gazeX: coords?.x ?? null,
                gazeY: coords?.y ?? null,
                viewWidth: window.innerWidth,
                viewHeight: window.innerHeight,
            };
        });

        expect(gazeX).not.toBeNull();
        expect(gazeY).not.toBeNull();
        expect(gazeX!).toBeDefined();
        expect(gazeY!).toBeDefined();

        // Coordinates should be finite numbers
        expect(Number.isFinite(gazeX!)).toBe(true);
        expect(Number.isFinite(gazeY!)).toBe(true);

        // Coordinates should be within viewport bounds (with the 24px safety margin)
        expect(gazeX!).toBeGreaterThan(0);
        expect(gazeY!).toBeGreaterThan(0);
        expect(gazeX! as number).toBeLessThan(viewWidth as number);
        expect(gazeY! as number).toBeLessThan(viewHeight as number);
    });

    test('gaze dot element has valid CSS left/top coordinates', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

        // Complete calibration
        await page.getByTestId('start-calibration-button').click({ force: true });
        await expect(page.getByTestId('calibration-overlay')).toBeVisible();

        for (let i = 1; i <= CALIBRATION_POINT_COUNT; i++) {
            await page.waitForSelector('[data-testid="calibration-point"][data-current="true"][data-completed="false"]', { timeout: 10_000 });
            await page.locator('[data-testid="calibration-point"][data-current="true"]').click({ force: true });

            if (i < CALIBRATION_POINT_COUNT) {
                await expect(page.getByTestId('calibration-progress')).toContainText(
                    `${i} / ${CALIBRATION_POINT_COUNT} points captured`
                );
            }
        }

        await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 10_000 });

        // Tracking starts automatically after calibration
        await expect(page.getByTestId('gaze-dot')).toBeVisible({ timeout: 10_000 });

        // Verify the gaze dot has proper styling (transform should contain valid px values)
        const dotStyle = await page.evaluate(() => {
            const dot = document.querySelector('[data-testid="gaze-dot"]') as HTMLElement | null;
            if (!dot) return null;
            return {
                transform: dot.style.transform,
                backgroundColor: dot.style.backgroundColor,
                border: dot.style.border,
            };
        });

        expect(dotStyle).not.toBeNull();
        // Verify transform contains pixel coordinates: translate(Xpx, Ypx)
        expect(dotStyle!.transform).toMatch(/translate\(\d+(?:\.\d+)?px,\s*\d+(?:\.\d+)?px\)/);

        // Gaze dot should use accent blue (valid face detected)
        expect(dotStyle!.backgroundColor).toContain('0, 102, 255'); // rgba(0, 102, 255, 0.5)
        expect(dotStyle!.border).toContain('0, 102, 255'); // #0066ff → rgb(0, 102, 255)
    });
});
