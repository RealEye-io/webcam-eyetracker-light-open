/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Unit tests for feature extraction.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
    extractFeatures,
    extractCombinedFeatures,
    getFeatureCount,
    getCombinedFeatureCount,
} from '../../lib/features/FeatureExtractor';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { BoundingBox, FaceKeypoint } from '../../lib/types';
import { REALEYE_EYE_INDICES } from '../../lib/face/FaceLandmarkerAdapter';

// Polyfill ImageData for Node.js environment
class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(data: Uint8ClampedArray, width: number, height?: number) {
        this.data = data;
        this.width = width;
        this.height = height ?? data.length / (width * 4);
    }
}

beforeAll(() => {
    if (typeof globalThis.ImageData === 'undefined') {
        (globalThis as unknown as { ImageData: typeof ImageDataPolyfill }).ImageData = ImageDataPolyfill;
    }
});

// Helper to create a simple test ImageData
function createTestImageData(width: number, height: number, fillValue: number = 128): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = fillValue;     // R
        data[i + 1] = fillValue; // G
        data[i + 2] = fillValue; // B
        data[i + 3] = 255;       // A
    }
    return new ImageData(data, width, height);
}

// Helper to create ImageData with a gradient
function createGradientImageData(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const value = Math.floor((x / width) * 255);
            data[idx] = value;     // R
            data[idx + 1] = value; // G
            data[idx + 2] = value; // B
            data[idx + 3] = 255;   // A
        }
    }
    return new ImageData(data, width, height);
}

// Helper to build a full landmark set with valid eye bounding boxes
function createFullLandmarksWithValidEyes(): NormalizedLandmark[] {
    const landmarks: NormalizedLandmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

    // Left eye bounding box
    for (const idx of REALEYE_EYE_INDICES.LEFT_MIN_X) {
        landmarks[idx] = { x: 0.30, y: 0.45, z: 0 } as NormalizedLandmark;
    }
    for (const idx of REALEYE_EYE_INDICES.LEFT_MAX_X) {
        landmarks[idx] = { x: 0.40, y: 0.55, z: 0 } as NormalizedLandmark;
    }
    for (const idx of REALEYE_EYE_INDICES.LEFT_MIN_Y) {
        landmarks[idx] = { x: 0.35, y: 0.30, z: 0 } as NormalizedLandmark;
    }
    for (const idx of REALEYE_EYE_INDICES.LEFT_MAX_Y) {
        landmarks[idx] = { x: 0.35, y: 0.60, z: 0 } as NormalizedLandmark;
    }

    // Right eye bounding box
    for (const idx of REALEYE_EYE_INDICES.RIGHT_MIN_X) {
        landmarks[idx] = { x: 0.60, y: 0.45, z: 0 } as NormalizedLandmark;
    }
    for (const idx of REALEYE_EYE_INDICES.RIGHT_MAX_X) {
        landmarks[idx] = { x: 0.72, y: 0.55, z: 0 } as NormalizedLandmark;
    }
    for (const idx of REALEYE_EYE_INDICES.RIGHT_MIN_Y) {
        landmarks[idx] = { x: 0.66, y: 0.30, z: 0 } as NormalizedLandmark;
    }
    for (const idx of REALEYE_EYE_INDICES.RIGHT_MAX_Y) {
        landmarks[idx] = { x: 0.66, y: 0.62, z: 0 } as NormalizedLandmark;
    }

    return landmarks;
}

describe('Feature Extraction', () => {
    describe('getFeatureCount', () => {
        it('returns correct count for default size (16)', () => {
            expect(getFeatureCount()).toBe(16 * 16 + 1); // 257
        });

        it('returns correct count for custom size', () => {
            expect(getFeatureCount(32)).toBe(32 * 32 + 1); // 1025
        });
    });

    describe('getCombinedFeatureCount', () => {
        it('returns correct count for default landmark pipeline', () => {
            // 21 landmark features + 2*40*20 eye pixels + 1 bias = 1622
            expect(getCombinedFeatureCount()).toBe(1622);
        });

        it('returns correct count for enhanced landmarks', () => {
            // 30 raw landmark coords + 2*40*20 eye pixels + 1 bias = 1631
            expect(getCombinedFeatureCount(true, true)).toBe(1631);
        });

        it('returns correct count for face-image fallback', () => {
            // 16*16 face crop + 2*40*20 eye pixels + 1 bias = 1857
            expect(getCombinedFeatureCount(false)).toBe(1857);
        });

        it('returns correct count for custom eye dimensions', () => {
            // 21 landmarks + 2*20*10 eye pixels + 1 bias = 422
            expect(getCombinedFeatureCount(true, false, 20, 10)).toBe(422);
        });
    });

    describe('extractFeatures', () => {
        it('extracts features with correct length', () => {
            const imageData = createTestImageData(200, 200);
            const boundingBox: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };

            const features = extractFeatures(imageData, boundingBox, 64);

            expect(features.length).toBe(4097); // 64*64 + 1 bias
        });

        it('includes bias term at the end', () => {
            const imageData = createTestImageData(200, 200);
            const boundingBox: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };

            const features = extractFeatures(imageData, boundingBox, 64);

            expect(features[features.length - 1]).toBe(1.0);
        });

        it('produces z-score normalized features', () => {
            const imageData = createTestImageData(200, 200, 128);
            const boundingBox: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };

            const features = extractFeatures(imageData, boundingBox, 64);

            // Z-score normalized features have mean ≈ 0 and std ≈ 1
            // For uniform image, all values should be near 0
            let sum = 0;
            for (let i = 0; i < features.length - 1; i++) {
                sum += features[i];
            }
            const mean = sum / (features.length - 1);
            expect(mean).toBeCloseTo(0, 5);
        });

        it('produces consistent output for uniform image (z-score normalized)', () => {
            const imageData = createTestImageData(200, 200, 200);
            const boundingBox: BoundingBox = { x: 50, y: 50, width: 100, height: 100 };

            const features = extractFeatures(imageData, boundingBox, 64);

            // After z-score normalization, uniform image should have all values near 0
            // because (value - mean) / std = 0 when all values are the same
            for (let i = 0; i < features.length - 1; i++) {
                expect(features[i]).toBeCloseTo(0, 5);
            }
        });

        it('handles bounding box at image edge', () => {
            const imageData = createTestImageData(100, 100);
            const boundingBox: BoundingBox = { x: 0, y: 0, width: 50, height: 50 };

            const features = extractFeatures(imageData, boundingBox, 32);

            expect(features.length).toBe(32 * 32 + 1);
        });

        it('handles gradient image (produces varying features)', () => {
            const imageData = createGradientImageData(200, 200);
            const boundingBox: BoundingBox = { x: 0, y: 0, width: 200, height: 200 };

            const features = extractFeatures(imageData, boundingBox, 64);

            // Features should vary across the image
            const uniqueValues = new Set(features.slice(0, -1).map(v => Math.round(v * 100)));
            expect(uniqueValues.size).toBeGreaterThan(1);
        });

        it('throws for invalid bounding box', () => {
            const imageData = createTestImageData(100, 100);
            const boundingBox: BoundingBox = { x: 150, y: 150, width: 50, height: 50 };

            expect(() => extractFeatures(imageData, boundingBox, 64)).toThrow();
        });
    });

    describe('extractCombinedFeatures', () => {
        it('extracts face features when landmarks are disabled', () => {
            const imageData = createTestImageData(200, 200);
            const boundingBox: BoundingBox = { x: 25, y: 25, width: 150, height: 150 };
            const keypoints: FaceKeypoint[] = [
                { x: 70, y: 70, name: 'leftEye' },
                { x: 130, y: 70, name: 'rightEye' },
            ];

            // Face-image fallback path
            const features = extractCombinedFeatures(imageData, boundingBox, keypoints, false);

            // 16*16 + 1 = 257 (face only, no eyes without full landmarks)
            expect(features.length).toBe(257);
            expect(features[features.length - 1]).toBe(1.0);
        });

        it('extracts landmark + eye features when full landmarks are available', () => {
            const imageData = createTestImageData(200, 200);
            const boundingBox: BoundingBox = { x: 25, y: 25, width: 150, height: 150 };
            const keypoints: FaceKeypoint[] = [
                { x: 70, y: 70, name: 'leftEye' },
                { x: 130, y: 70, name: 'rightEye' },
                { x: 100, y: 90, name: 'noseTip' },
            ];
            const fullLandmarks = createFullLandmarksWithValidEyes();

            const features = extractCombinedFeatures(
                imageData,
                boundingBox,
                keypoints,
                true,
                fullLandmarks,
                imageData.width,
                imageData.height
            );

            // Enhanced landmarks (30 raw) + 2 eye crops (40×20 each) + bias = 1631
            expect(features.length).toBe(1631);
            expect(features[features.length - 1]).toBe(1.0);
        });

        it('supports custom eye dimensions in landmark mode', () => {
            const imageData = createTestImageData(200, 200);
            const boundingBox: BoundingBox = { x: 25, y: 25, width: 150, height: 150 };
            const keypoints: FaceKeypoint[] = [
                { x: 70, y: 70, name: 'leftEye' },
                { x: 130, y: 70, name: 'rightEye' },
            ];
            const fullLandmarks = createFullLandmarksWithValidEyes();

            const features = extractCombinedFeatures(
                imageData,
                boundingBox,
                keypoints,
                true,
                fullLandmarks,
                imageData.width,
                imageData.height,
                20,
                10
            );

            // 30 landmark features + 2*20*10 eye pixels + 1 bias = 431
            expect(features.length).toBe(431);
        });
    });
});
