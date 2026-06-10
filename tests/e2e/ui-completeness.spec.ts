/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test, expect } from './fixtures/demo';

/**
 * Acceptance tests for demo app UI completeness.
 *
 * Prove that:
 * - All major UI sections are present (header, video, controls, status)
 * - Test IDs used by E2E tests are correctly assigned
 * - Version badge is displayed
 * - UI guardrails during calibration/tracking (disabled buttons, etc.)
 * - Webcam preview element is visible
 */
test.describe('Demo app UI completeness', () => {
    test('all major UI elements are present after tracker initializes', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();

        // Header
        await expect(page.getByRole('heading', { name: 'RealEye — Webcam EyeTracker Light' })).toBeVisible();
        await expect(page.getByTestId('tracker-status-bar')).toBeVisible();

        // Status dot (empty span with CSS sizing, so check for existence + attribute instead of visibility)
        const statusDot = page.getByTestId('tracker-status-dot');
        await expect(statusDot).toHaveCount(1);
        await expect(statusDot).toHaveAttribute('data-state', /(ready|calibrated)/);

        // Version in footer
        const footer = page.locator('footer');
        await expect(footer).toBeVisible();
        const footerText = await footer.textContent();
        expect(footerText).toMatch(/v\d+\.\d+\.\d+/);

        // Camera selector
        await expect(page.getByTestId('webcam-selector')).toBeVisible();
        await expect(page.getByTestId('webcam-select')).toBeVisible();
        await expect(page.getByTestId('webcam-select')).toBeDisabled();

        // Webcam container
        await expect(page.getByTestId('webcam-container')).toBeVisible();
        await expect(page.getByTestId('webcam-placeholder')).toBeVisible();
        await expect(page.getByTestId('start-camera-button')).toBeVisible();
        await expect(page.getByTestId('start-camera-button')).toContainText('Start Camera');
        await expect(page.getByTestId('preview-not-started-hint')).toBeVisible();

        // Control buttons
        await expect(page.getByTestId('start-calibration-button')).toBeVisible();
        await expect(page.getByTestId('start-calibration-button')).toBeDisabled();

        // Reset button should NOT be visible until calibrated (along with tracking toggle)
        await expect(page.getByTestId('reset-button')).toBeHidden();
        await expect(page.getByTestId('tracking-toggle-button')).toBeHidden();

        // Start preview and verify webcam feed appears
        await demoApp.startPreview();
        await expect(page.getByTestId('webcam-video')).toBeVisible();
        await expect(page.getByTestId('webcam-select')).toBeEnabled();

        // Tracking toggle should NOT be visible until calibrated
        await expect(page.getByTestId('tracking-toggle-button')).toBeHidden();
    });

    test('camera selector is disabled during calibration', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

        // Start calibration
        await page.getByTestId('start-calibration-button').click({ force: true });
        await expect(page.getByTestId('calibration-overlay')).toBeVisible();

        // Camera selector should be disabled during calibration
        await expect(page.getByTestId('webcam-select')).toBeDisabled();

        // Complete calibration
        for (let i = 1; i <= 17; i++) {
            await page.waitForSelector('[data-testid="calibration-point"][data-current="true"][data-completed="false"]', { timeout: 10_000 });
            await page.locator('[data-testid="calibration-point"][data-current="true"]').click({ force: true });

            if (i < 17) {
                await expect(page.getByTestId('calibration-progress')).toContainText(`${i} / 17 points captured`);
            }
        }

        await expect(page.getByTestId('calibration-overlay')).toBeHidden({ timeout: 10_000 });

        // Camera selector stays disabled since tracking auto-starts (and tracking also disables the selector)
        await expect(page.getByTestId('webcam-select')).toBeDisabled();

        // Stop tracking to re-enable the camera selector
        await page.getByTestId('tracking-toggle-button').click({ force: true });
        await expect(page.getByTestId('webcam-select')).toBeEnabled();
    });

    test('camera selector is disabled during tracking', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

        // Calibrate
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

        // Camera selector stays disabled because tracking auto-starts (and tracking disables the selector)
        await expect(page.getByTestId('webcam-select')).toBeDisabled();

        // Stop tracking to re-enable the camera selector
        await page.getByTestId('tracking-toggle-button').click({ force: true });
        await expect(page.getByTestId('webcam-select')).toBeEnabled();
    });

    test('calibration instruction text displays current point name', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

        await page.getByTestId('start-calibration-button').click({ force: true });
        await expect(page.getByTestId('calibration-overlay')).toBeVisible();

        // Instruction should mention the first point
        await expect(page.getByTestId('calibration-instruction')).toContainText('Point 1', { timeout: 5_000 });

        // Click first point
        await page.waitForSelector('[data-testid="calibration-point"][data-current="true"][data-completed="false"]', { timeout: 10_000 });
        await page.locator('[data-testid="calibration-point"][data-current="true"]').click({ force: true });

        // Instruction should now mention the next point
        await expect(page.getByTestId('calibration-instruction')).toContainText('Point 2', { timeout: 5_000 });
    });

    test('tracking toggle button changes state correctly', async ({ page, demoApp }) => {
        await demoApp.goto();
        await demoApp.waitForTrackerReady();
        await demoApp.startPreview();
        await demoApp.setFaceSource();
        await demoApp.waitForFaceDetected();

        // Calibrate
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

        // After calibration, tracking starts automatically - button should show "Stop Tracking"
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Stop Tracking');
        await expect(page.getByTestId('gaze-dot')).toBeVisible({ timeout: 10_000 });

        // Click to stop
        await page.getByTestId('tracking-toggle-button').click({ force: true });
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Start Tracking');
        await expect(page.getByTestId('gaze-dot')).toBeHidden();

        // Click to start again
        await page.getByTestId('tracking-toggle-button').click({ force: true });
        await expect(page.getByTestId('tracking-toggle-button')).toContainText('Stop Tracking');
    });
});
