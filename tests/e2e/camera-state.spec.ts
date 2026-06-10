/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test, expect } from './fixtures/demo';

test.describe('Webcam ET Light camera state flows', () => {
    test('starts in a no-face state and enables calibration once a face appears', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await demoApp.waitForNoFace();

        await expect(page.getByTestId('start-calibration-button')).toBeDisabled();
        await expect(page.getByTestId('idle-no-face-warning')).toBeVisible();

        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

        await expect(page.getByTestId('start-calibration-button')).toBeEnabled();
        await expect(page.getByTestId('idle-no-face-warning')).toBeHidden();
    });

    test('switching between virtual cameras updates face availability deterministically', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();

        const primaryDeviceId = await demoApp.getPrimaryDeviceId();
        const secondaryDeviceId = await demoApp.getSecondaryDeviceId();

        await demoApp.setFaceSource(primaryDeviceId);
        await demoApp.setBlankSource(secondaryDeviceId, 'Camera B is blank');

        await page.getByTestId('webcam-select').selectOption(primaryDeviceId);
        await demoApp.waitForFaceDetected();
        await expect(page.getByTestId('start-calibration-button')).toBeEnabled();

        await page.getByTestId('webcam-select').selectOption(secondaryDeviceId);
        await demoApp.waitForNoFace();
        await expect(page.getByTestId('start-calibration-button')).toBeDisabled();
        await expect(page.getByTestId('idle-no-face-warning')).toBeVisible();

        await page.getByTestId('webcam-select').selectOption(primaryDeviceId);
        await demoApp.waitForFaceDetected();
        await expect(page.getByTestId('start-calibration-button')).toBeEnabled();
    });
});
