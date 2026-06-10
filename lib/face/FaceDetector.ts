/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Face detection with configurable backend.
 *
 * Supports two modes:
 * - 'landmarker': MediaPipe Face Landmarker with 478 landmarks including iris (accurate, slower)
 * - 'blazeface': MediaPipe BlazeFace with 6 keypoints (fast, less precise)
 */

import {
    FaceLandmarkerAdapter,
    type FaceLandmarkerResult,
    LANDMARK_INDICES,
} from './FaceLandmarkerAdapter';
import { BlazeFaceAdapter } from './BlazeFaceAdapter';
import type { FaceDetectionResult } from '../types';

const DEFAULT_LANDMARKER_MODEL_PATH = '/models/face_landmarker.task';
const DEFAULT_BLAZEFACE_MODEL_PATH = '/models/blaze_face_short_range.tflite';
const DEFAULT_WASM_PATH = '/wasm';
const DEFAULT_MIN_CONFIDENCE = 0.5;

export type FaceDetectorMode = 'landmarker' | 'blazeface';

export interface FaceDetectorConfig {
    modelPath?: string;
    wasmPath?: string;
    minDetectionConfidence?: number;
    /** Detection mode: 'landmarker' (accurate) or 'blazeface' (fast) */
    mode?: FaceDetectorMode;
    /** Inference delegate: 'GPU' (default) or 'CPU' */
    delegate?: 'GPU' | 'CPU';
    /** Running mode: 'VIDEO' (default) or 'IMAGE' (deterministic) - only for landmarker mode */
    runningMode?: 'VIDEO' | 'IMAGE';
}

/**
 * Unified face detector that can use either Face Landmarker or BlazeFace backend.
 */
export class FaceDetector {
    private landmarkerAdapter: FaceLandmarkerAdapter | null = null;
    private blazefaceAdapter: BlazeFaceAdapter | null = null;
    private readonly config: Required<FaceDetectorConfig>;
    private readonly mode: FaceDetectorMode;

    constructor(config: FaceDetectorConfig = {}) {
        this.mode = config.mode ?? 'landmarker';

        // Set default model path based on mode
        const defaultModelPath = this.mode === 'landmarker'
            ? DEFAULT_LANDMARKER_MODEL_PATH
            : DEFAULT_BLAZEFACE_MODEL_PATH;

        this.config = {
            modelPath: config.modelPath ?? defaultModelPath,
            wasmPath: config.wasmPath ?? DEFAULT_WASM_PATH,
            minDetectionConfidence: config.minDetectionConfidence ?? DEFAULT_MIN_CONFIDENCE,
            mode: this.mode,
            delegate: config.delegate ?? 'GPU',
            runningMode: config.runningMode ?? 'VIDEO',
        };
    }

    /**
     * Get the current detection mode.
     */
    getMode(): FaceDetectorMode {
        return this.mode;
    }

    /**
     * Initialize the face detector by loading the model.
     * Must be called before detect().
     */
    async initialize(): Promise<void> {
        if (this.mode === 'landmarker') {
            this.landmarkerAdapter = new FaceLandmarkerAdapter({
                modelPath: this.config.modelPath,
                wasmPath: this.config.wasmPath,
                minDetectionConfidence: this.config.minDetectionConfidence,
                delegate: this.config.delegate,
                runningMode: this.config.runningMode,
            });
            await this.landmarkerAdapter.initialize();
        } else {
            this.blazefaceAdapter = new BlazeFaceAdapter({
                modelPath: this.config.modelPath,
                wasmPath: this.config.wasmPath,
                minDetectionConfidence: this.config.minDetectionConfidence,
            });
            await this.blazefaceAdapter.initialize();
        }
    }

    /**
     * Check if the detector is initialized and ready to use.
     */
    isReady(): boolean {
        if (this.mode === 'landmarker') {
            return this.landmarkerAdapter !== null && this.landmarkerAdapter.isReady();
        } else {
            return this.blazefaceAdapter !== null && this.blazefaceAdapter.isReady();
        }
    }

    /**
     * Detect faces in an image.
     *
     * @param image - The image to detect faces in (ImageData, HTMLImageElement, etc.)
     * @returns The first detected face, or null if no face is found.
     */
    detect(
        image: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
    ): FaceDetectionResult | null {
        if (this.mode === 'landmarker') {
            if (!this.landmarkerAdapter) {
                console.warn('[FaceDetector] detect() called before initialize() or after close(). Returning null.');
                return null;
            }

            const result = this.landmarkerAdapter.detect(image);

            if (!result) {
                return null;
            }

            // Return the result without allLandmarks to match the expected interface
            return {
                boundingBox: result.boundingBox,
                confidence: result.confidence,
                keypoints: result.keypoints,
            };
        } else {
            if (!this.blazefaceAdapter) {
                console.warn('[FaceDetector] detect() called before initialize() or after close(). Returning null.');
                return null;
            }

            return this.blazefaceAdapter.detect(image);
        }
    }

    /**
     * Detect faces in an image and return full landmark data.
     * This provides access to all 478 landmarks for advanced processing.
     * Only available in 'landmarker' mode.
     *
     * @param image - The image to detect faces in
     * @returns The detected face with all landmarks, or null if no face is found.
     */
    detectWithLandmarks(
        image: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
    ): FaceLandmarkerResult | null {
        if (this.mode !== 'landmarker') {
            console.warn(
                'detectWithLandmarks() is only available in landmarker mode'
            );
        }

        if (!this.landmarkerAdapter) {
            console.warn(
                '[FaceDetector] detectWithLandmarks() called before initialize() or after close(). Returning null.'
            );
            return null;
        }

        return this.landmarkerAdapter.detect(image);
    }

    /**
     * Clean up resources.
     */
    close(): void {
        if (this.landmarkerAdapter) {
            this.landmarkerAdapter.close();
            this.landmarkerAdapter = null;
        }
        if (this.blazefaceAdapter) {
            this.blazefaceAdapter.close();
            this.blazefaceAdapter = null;
        }
    }
}

// Re-export useful types and constants from the adapter
export { LANDMARK_INDICES };
export type { FaceLandmarkerResult };
