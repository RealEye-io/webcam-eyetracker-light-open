/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * TypeScript interfaces for Webcam ET Light.
 */

/**
 * A single calibration sample containing a webcam image and the gaze target coordinates.
 */
export interface CalibrationSample {
    /** The webcam image captured during calibration */
    image: ImageData;
    /** The X coordinate of the gaze target in CSS pixels */
    gazeX: number;
    /** The Y coordinate of the gaze target in CSS pixels */
    gazeY: number;
}

/**
 * The result of a gaze prediction.
 */
export interface GazePoint {
    /** Predicted X coordinate in CSS pixels */
    x: number;
    /** Predicted Y coordinate in CSS pixels */
    y: number;
}

/**
 * Face detection result with bounding box.
 */
export interface FaceDetectionResult {
    /** Bounding box of the detected face */
    boundingBox: BoundingBox;
    /** Confidence score of the detection (0-1) */
    confidence: number;
    /** Facial keypoints */
    keypoints: FaceKeypoint[];
}

/**
 * Bounding box for a detected face.
 */
export interface BoundingBox {
    /** X coordinate of top-left corner in pixels */
    x: number;
    /** Y coordinate of top-left corner in pixels */
    y: number;
    /** Width of bounding box in pixels */
    width: number;
    /** Height of bounding box in pixels */
    height: number;
}

/**
 * A facial keypoint from MediaPipe Face Landmarker.
 */
export interface FaceKeypoint {
    /** X coordinate in pixels */
    x: number;
    /** Y coordinate in pixels */
    y: number;
    /** Z coordinate (depth relative to face, from Face Landmarker) */
    z?: number;
    /** Name of the keypoint (e.g., 'left_eye', 'right_eye', 'nose_tip') */
    name?: string;
}

/**
 * Face blendshapes for eye/brow/nose features (22 values).
 * These are semantic features from MediaPipe Face Landmarker that describe
 * facial expressions and eye states, useful for gaze prediction.
 * Values range from 0 (not present) to 1 (fully present).
 */
export interface FaceBlendshapes {
    // Brow features
    browDownLeft: number;
    browDownRight: number;
    browInnerUp: number;
    browOuterUpLeft: number;
    browOuterUpRight: number;

    // Cheek
    cheekPuff: number;

    // Eye blink/squint/wide
    eyeBlinkLeft: number;
    eyeBlinkRight: number;
    eyeSquintLeft: number;
    eyeSquintRight: number;
    eyeWideLeft: number;
    eyeWideRight: number;

    // Eye look direction (most important for gaze!)
    eyeLookDownLeft: number;
    eyeLookDownRight: number;
    eyeLookInLeft: number;
    eyeLookInRight: number;
    eyeLookOutLeft: number;
    eyeLookOutRight: number;
    eyeLookUpLeft: number;
    eyeLookUpRight: number;

    // Nose
    noseSneerLeft: number;
    noseSneerRight: number;
}

/**
 * Configuration options for WebcamETLight.
 */
export interface WebcamETLightConfig {
    /**
     * Path to the MediaPipe Face Landmarker model bundle.
     * Defaults to '/models/face_landmarker.task'
     */
    modelPath?: string;

    /**
     * Path to the MediaPipe WASM files.
     * Defaults to '/wasm'
     */
    wasmPath?: string;

    /**
     * Face detection mode:
     * - 'landmarker': Use Face Landmarker with 478 landmarks including iris (more accurate, slower)
     * - 'blazeface': Use BlazeFace detector with 6 keypoints (faster, less precise eye tracking)
     * Defaults to 'landmarker'.
     */
    faceDetectorMode?: 'landmarker' | 'blazeface';

    /**
     * Use landmark-based features instead of face image features.
     * When true, face keypoint positions and derived geometric features
     * are used instead of the face image crop. Eye images are still used.
     * Defaults to true (landmarks + eyes is the recommended configuration).
     */
    useLandmarks?: boolean;

    /**
     * Width for eye crop (using RealEye multi-landmark bounding boxes).
     * Defaults to 30 (matching RealEye production WebGazer).
     */
    eyeWidth?: number;

    /**
     * Height for eye crop (using RealEye multi-landmark bounding boxes).
     * Defaults to 15 (matching RealEye production WebGazer).
     */
    eyeHeight?: number;

    /**
     * Ridge regression regularization parameter (lambda).
     * Defaults to 1e-5.
     */
    ridgeLambda?: number;

    /**
     * Minimum confidence score for face detection.
     * Defaults to 0.5.
     */
    minDetectionConfidence?: number;

    /**
     * Inference delegate for MediaPipe.
     * - 'GPU': WebGL acceleration (default, faster but non-deterministic)
     * - 'CPU': WASM inference (slower but potentially more deterministic)
     * Defaults to 'GPU'.
     */
    delegate?: 'GPU' | 'CPU';

    /**
     * Face detection running mode for MediaPipe Face Landmarker.
     * - 'VIDEO': Temporal tracking for smooth real-time webcam tracking (default, non-deterministic)
     * - 'IMAGE': Frame-by-frame detection without temporal tracking (deterministic, better for testing)
     * Defaults to 'VIDEO'.
     */
    runningMode?: 'VIDEO' | 'IMAGE';

}

/**
 * The state of the WebcamETLight tracker.
 */
export enum TrackerState {
    /** Tracker not initialized */
    Uninitialized = 'uninitialized',
    /** Tracker initialized, ready for calibration */
    Ready = 'ready',
    /** Tracker calibrated, ready for prediction */
    Calibrated = 'calibrated',
    /** Error state */
    Error = 'error',
}

/**
 * Error thrown when face is not detected in an image.
 */
export class FaceNotDetectedError extends Error {
    constructor(message: string = 'No face detected in the image') {
        super(message);
        this.name = 'FaceNotDetectedError';
    }
}

/**
 * Error thrown when calibration fails.
 */
export class CalibrationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CalibrationError';
    }
}

/**
 * Error thrown when tracker is not properly initialized.
 */
export class TrackerNotInitializedError extends Error {
    constructor(message: string = 'Tracker must be initialized before use') {
        super(message);
        this.name = 'TrackerNotInitializedError';
    }
}

/**
 * Error thrown when prediction is attempted before calibration.
 */
export class NotCalibratedError extends Error {
    constructor(message: string = 'Tracker must be calibrated before prediction') {
        super(message);
        this.name = 'NotCalibratedError';
    }
}
