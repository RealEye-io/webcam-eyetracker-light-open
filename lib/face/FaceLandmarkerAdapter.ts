/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Face detection using MediaPipe Face Landmarker.
 * Provides 478 3D face landmarks for precise eye tracking.
 *
 * This adapter wraps MediaPipe's FaceLandmarker and converts its output
 * to the same FaceDetectionResult interface used by the rest of the library.
 *
 * Key landmark indices (from MediaPipe Face Mesh specification):
 * - Left iris center: 468
 * - Right iris center: 473
 * - Nose tip: 1
 * - Upper lip center: 13
 * - Left eye outer corner: 33
 * - Left eye inner corner: 133
 * - Right eye inner corner: 362
 * - Right eye outer corner: 263
 * - Left ear approximation (cheek): 234
 * - Right ear approximation (cheek): 454
 */

import {
    FaceLandmarker,
    FilesetResolver,
    type NormalizedLandmark,
    type Classifications,
} from '@mediapipe/tasks-vision';
import type { FaceDetectionResult, BoundingBox, FaceKeypoint, FaceBlendshapes } from '../types';

const DEFAULT_MODEL_PATH = '/models/face_landmarker.task';
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

/**
 * MediaPipe Face Mesh landmark indices for key facial features.
 * Reference: https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png
 */
export const LANDMARK_INDICES = {
    // Iris centers (most precise for eye tracking)
    LEFT_IRIS_CENTER: 468,
    RIGHT_IRIS_CENTER: 473,

    // Eye corners (for calculating eye bounding box)
    LEFT_EYE_OUTER: 33,
    LEFT_EYE_INNER: 133,
    RIGHT_EYE_INNER: 362,
    RIGHT_EYE_OUTER: 263,

    // Eye upper/lower for eye height
    LEFT_EYE_UPPER: 159,
    LEFT_EYE_LOWER: 145,
    RIGHT_EYE_UPPER: 386,
    RIGHT_EYE_LOWER: 374,

    // Face structure
    NOSE_TIP: 1,
    UPPER_LIP_CENTER: 13,
    LOWER_LIP_CENTER: 14,
    CHIN: 152,

    // Face boundary (for bounding box calculation)
    FOREHEAD_TOP: 10,
    LEFT_CHEEK: 234,
    RIGHT_CHEEK: 454,

    // Silhouette points for face boundary
    FACE_TOP: 10,
    FACE_BOTTOM: 152,
    FACE_LEFT: 234,
    FACE_RIGHT: 454,
} as const;

/**
 * RealEye eye bounding box landmark indices.
 * These use multiple landmarks per boundary to get precise min/max coordinates
 * for tight eye cropping (matches RealEye production WebGazer implementation).
 */
export const REALEYE_EYE_INDICES = {
    // Left eye: use multiple landmarks to find tight bounding box
    LEFT_MIN_X: [247, 130, 25],   // Landmarks for leftmost X
    LEFT_MIN_Y: [222, 223, 224],  // Landmarks for topmost Y
    LEFT_MAX_X: [190, 243, 233],  // Landmarks for rightmost X
    LEFT_MAX_Y: [25, 23, 112],    // Landmarks for bottommost Y

    // Right eye: use multiple landmarks to find tight bounding box
    RIGHT_MIN_X: [414, 463, 453], // Landmarks for leftmost X
    RIGHT_MIN_Y: [442, 443, 444], // Landmarks for topmost Y
    RIGHT_MAX_X: [467, 359, 255], // Landmarks for rightmost X
    RIGHT_MAX_Y: [341, 253, 255], // Landmarks for bottommost Y
} as const;

/** Eye input dimensions for ridge regression (source crop is resized to this) */
export const EYE_INPUT_WIDTH = 40;
export const EYE_INPUT_HEIGHT = 20;

export interface FaceLandmarkerAdapterConfig {
    modelPath?: string;
    wasmPath?: string;
    minDetectionConfidence?: number;
    /** Number of faces to detect (default 1) */
    numFaces?: number;
    /** Inference delegate: 'GPU' (default, uses WebGL) or 'CPU' */
    delegate?: 'GPU' | 'CPU';

    /** Running mode: 'VIDEO' (default, temporal tracking) or 'IMAGE' (deterministic, no tracking) */
    runningMode?: 'VIDEO' | 'IMAGE';
}

/**
 * Head pose angles extracted from the facial transformation matrix.
 * All angles are in radians.
 */
export interface HeadPose {
    /** Yaw angle (turning left/right). Positive = looking right. */
    yaw: number;
    /** Pitch angle (looking up/down). Positive = looking up. */
    pitch: number;
    /** Roll angle (tilting head sideways). Positive = tilting right. */
    roll: number;
    /** Translation X (horizontal position relative to camera center) */
    translationX: number;
    /** Translation Y (vertical position relative to camera center) */
    translationY: number;
    /** Translation Z (distance from camera, smaller = closer) */
    translationZ: number;
}

/**
 * Extended face detection result with full landmarks available.
 */
export interface FaceLandmarkerResult extends FaceDetectionResult {
    /** All 478 face landmarks (normalized 0-1 coordinates) */
    allLandmarks: NormalizedLandmark[];
    /** Face blendshapes (52 semantic features from MediaPipe) */
    blendshapes?: FaceBlendshapes;
    /** Facial transformation matrix (4x4) for head pose estimation */
    transformationMatrix?: number[][];
    /** Extracted head pose angles and position */
    headPose?: HeadPose;
}

/**
 * Wrapper around MediaPipe Face Landmarker for detecting faces with 478 landmarks.
 * Uses VIDEO mode for real-time webcam processing with temporal tracking.
 * Provides the same interface as FaceDetector for drop-in replacement.
 */
export class FaceLandmarkerAdapter {
    private landmarker: FaceLandmarker | null = null;
    private readonly config: Required<FaceLandmarkerAdapterConfig>;
    private lastTimestamp: number = 0;
    private hasLoggedHeadPose: boolean = false;
    private hasLoggedNoMatrix: boolean = false;

    constructor(config: FaceLandmarkerAdapterConfig = {}) {
        this.config = {
            modelPath: config.modelPath ?? DEFAULT_MODEL_PATH,
            wasmPath: config.wasmPath ?? DEFAULT_WASM_PATH,
            minDetectionConfidence: config.minDetectionConfidence ?? DEFAULT_MIN_CONFIDENCE,
            numFaces: config.numFaces ?? 1,
            delegate: config.delegate ?? 'CPU',
            runningMode: config.runningMode ?? 'VIDEO',
        };
    }

    /**
     * Initialize the face landmarker by loading the model.
     * Uses VIDEO mode for optimal webcam performance with temporal tracking.
     * Uses configurable delegate (GPU by default for WebGL acceleration).
     * Must be called before detect().
     */
    async initialize(): Promise<void> {
        const vision = shouldUseStaticVisionFileset()
            ? createStaticVisionFileset(this.config.wasmPath)
            : await FilesetResolver.forVisionTasks(this.config.wasmPath);

        this.landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: this.config.modelPath,
                delegate: this.config.delegate,
            },
            runningMode: this.config.runningMode,
            numFaces: this.config.numFaces,
            minFaceDetectionConfidence: this.config.minDetectionConfidence,
            minTrackingConfidence: this.config.minDetectionConfidence,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true, // Enable head pose matrices
        });
    }

    /**
     * Check if the landmarker is initialized and ready to use.
     */
    isReady(): boolean {
        return this.landmarker !== null;
    }

    /**
     * Detect face landmarks in a video frame.
     * Uses detectForVideo with monotonically increasing timestamps for VIDEO mode.
     *
     * @param image - The video frame to detect faces in
     * @returns The first detected face with landmarks, or null if no face is found
     */
    detect(
        image: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
    ): FaceLandmarkerResult | null {
        if (!this.landmarker) {
            console.warn('[FaceLandmarkerAdapter] detect() called before initialize() or after close(). Returning null.');
            return null;
        }

        // Get image dimensions for converting normalized coordinates to pixels
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

        // Use detectForVideo or detect based on runningMode
        let result;
        if (this.config.runningMode === 'IMAGE') {
            // IMAGE mode: deterministic, no temporal tracking
            result = this.landmarker.detect(image);
        } else {
            // VIDEO mode: temporal tracking with monotonically increasing timestamp
            const now = performance.now();
            const timestamp = Math.max(now, this.lastTimestamp + 1);
            this.lastTimestamp = timestamp;
            result = this.landmarker.detectForVideo(image, timestamp);
        }

        if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
            return null;
        }

        // Get the first face's landmarks
        const landmarks = result.faceLandmarks[0];

        // Calculate bounding box from face silhouette landmarks
        const boundingBox = this.calculateBoundingBox(landmarks, imageWidth, imageHeight);

        // Extract key landmarks as FaceKeypoint objects (converted to pixels)
        const keypoints = this.extractKeypoints(landmarks, imageWidth, imageHeight);

        // FaceLandmarker doesn't provide a confidence score directly,
        // but if face is detected, we consider it high confidence
        const confidence = 0.95;

        // Extract blendshapes if available
        const blendshapes = this.extractBlendshapes(result.faceBlendshapes?.[0]);

        // Extract transformation matrix and head pose if available
        let transformationMatrix: number[][] | undefined;
        let headPose: HeadPose | undefined;
        if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
            const matrix = result.facialTransformationMatrixes[0];
            if (matrix && matrix.data) {
                // MediaPipe returns a flat Float32Array of 16 elements (4x4 matrix)
                // Convert to 4x4 array (row-major order)
                transformationMatrix = [
                    [matrix.data[0], matrix.data[1], matrix.data[2], matrix.data[3]],
                    [matrix.data[4], matrix.data[5], matrix.data[6], matrix.data[7]],
                    [matrix.data[8], matrix.data[9], matrix.data[10], matrix.data[11]],
                    [matrix.data[12], matrix.data[13], matrix.data[14], matrix.data[15]],
                ];
                headPose = this.extractHeadPose(transformationMatrix);
                this.hasLoggedHeadPose = true;
            }
        } else {
            this.hasLoggedNoMatrix = true;
        }

        return {
            boundingBox,
            confidence,
            keypoints,
            allLandmarks: landmarks,
            blendshapes,
            transformationMatrix,
            headPose,
        };
    }

    /**
     * Extract head pose (yaw, pitch, roll) from transformation matrix.
     * The matrix is a 4x4 affine transformation in row-major order.
     * Rotation is extracted from the 3x3 rotation submatrix.
     */
    private extractHeadPose(matrix: number[][]): HeadPose {
        // Extract rotation matrix (top-left 3x3)
        const r00 = matrix[0][0], r01 = matrix[0][1];
        const r10 = matrix[1][0], r11 = matrix[1][1];
        const r20 = matrix[2][0], r21 = matrix[2][1], r22 = matrix[2][2];

        // Extract Euler angles from rotation matrix (assuming XYZ order)
        // Reference: https://www.geometrictools.com/Documentation/EulerAngles.pdf
        let pitch: number, yaw: number, roll: number;

        // Check for gimbal lock
        if (Math.abs(r20) < 0.99999) {
            // Normal case
            pitch = Math.asin(-r20);
            yaw = Math.atan2(r10, r00);
            roll = Math.atan2(r21, r22);
        } else {
            // Gimbal lock: r20 is ±1
            pitch = r20 < 0 ? Math.PI / 2 : -Math.PI / 2;
            yaw = Math.atan2(-r01, r11);
            roll = 0;
        }

        // Extract translation (last column of the matrix)
        const translationX = matrix[0][3];
        const translationY = matrix[1][3];
        const translationZ = matrix[2][3];

        return {
            yaw,
            pitch,
            roll,
            translationX,
            translationY,
            translationZ,
        };
    }

    /**
     * Calculate face bounding box from landmarks.
     */
    private calculateBoundingBox(
        landmarks: NormalizedLandmark[],
        imageWidth: number,
        imageHeight: number
    ): BoundingBox {
        // Find min/max coordinates from all landmarks
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const lm of landmarks) {
            const x = lm.x * imageWidth;
            const y = lm.y * imageHeight;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        // Add small padding (5%)
        const width = maxX - minX;
        const height = maxY - minY;
        const paddingX = width * 0.05;
        const paddingY = height * 0.05;

        return {
            x: Math.max(0, minX - paddingX),
            y: Math.max(0, minY - paddingY),
            width: width + paddingX * 2,
            height: height + paddingY * 2,
        };
    }

    /**
     * Extract key landmarks as FaceKeypoint objects.
     * Maps 478 landmarks to the 6 key points expected by the feature extractor,
     * using iris centers for precise eye positioning.
     */
    private extractKeypoints(
        landmarks: NormalizedLandmark[],
        imageWidth: number,
        imageHeight: number
    ): FaceKeypoint[] {
        const toPixel = (lm: NormalizedLandmark): { x: number; y: number; z?: number } => ({
            x: lm.x * imageWidth,
            y: lm.y * imageHeight,
            z: lm.z, // Keep z for potential future use
        });

        // Map to the same keypoint structure as BlazeFace
        // Using iris centers for more precise eye positioning
        const keypoints: FaceKeypoint[] = [];

        // Right eye (using iris center - index 473)
        const rightIris = landmarks[LANDMARK_INDICES.RIGHT_IRIS_CENTER];
        if (rightIris) {
            const pos = toPixel(rightIris);
            keypoints.push({ x: pos.x, y: pos.y, name: 'right_eye' });
        }

        // Left eye (using iris center - index 468)
        const leftIris = landmarks[LANDMARK_INDICES.LEFT_IRIS_CENTER];
        if (leftIris) {
            const pos = toPixel(leftIris);
            keypoints.push({ x: pos.x, y: pos.y, name: 'left_eye' });
        }

        // Nose tip (index 1)
        const nose = landmarks[LANDMARK_INDICES.NOSE_TIP];
        if (nose) {
            const pos = toPixel(nose);
            keypoints.push({ x: pos.x, y: pos.y, name: 'nose_tip' });
        }

        // Note: mouth_center is intentionally excluded from keypoints
        // as it doesn't contribute to gaze prediction accuracy

        // Right ear approximation (right cheek - index 454)
        const rightCheek = landmarks[LANDMARK_INDICES.RIGHT_CHEEK];
        if (rightCheek) {
            const pos = toPixel(rightCheek);
            keypoints.push({ x: pos.x, y: pos.y, name: 'right_ear_tragion' });
        }

        // Left ear approximation (left cheek - index 234)
        const leftCheek = landmarks[LANDMARK_INDICES.LEFT_CHEEK];
        if (leftCheek) {
            const pos = toPixel(leftCheek);
            keypoints.push({ x: pos.x, y: pos.y, name: 'left_ear_tragion' });
        }

        return keypoints;
    }

    /**
     * Get eye bounding box from landmarks for more precise eye cropping.
     * Returns a box that encompasses the eye based on corner landmarks.
     *
     * @param landmarks - All face landmarks (normalized)
     * @param eye - 'left' or 'right'
     * @param imageWidth - Image width in pixels
     * @param imageHeight - Image height in pixels
     * @param padding - Extra padding as a fraction of eye size (default 0.3)
     * @returns Bounding box for the eye region
     */
    getEyeBoundingBox(
        landmarks: NormalizedLandmark[],
        eye: 'left' | 'right',
        imageWidth: number,
        imageHeight: number,
        padding: number = 0.3
    ): BoundingBox {
        const indices = eye === 'left'
            ? {
                outer: LANDMARK_INDICES.LEFT_EYE_OUTER,
                inner: LANDMARK_INDICES.LEFT_EYE_INNER,
                upper: LANDMARK_INDICES.LEFT_EYE_UPPER,
                lower: LANDMARK_INDICES.LEFT_EYE_LOWER,
            }
            : {
                outer: LANDMARK_INDICES.RIGHT_EYE_OUTER,
                inner: LANDMARK_INDICES.RIGHT_EYE_INNER,
                upper: LANDMARK_INDICES.RIGHT_EYE_UPPER,
                lower: LANDMARK_INDICES.RIGHT_EYE_LOWER,
            };

        const outer = landmarks[indices.outer];
        const inner = landmarks[indices.inner];
        const upper = landmarks[indices.upper];
        const lower = landmarks[indices.lower];

        // Calculate eye dimensions
        const eyeWidth = Math.abs(inner.x - outer.x) * imageWidth;
        const eyeHeight = Math.abs(lower.y - upper.y) * imageHeight;
        const eyeCenterX = ((outer.x + inner.x) / 2) * imageWidth;
        const eyeCenterY = ((upper.y + lower.y) / 2) * imageHeight;

        // Make square crop based on larger dimension
        const size = Math.max(eyeWidth, eyeHeight);
        const paddedSize = size * (1 + padding * 2);

        return {
            x: eyeCenterX - paddedSize / 2,
            y: eyeCenterY - paddedSize / 2,
            width: paddedSize,
            height: paddedSize,
        };
    }

    /**
     * Get eye bounding box using RealEye's precise multi-landmark approach.
     * Uses multiple landmarks per boundary to find tight min/max coordinates
     * for non-square eye cropping (matches RealEye production WebGazer).
     *
     * @param landmarks - All face landmarks (normalized)
     * @param eye - 'left' or 'right'
     * @param imageWidth - Image width in pixels
     * @param imageHeight - Image height in pixels
     * @returns Bounding box for the eye region (non-square, tight fit)
     */
    getEyeBoundingBoxRealEye(
        landmarks: NormalizedLandmark[],
        eye: 'left' | 'right',
        imageWidth: number,
        imageHeight: number
    ): BoundingBox {
        const indices = eye === 'left'
            ? {
                minX: REALEYE_EYE_INDICES.LEFT_MIN_X,
                minY: REALEYE_EYE_INDICES.LEFT_MIN_Y,
                maxX: REALEYE_EYE_INDICES.LEFT_MAX_X,
                maxY: REALEYE_EYE_INDICES.LEFT_MAX_Y,
            }
            : {
                minX: REALEYE_EYE_INDICES.RIGHT_MIN_X,
                minY: REALEYE_EYE_INDICES.RIGHT_MIN_Y,
                maxX: REALEYE_EYE_INDICES.RIGHT_MAX_X,
                maxY: REALEYE_EYE_INDICES.RIGHT_MAX_Y,
            };

        // Find minimum X from all minX landmarks
        const minX = Math.min(
            ...indices.minX.map(i => landmarks[i].x * imageWidth)
        );

        // Find minimum Y from all minY landmarks
        const minY = Math.min(
            ...indices.minY.map(i => landmarks[i].y * imageHeight)
        );

        // Find maximum X from all maxX landmarks
        const maxX = Math.max(
            ...indices.maxX.map(i => landmarks[i].x * imageWidth)
        );

        // Find maximum Y from all maxY landmarks
        const maxY = Math.max(
            ...indices.maxY.map(i => landmarks[i].y * imageHeight)
        );

        return {
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(maxX - minX),
            height: Math.round(maxY - minY),
        };
    }

    /**
     * Extract blendshapes from MediaPipe classifications to our typed structure.
     * Returns only the 22 eye/brow/nose related blendshapes we need for gaze prediction.
     */
    private extractBlendshapes(classifications?: Classifications): FaceBlendshapes | undefined {
        if (!classifications || !classifications.categories) {
            return undefined;
        }

        const blendshapeMap: Record<string, number> = {};
        for (const cat of classifications.categories) {
            if (cat.categoryName) {
                blendshapeMap[cat.categoryName] = cat.score;
            }
        }

        return {
            browDownLeft: blendshapeMap['browDownLeft'] ?? 0,
            browDownRight: blendshapeMap['browDownRight'] ?? 0,
            browInnerUp: blendshapeMap['browInnerUp'] ?? 0,
            browOuterUpLeft: blendshapeMap['browOuterUpLeft'] ?? 0,
            browOuterUpRight: blendshapeMap['browOuterUpRight'] ?? 0,
            cheekPuff: blendshapeMap['cheekPuff'] ?? 0,
            eyeBlinkLeft: blendshapeMap['eyeBlinkLeft'] ?? 0,
            eyeBlinkRight: blendshapeMap['eyeBlinkRight'] ?? 0,
            eyeLookDownLeft: blendshapeMap['eyeLookDownLeft'] ?? 0,
            eyeLookDownRight: blendshapeMap['eyeLookDownRight'] ?? 0,
            eyeLookInLeft: blendshapeMap['eyeLookInLeft'] ?? 0,
            eyeLookInRight: blendshapeMap['eyeLookInRight'] ?? 0,
            eyeLookOutLeft: blendshapeMap['eyeLookOutLeft'] ?? 0,
            eyeLookOutRight: blendshapeMap['eyeLookOutRight'] ?? 0,
            eyeLookUpLeft: blendshapeMap['eyeLookUpLeft'] ?? 0,
            eyeLookUpRight: blendshapeMap['eyeLookUpRight'] ?? 0,
            eyeSquintLeft: blendshapeMap['eyeSquintLeft'] ?? 0,
            eyeSquintRight: blendshapeMap['eyeSquintRight'] ?? 0,
            eyeWideLeft: blendshapeMap['eyeWideLeft'] ?? 0,
            eyeWideRight: blendshapeMap['eyeWideRight'] ?? 0,
            noseSneerLeft: blendshapeMap['noseSneerLeft'] ?? 0,
            noseSneerRight: blendshapeMap['noseSneerRight'] ?? 0,
        };
    }

    /**
     * Clean up resources.
     */
    close(): void {
        if (this.landmarker) {
            this.landmarker.close();
            this.landmarker = null;
        }
    }
}
