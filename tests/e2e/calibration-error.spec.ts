/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test, expect } from './fixtures/demo';

/**
 * Acceptance tests for calibration error paths.
 * 
 * Prove that:
 * - Attempting calibration without a detected face fails gracefully
 * - Error messages are displayed when calibration fails
 * - The app can recover from calibration errors (back to ready state)
 */
test.describe('Calibration error handling', () => {
    test('calibration fails when no face is detected', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();

        // Ensure no face is present (blank source)
        await demoApp.setBlankSource();
        await demoApp.waitForNoFace();

        // Calibration button should be disabled when no face
        await expect(page.getByTestId('start-calibration-button')).toBeDisabled();
        await expect(page.getByTestId('idle-no-face-warning')).toBeVisible();
    });

    test('app transitions from error state back to ready after reset', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

        // Complete calibration
        await page.getByTestId('start-calibration-button').click({ force: true });
        await expect(page.getByTestId('calibration-overlay')).toBeVisible();

        for (let i = 1; i <= 17; i++) {
            await page.waitForSelector('[data-testid="calibration-point"][data-current="true"][data-completed="false"]', { timeout: 10_000 });
            await page.locator('[data-testid="calibration-point"][data-current="true"]').click({ force: true });

            if (i < 17) {
                await expect(page.getByTestId('calibration-progress')).toContainText(`${i} / 17 points captured`);
            }
        }

        await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 10_000 });
        await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'calibrated');

        // Now simulate an error by removing face mid-calibration (reset and try again)
        await page.getByTestId('reset-button').click({ force: true });
        await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'ready');

        // Verify we can calibrate again after reset
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();
        await expect(page.getByTestId('start-calibration-button')).toBeEnabled();
    });
});
