/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/demo';

const CALIBRATION_POINT_COUNT = 17;

const enableFaceAndWait = async (page: Page, demoApp: { setFaceSource: () => Promise<string>; waitForFaceDetected: () => Promise<void> }): Promise<void> => {
    await demoApp.setFaceSource();
    await demoApp.waitForFaceDetected();
    await expect(page.getByTestId('start-calibration-button')).toBeEnabled();
};

const completeCalibration = async (page: Page): Promise<void> => {
    await page.getByTestId('start-calibration-button').click({ force: true });
    await expect(page.getByTestId('calibration-overlay')).toBeVisible();

    for (let completed = 1; completed <= CALIBRATION_POINT_COUNT; completed++) {
        const currentPoint = page.locator('[data-testid="calibration-point"][data-current="true"]');
        await expect(currentPoint).toBeVisible();
        await currentPoint.click({ force: true });

        if (completed < CALIBRATION_POINT_COUNT) {
            await expect(page.getByTestId('calibration-progress')).toContainText(
                `${completed} / ${CALIBRATION_POINT_COUNT} points captured`
            );
        }
    }

    await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'calibrated');
    await expect(page.getByTestId('tracking-toggle-button')).toBeVisible();
}

test.describe('Webcam ET Light calibration and tracking flow', () => {
    test('completes the full 17-point calibration flow', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await enableFaceAndWait(page, demoApp);

        await completeCalibration(page);
        await expect(page.getByTestId('start-calibration-button')).toContainText('Recalibrate');
    });

    test('starts and stops tracking after calibration', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await enableFaceAndWait(page, demoApp);
        await completeCalibration(page);

        // Tracking starts automatically after calibration
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Stop Tracking');
        await expect(page.getByTestId('gaze-dot')).toBeVisible();

        // Stop tracking
        await page.getByTestId('tracking-toggle-button').click({ force: true });
        await expect(page.getByTestId('gaze-dot')).toBeHidden();
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Start Tracking');

        // Restart tracking
        await page.getByTestId('tracking-toggle-button').click({ force: true });
        await expect(page.getByTestId('gaze-dot')).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Stop Tracking');
    });

    test('supports recalibration cancel and reset', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await enableFaceAndWait(page, demoApp);
        await completeCalibration(page);

        // Tracking auto-starts after calibration; stop it so Recalibrate becomes enabled
        await page.getByTestId('tracking-toggle-button').click({ force: true });
        await expect(page.getByTestId('gaze-dot')).toBeHidden();

        // Start recalibration
        await page.getByTestId('start-calibration-button').click({ force: true });
        await expect(page.getByTestId('calibration-overlay')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('calibration-overlay')).toBeHidden();
        await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'calibrated');

        await page.getByTestId('reset-button').click({ force: true });
        await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute('data-state', 'ready');
        await expect(page.getByTestId('start-calibration-button')).toContainText('Start Calibration');
    });
});
