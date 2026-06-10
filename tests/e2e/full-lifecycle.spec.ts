/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test, expect } from './fixtures/demo';

const CALIBRATION_POINT_COUNT = 17;

/**
 * Acceptance test: full lifecycle round-trip.
 *
 * Prove that the demo app can be reused:
 * 1. Calibrate → track (gaze visible) → stop tracking
 * 2. Reset → recalibrate → track again (gaze visible again)
 *
 * This proves calibration data can be replaced and tracking restarts correctly.
 */
test.describe('Full lifecycle round-trip', () => {
    test('can calibrate, track, reset, recalibrate, and track again', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

        // === First cycle: calibrate → track ===
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
        await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'calibrated');

        // Tracking starts automatically after calibration
        await expect(page.getByTestId('gaze-dot')).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Stop Tracking');

        const afterFirstTrack = await demoApp.getState();
        expect(afterFirstTrack.isTracking).toBe(true);
        expect(afterFirstTrack.hasGaze).toBe(true);

        // Stop tracking
        await page.getByTestId('tracking-toggle-button').click({ force: true });
        await expect(page.getByTestId('gaze-dot')).toBeHidden();
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Start Tracking');

        // === Reset ===
        await page.getByTestId('reset-button').click({ force: true });
        await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'ready');
        await expect(page.getByTestId('start-calibration-button')).toContainText('Start Calibration');

        // === Second cycle: recalibrate → track ===
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

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
        await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'calibrated');

        // Tracking starts automatically after second calibration
        await expect(page.getByTestId('gaze-dot')).toBeVisible({ timeout: 10_000 });
    });
});
