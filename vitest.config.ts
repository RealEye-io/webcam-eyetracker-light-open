/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 60000,
        hookTimeout: 30000,
        benchmark: {
            include: ['tests/perf/**/*.bench.ts'],
            reporters: ['default'],
        },
    },
    resolve: {
        alias: {
            '@lib': path.resolve(__dirname, 'src/lib'),
        },
    },
});
