/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Face detection using MediaPipe BlazeFace detector.
 * Provides 6 keypoints for fast face detection with basic eye tracking.
 *
 * This is a faster alternative to FaceLandmarkerAdapter with less precision.
 * BlazeFace provides only 6 keypoints vs 478 landmarks from FaceLandmarker.
 *
 * BlazeFace keypoint indices:
 * - 0: right_eye (center of right eye)
 * - 1: left_eye (center of left eye)
 * - 2: nose_tip
 * - 3: mouth_center
 * - 4: right_ear_tragion
 * - 5: left_ear_tragion
 */

import {
    FaceDetector as MPFaceDetector,
    FilesetResolver,
} from '@mediapipe/tasks-vision';
import type { FaceDetectionResult, BoundingBox, FaceKeypoint } from '../types';

const DEFAULT_MODEL_PATH = '/models/blaze_face_short_range.tflite';
const DEFAULT_WASM_PATH = '/wasm';
const DEFAULT_MIN_CONFIDENCE = 0.5;
type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

const normalizeWasmPath = (wasmPath: string): string => (
    wasmPath.endsWith('/') ? wasmPath.slice(0, -1) : wasmPath
);

const shouldUseStaticVisionFileset = (): boolean => {
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.has('webcamEtLightE2E')) {
            return true;
        }
    }

    return typeof navigator !== 'undefined' && navigator.userAgent.includes('HeadlessChrome');
};

const createStaticVisionFileset = (wasmPath: string): VisionFileset => {
    const basePath = normalizeWasmPath(wasmPath);

    return {
        wasmLoaderPath: `${basePath}/vision_wasm_nosimd_internal.js`,
        wasmBinaryPath: `${basePath}/vision_wasm_nosimd_internal.wasm`,
    };
};

export interface BlazeFaceAdapterConfig {
    modelPath?: string;
    wasmPath?: string;
    minDetectionConfidence?: number;
}

/**
 * BlazeFace keypoint names in order.
 */
const KEYPOINT_NAMES = [
    'right_eye',
    'left_eye',
    'nose_tip',
    'mouth_center',
    'right_ear_tragion',
    'left_ear_tragion',
];

/**
 * Wrapper around MediaPipe BlazeFace detector for fast face detection.
 * Provides the same interface as FaceLandmarkerAdapter for drop-in replacement.
 */
export class BlazeFaceAdapter {
    private detector: MPFaceDetector | null = null;
    private readonly config: Required<BlazeFaceAdapterConfig>;

    constructor(config: BlazeFaceAdapterConfig = {}) {
        this.config = {
            modelPath: config.modelPath ?? DEFAULT_MODEL_PATH,
            wasmPath: config.wasmPath ?? DEFAULT_WASM_PATH,
            minDetectionConfidence: config.minDetectionConfidence ?? DEFAULT_MIN_CONFIDENCE,
        };
    }

    /**
     * Initialize the face detector by loading the model.
     * Must be called before detect().
     */
    async initialize(): Promise<void> {
        const vision = shouldUseStaticVisionFileset()
            ? createStaticVisionFileset(this.config.wasmPath)
            : await FilesetResolver.forVisionTasks(this.config.wasmPath);

        this.detector = await MPFaceDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: this.config.modelPath,
            },
            runningMode: 'IMAGE',
            minDetectionConfidence: this.config.minDetectionConfidence,
        });
    }

    /**
     * Check if the detector is initialized and ready to use.
     */
    isReady(): boolean {
        return this.detector !== null;
    }

    /**
     * Detect face in an image.
     *
     * @param image - The image to detect face in
     * @returns The first detected face, or null if no face is found
     */
    detect(
        image: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
    ): FaceDetectionResult | null {
        if (!this.detector) {
            console.warn('[BlazeFaceAdapter] detect() called before initialize() or after close(). Returning null.');
            return null;
        }

        const result = this.detector.detect(image);

        if (result.detections.length === 0) {
            return null;
        }

        // Get image dimensions for converting normalized keypoints to pixels
        let imageWidth: number;
        let imageHeight: number;

        if (image instanceof ImageData) {
            imageWidth = image.width;
            imageHeight = image.height;
        } else if (image instanceof HTMLVideoElement) {
            imageWidth = image.videoWidth || image.width;
            imageHeight = image.videoHeight || image.height;
        } else {
            imageWidth = image.width;
            imageHeight = image.height;
        }

        // Return the first (highest confidence) detection
        const detection = result.detections[0];
        const bbox = detection.boundingBox;

        if (!bbox) {
            return null;
        }

        const boundingBox: BoundingBox = {
            x: bbox.originX,
            y: bbox.originY,
            width: bbox.width,
            height: bbox.height,
        };

        // Convert normalized keypoints to pixel coordinates
        // Filter out mouth_center as it doesn't contribute to gaze accuracy
        const keypoints: FaceKeypoint[] = (detection.keypoints ?? [])
            .map((kp, index) => ({
                x: kp.x * imageWidth,
                y: kp.y * imageHeight,
                name: KEYPOINT_NAMES[index] || `keypoint_${index}`,
            }))
            .filter((kp) => kp.name !== 'mouth_center');

        const confidence = detection.categories?.[0]?.score ?? 0;

        return {
            boundingBox,
            confidence,
            keypoints,
        };
    }

    /**
     * Clean up resources.
     */
    close(): void {
        if (this.detector) {
            this.detector.close();
            this.detector = null;
        }
    }
}
