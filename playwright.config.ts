/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'list',
    use: {
        baseURL: `http://localhost:${process.env.REIO_WEBCAM_ET_LIGHT_PORT ?? 8089}`,
        trace: 'on-first-retry',
        headless: true,
    },
    webServer: {
        command: 'PW_TEST=1 npm run dev',
        url: `http://localhost:${process.env.REIO_WEBCAM_ET_LIGHT_PORT ?? 8089}`,
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
        env: {
            PW_TEST: '1',
        },
    },
    projects: [
        {
            name: 'demo-e2e',
            testMatch: [
                '**/demo.spec.ts',
                '**/calibration-flow.spec.ts',
                '**/camera-state.spec.ts',
                '**/camera-permissions.spec.ts',
                '**/gaze-prediction.spec.ts',
                '**/face-detection-tracking.spec.ts',
                '**/calibration-error.spec.ts',
                '**/full-lifecycle.spec.ts',
                '**/ui-completeness.spec.ts',
            ],
        },
        {
            name: 'css-rendering',
            testMatch: ['**/css-rendering.spec.ts'],
        },
        {
            name: 'screenshot-capture',
            testMatch: ['**/screenshot-capture.spec.ts'],
        },
    ],
});
