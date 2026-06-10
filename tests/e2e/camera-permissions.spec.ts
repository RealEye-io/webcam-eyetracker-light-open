/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test, expect } from './fixtures/demo';

test.describe('Webcam ET Light camera permission flows', () => {
    test('shows a webcam error when camera permission is denied', async ({ page, demoApp }) => {
        await demoApp.goto({
            realCameraConfig: {
                virtualPermission: 'deny',
            },
        });
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();

        await expect(page.getByTestId('error-message')).toContainText('Failed to get webcam stream', {
            timeout: 15_000,
        });
        await expect(page.getByTestId('start-calibration-button')).toBeDisabled();
    });

    test('handles manual permission prompts without requiring interactive browser UI', async ({ page, demoApp }) => {
        await demoApp.goto({
            realCameraConfig: {
                virtualPermission: 'prompt',
                permissionPromptMode: 'manual',
                permissionPromptTimeoutMs: 0,
            },
        });
        await demoApp.waitForTrackerReady();

        const pendingBeforeStart = await page.evaluate(() => {
            const api = (window as Window & {
                __realcameraTestApi?: {
                    listPendingPermissionRequests: () => Array<{ id: string }>;
                };
            }).__realcameraTestApi;
            return api?.listPendingPermissionRequests().length ?? 0;
        });
        expect(pendingBeforeStart).toBe(0);

        await demoApp.startPreview();

        const permissionRequest = await demoApp.waitForPermissionRequest();
        expect(permissionRequest.id).toBeTruthy();
        await expect(page.getByTestId('start-calibration-button')).toBeDisabled();
    });
});
