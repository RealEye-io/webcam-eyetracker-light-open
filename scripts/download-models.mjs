#!/usr/bin/env node

/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Downloads MediaPipe model files required for the eye-tracker to function.
 *
 * This script is idempotent — it skips files that already exist.
 * Run via `npm run download-models` or automatically after `npm install`.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MODEL_DIR = join(ROOT, 'public', 'models');

const MODELS = [
    {
        name: 'BlazeFace Short Range',
        filename: 'blaze_face_short_range.tflite',
        url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
    },
    {
        name: 'Face Landmarker',
        filename: 'face_landmarker.task',
        url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function downloadFile(url, destPath) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} when fetching ${url}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destPath, buffer);
    return buffer.byteLength;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('Downloading MediaPipe model files...\n');

    // Ensure target directory exists
    await mkdir(MODEL_DIR, { recursive: true });

    let downloaded = 0;
    let skipped = 0;

    for (const model of MODELS) {
        const destPath = join(MODEL_DIR, model.filename);

        if (existsSync(destPath)) {
            console.log(`  ✓ ${model.name} — already present, skipping`);
            skipped++;
            continue;
        }

        process.stdout.write(`  ↓ ${model.name} — downloading... `);
        try {
            const byteLength = await downloadFile(model.url, destPath);
            const sizeKB = (byteLength / 1024).toFixed(1);
            console.log(`done (${sizeKB} KB)`);
            downloaded++;
        } catch (error) {
            console.log('failed');
            console.error(`    ${error.message}`);
            process.exitCode = 1;
        }
    }

    console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${MODELS.length - downloaded - skipped} failed.`);

    if (downloaded === 0 && skipped === MODELS.length) {
        console.log('All models already present — nothing to do.');
    }
}

main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
