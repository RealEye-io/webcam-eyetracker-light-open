/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test, expect } from './fixtures/demo';

test.describe('Webcam ET Light demo smoke', () => {
    test('loads the demo with deterministic virtual cameras', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();

        await expect(page.getByRole('heading', { name: 'RealEye — Webcam EyeTracker Light' })).toBeVisible();
        await expect(page.getByTestId('tracker-status-bar')).toBeVisible();
        await expect(page.getByTestId('webcam-container')).toBeVisible();
        await expect(page.getByTestId('webcam-select')).toBeVisible();
        await expect(page.getByTestId('start-camera-button')).toBeVisible();
        await expect(page.getByTestId('webcam-placeholder')).toBeVisible();

        const devices = await demoApp.listVirtualDevices();
        expect(devices).toHaveLength(2);
        expect(devices[0]?.label).toContain('ET Light Test Camera');
    });

    test('publishes a stable demo test API for assertions', async ({ demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();

        const state = await demoApp.getState();
        expect(state.trackerState).toBe('ready');
        expect(state.isTracking).toBe(false);
        expect(state.isPreviewStarted).toBe(false);
        expect(state.calibrationPointCount).toBe(17);
        expect(state.canStartCalibration).toBe(false);
    });
});
