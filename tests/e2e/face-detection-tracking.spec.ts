/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test, expect } from './fixtures/demo';

const CALIBRATION_POINT_COUNT = 17;

/**
 * Acceptance tests for face detection during tracking.
 *
 * Prove that:
 * - When face disappears mid-tracking, gaze dot disappears
 * - When face reappears during tracking, gaze dot reappears
 * - The tracker properly handles face state transitions while tracking
 */
test.describe('Face detection during tracking', () => {
    test('gaze dot disappears when face is lost during tracking', async ({ page, demoApp }) => {
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
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Stop Tracking');

        // Remove face (set blank source)
        await demoApp.setBlankSource();

        // Wait for face to be undetected
        await demoApp.waitForNoFace();

        // Gaze dot should disappear when face is lost
        await expect(page.getByTestId('gaze-dot')).toBeHidden({ timeout: 5_000 });

        // Tracking should still be active but no gaze
        const afterState = await demoApp.getState();
        expect(afterState.isTracking).toBe(true);
        expect(afterState.hasGaze).toBe(false);
    });

    test('gaze dot reappears when face returns during tracking', async ({ page, demoApp }) => {
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
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Stop Tracking');

        // Remove face
        await demoApp.setBlankSource();
        await demoApp.waitForNoFace();
        await expect(page.getByTestId('gaze-dot')).toBeHidden({ timeout: 5_000 });

        // Restore face — wait for face detection state change only (not canStartCalibration)
        await demoApp.setFaceSource();
        await page.waitForFunction(() => {
            const api = (window as Window & {
                __webcamETLightDemo__?: {
                    getState: () => { noFaceDetected: boolean };
                };
            }).__webcamETLightDemo__;
            return api?.getState().noFaceDetected === false;
        });

        // Gaze should reappear
        await expect(page.getByTestId('gaze-dot')).toBeVisible({ timeout: 5_000 });

        // Verify tracking is still active with gaze restored
        const state = await demoApp.getState();
        expect(state.isTracking).toBe(true);
        expect(state.hasGaze).toBe(true);
        expect(state.noFaceDetected).toBe(false);
    });

    test('tracking can be stopped after face loss', async ({ page, demoApp }) => {
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

        // Remove face
        await demoApp.setBlankSource();
        await demoApp.waitForNoFace();
        await expect(page.getByTestId('gaze-dot')).toBeHidden({ timeout: 5_000 });

        // Stop tracking while no face
        await page.getByTestId('tracking-toggle-button').click({ force: true });

        const state = await demoApp.getState();
        expect(state.isTracking).toBe(false);
        expect(state.hasGaze).toBe(false);
    });
});
