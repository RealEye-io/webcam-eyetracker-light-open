/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * RealEye Webcam EyeTracker Light Open — WebcamETLight class: lightweight browser-based webcam eye-tracker using MediaPipe and ridge regression.
 *
 * This is the main class that provides:
 * - 17-point calibration (corners, edges, center, and intermediate regions)
 * - Gaze prediction for webcam images
 *
 * Usage:
 *   const tracker = new WebcamETLight();
 *   await tracker.initialize();
 *   await tracker.calibrate(samples);
 *   const gaze = await tracker.predict(image);
 */

import { FaceDetector, type FaceLandmarkerResult } from './face/FaceDetector';
import { EYE_INPUT_WIDTH, EYE_INPUT_HEIGHT, type HeadPose } from './face/FaceLandmarkerAdapter';
import { extractCombinedFeatures, extractAugmentedFeatures, getCombinedFeatureCount } from './features/FeatureExtractor';
import { ridgeOptimized, dotOptimized } from './math/matrix-optimized';
import type { Vector, Matrix } from './math/matrix';
import {
    TrackerState,
    CalibrationError,
    TrackerNotInitializedError,
    NotCalibratedError,
    type CalibrationSample,
    type GazePoint,
    type WebcamETLightConfig,
    type FaceDetectionResult,
} from './types';

// CDN URLs for MediaPipe models and WASM runtime
const MEDIAPIPE_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const FACE_LANDMARKER_CDN = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const BLAZE_FACE_CDN = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const DEFAULT_CONFIG: Required<WebcamETLightConfig> = {
    modelPath: FACE_LANDMARKER_CDN,
    wasmPath: MEDIAPIPE_WASM_CDN,
    faceDetectorMode: 'landmarker', // Use Face Landmarker with iris tracking
    useLandmarks: true, // Use landmarks + eye images
    eyeWidth: EYE_INPUT_WIDTH, // Eye crop width from constants
    eyeHeight: EYE_INPUT_HEIGHT, // Eye crop height from constants
    ridgeLambda: 1e-5, // Default regularization (insensitive - see experiments)
    minDetectionConfidence: 0.5,
    delegate: 'GPU', // WebGL for performance (note: non-deterministic)
    runningMode: 'VIDEO', // VIDEO mode for smooth webcam tracking (non-deterministic)
};

const MIN_CALIBRATION_SAMPLES = 5;

/**
 * RealEye Webcam EyeTracker Light Open — lightweight browser-based webcam eye-tracker using MediaPipe and ridge regression.
 */
export class WebcamETLight {
    private config: Required<WebcamETLightConfig>;
    private faceDetector: FaceDetector;
    private state: TrackerState = TrackerState.Uninitialized;

    // Ridge regression coefficients
    private coefficientsX: Vector | null = null;
    private coefficientsY: Vector | null = null;

    // Last calibration training time in milliseconds
    private lastTrainingTimeMs: number = 0;

    // Mean head pose from calibration (for head pose compensation)
    private calibrationMeanHeadPose: HeadPose | null = null;

    // Head pose compensation factors (pixels per radian of rotation)
    // These are learned from empirical testing
    private readonly HEAD_POSE_YAW_FACTOR = 500; // pixels per radian of yaw
    private readonly HEAD_POSE_PITCH_FACTOR = 400; // pixels per radian of pitch

    constructor(config: WebcamETLightConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Determine model path based on mode if not explicitly provided
        let modelPath = this.config.modelPath;
        if (!config.modelPath) {
            modelPath = this.config.faceDetectorMode === 'blazeface'
                ? BLAZE_FACE_CDN
                : FACE_LANDMARKER_CDN;
        }

        console.log('[WebcamETLight] Config:', {
            modelPath,
            wasmPath: this.config.wasmPath,
            mode: this.config.faceDetectorMode
        });

        this.faceDetector = new FaceDetector({
            modelPath: modelPath,
            wasmPath: this.config.wasmPath,
            minDetectionConfidence: this.config.minDetectionConfidence,
            mode: this.config.faceDetectorMode,
            delegate: this.config.delegate,
            runningMode: this.config.runningMode,
        });
    }

    /**
     * Initialize the tracker by loading the face detection model.
     * Must be called before calibrate() or predict().
     */
    async initialize(): Promise<void> {
        try {
            await this.faceDetector.initialize();
            this.state = TrackerState.Ready;
        } catch (error) {
            this.state = TrackerState.Error;
            throw error;
        }
    }

    /**
     * Get the current state of the tracker.
     */
    getState(): TrackerState {
        return this.state;
    }

    /**
     * Check if the tracker is initialized and ready.
     */
    isReady(): boolean {
        return this.state !== TrackerState.Uninitialized && this.state !== TrackerState.Error;
    }

    /**
     * Check if the tracker is calibrated.
     */
    isCalibrated(): boolean {
        return this.state === TrackerState.Calibrated;
    }

    /**
     * Detect face in an image and return the detection result.
     * Useful for visualization or debugging.
     * In landmarker mode, returns full landmarks for enhanced feature extraction.
     *
     * @param image - The image to detect face in
     * @returns The face detection result, or null if no face is found
     */
    detectFace(
        image: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
    ): FaceDetectionResult | FaceLandmarkerResult | null {
        if (this.state === TrackerState.Uninitialized) {
            throw new TrackerNotInitializedError();
        }
        // Use detectWithLandmarks for landmarker mode to get full landmarks
        if (this.config.faceDetectorMode === 'landmarker') {
            return this.faceDetector.detectWithLandmarks(image);
        }
        return this.faceDetector.detect(image);
    }

    /**
     * Calibrate the tracker using calibration samples.
     *
     * Requires at least 5 samples (ideally: 4 corners + center).
     * Each sample should have a webcam image and the gaze target coordinates.
     *
     * @param samples - Array of calibration samples with images and gaze coordinates
     * @throws CalibrationError if calibration fails
     */
    calibrate(samples: CalibrationSample[]): void {
        console.log('[Tracker] calibrate() called with', samples.length, 'samples');

        if (this.state === TrackerState.Uninitialized) {
            throw new TrackerNotInitializedError();
        }

        if (samples.length < MIN_CALIBRATION_SAMPLES) {
            throw new CalibrationError(
                `At least ${MIN_CALIBRATION_SAMPLES} calibration samples required, got ${samples.length}`
            );
        }

        // Use enhanced landmarks when in landmarker mode
        const useEnhancedLandmarks = this.config.faceDetectorMode === 'landmarker';
        const featureCount = getCombinedFeatureCount(
            this.config.useLandmarks,
            useEnhancedLandmarks,
            this.config.eyeWidth,
            this.config.eyeHeight
        );
        const eyeMode = `eye=${this.config.eyeWidth}x${this.config.eyeHeight}`;
        const featureMode = this.config.useLandmarks
            ? (useEnhancedLandmarks ? 'enhanced-landmarks' : 'landmarks')
            : 'face-image';
        console.log('[Tracker] Feature count:', featureCount, `(${featureMode}, ${eyeMode})`);
        const X: Matrix = [];
        const yX: number[] = [];
        const yY: number[] = [];
        const failedSamples: number[] = [];
        const calibrationHeadPoses: HeadPose[] = [];

        // Extract features from each calibration sample
        console.log('[Tracker] Processing samples...');
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            console.log(`[Tracker] Sample ${i}: detecting face...`);

            // Use detectWithLandmarks for landmarker mode to get full 478 landmarks
            let detection: FaceLandmarkerResult | null = null;
            if (this.config.faceDetectorMode === 'landmarker') {
                detection = this.faceDetector.detectWithLandmarks(sample.image);
            } else {
                detection = this.faceDetector.detect(sample.image) as FaceLandmarkerResult;
            }

            if (!detection) {
                console.log(`[Tracker] Sample ${i}: NO FACE DETECTED`);
                failedSamples.push(i);
                continue;
            }

            // Collect head pose for computing mean
            if (detection.headPose) {
                calibrationHeadPoses.push(detection.headPose);
            }

            // Get image dimensions for landmark coordinate conversion
            const imageWidth = sample.image.width;
            const imageHeight = sample.image.height;

            // Use augmented extraction if full landmarks available (landmarker mode)
            if (detection.allLandmarks && detection.allLandmarks.length >= 478) {
                const spatiallyAugmentedFeatures = extractAugmentedFeatures(
                    sample.image,
                    detection.boundingBox,
                    detection.keypoints,
                    detection.allLandmarks,
                    imageWidth,
                    imageHeight,
                    this.config.eyeWidth,
                    this.config.eyeHeight,
                    detection.blendshapes,
                    detection.headPose
                );

                // Add spatially augmented samples (no head pose augmentation - it degraded accuracy)
                for (const features of spatiallyAugmentedFeatures) {
                    if (features.length !== featureCount) {
                        throw new CalibrationError(
                            `Feature count mismatch: expected ${featureCount}, got ${features.length}`
                        );
                    }
                    X.push(features);
                    yX.push(sample.gazeX);
                    yY.push(sample.gazeY);
                }
                console.log(`[Tracker] Sample ${i}: ${spatiallyAugmentedFeatures.length} augmented features extracted`);
            } else {
                // Fallback to single feature extraction
                const features = extractCombinedFeatures(
                    sample.image,
                    detection.boundingBox,
                    detection.keypoints,
                    this.config.useLandmarks,
                    detection.allLandmarks,
                    imageWidth,
                    imageHeight,
                    this.config.eyeWidth,
                    this.config.eyeHeight,
                    detection.blendshapes,
                    detection.headPose
                );

                if (features.length !== featureCount) {
                    throw new CalibrationError(
                        `Feature count mismatch: expected ${featureCount}, got ${features.length}`
                    );
                }
                X.push(features);
                yX.push(sample.gazeX);
                yY.push(sample.gazeY);
                console.log(`[Tracker] Sample ${i}: features extracted (${featureCount} features)`);
            }
        }

        if (failedSamples.length > 0) {
            throw new CalibrationError(
                `Face not detected in ${failedSamples.length} calibration sample(s): indices ${failedSamples.join(', ')}`
            );
        }

        if (X.length < MIN_CALIBRATION_SAMPLES) {
            throw new CalibrationError(
                `Not enough valid samples after face detection. Need ${MIN_CALIBRATION_SAMPLES}, got ${X.length}`
            );
        }

        // Train ridge regression models for X and Y coordinates
        console.log('[Tracker] Training ridge regression...');
        try {
            const startTime = performance.now();
            this.coefficientsX = ridgeOptimized(X, yX, this.config.ridgeLambda);
            console.log('[Tracker] X coefficients computed');
            this.coefficientsY = ridgeOptimized(X, yY, this.config.ridgeLambda);
            this.lastTrainingTimeMs = performance.now() - startTime;
            console.log(`[Tracker] Y coefficients computed (training took ${this.lastTrainingTimeMs.toFixed(2)}ms)`);

            // Compute mean head pose from calibration samples for head pose compensation
            if (calibrationHeadPoses.length > 0) {
                this.calibrationMeanHeadPose = this.computeMeanHeadPose(calibrationHeadPoses);
                // Compute head pose range to understand head movement during calibration
                const yaws = calibrationHeadPoses.map(p => p.yaw * 180 / Math.PI);
                const pitches = calibrationHeadPoses.map(p => p.pitch * 180 / Math.PI);
                const yawRange = Math.max(...yaws) - Math.min(...yaws);
                const pitchRange = Math.max(...pitches) - Math.min(...pitches);
                console.log('[Tracker] Mean head pose computed:', {
                    yaw: (this.calibrationMeanHeadPose.yaw * 180 / Math.PI).toFixed(1) + '°',
                    pitch: (this.calibrationMeanHeadPose.pitch * 180 / Math.PI).toFixed(1) + '°',
                    roll: (this.calibrationMeanHeadPose.roll * 180 / Math.PI).toFixed(1) + '°',
                });
                console.log('[Tracker] Head pose range during calibration:', {
                    yawRange: yawRange.toFixed(1) + '°',
                    pitchRange: pitchRange.toFixed(1) + '°',
                    samples: calibrationHeadPoses.length,
                });
            } else {
                console.log('[Tracker] No head pose data available for compensation');
                this.calibrationMeanHeadPose = null;
            }

            this.state = TrackerState.Calibrated;
            console.log('[Tracker] Calibration COMPLETE! State:', this.state);
        } catch (error) {
            this.state = TrackerState.Error;
            throw new CalibrationError(
                `Ridge regression failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Predict gaze coordinates for a webcam image.
     *
     * @param image - The webcam image to predict gaze for
     * @returns The predicted gaze point, or null if no face is detected
     * @throws NotCalibratedError if tracker is not calibrated
     * @throws TrackerNotInitializedError if tracker is not initialized
     */
    predict(
        image: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
    ): GazePoint | null {
        if (this.state === TrackerState.Uninitialized) {
            throw new TrackerNotInitializedError();
        }

        if (this.state !== TrackerState.Calibrated) {
            throw new NotCalibratedError();
        }

        if (!this.coefficientsX || !this.coefficientsY) {
            throw new NotCalibratedError('Coefficients not available');
        }

        // Detect face - use detectWithLandmarks for landmarker mode
        let detection: FaceLandmarkerResult | null = null;
        if (this.config.faceDetectorMode === 'landmarker') {
            detection = this.faceDetector.detectWithLandmarks(image);
        } else {
            detection = this.faceDetector.detect(image) as FaceLandmarkerResult;
        }

        if (!detection) {
            // No face detected - return null as per requirements
            return null;
        }

        return this.predictWithDetection(image, detection);
    }

    /**
     * Predict gaze coordinates using a pre-computed face detection.
     * This avoids redundant face detection when the caller already has the detection result.
     *
     * @param image - The webcam image to predict gaze for
     * @param detection - The face detection result from detectFace()
     * @returns The predicted gaze point
     * @throws NotCalibratedError if tracker is not calibrated
     * @throws TrackerNotInitializedError if tracker is not initialized
     */
    predictWithDetection(
        image: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
        detection: FaceDetectionResult | FaceLandmarkerResult
    ): GazePoint {
        if (this.state === TrackerState.Uninitialized) {
            throw new TrackerNotInitializedError();
        }

        if (this.state !== TrackerState.Calibrated) {
            throw new NotCalibratedError();
        }

        if (!this.coefficientsX || !this.coefficientsY) {
            throw new NotCalibratedError('Coefficients not available');
        }

        // Convert to ImageData if needed
        const imageData = this.toImageData(image);

        // Get full landmarks if available (from FaceLandmarkerResult)
        const fullLandmarks = 'allLandmarks' in detection ? detection.allLandmarks : undefined;
        const blendshapes = 'blendshapes' in detection ? detection.blendshapes : undefined;
        const headPose = 'headPose' in detection ? detection.headPose : undefined;

        // Extract combined features (face + eyes, or landmarks + eyes)
        const features = extractCombinedFeatures(
            imageData,
            detection.boundingBox,
            detection.keypoints,
            this.config.useLandmarks,
            fullLandmarks,
            imageData.width,
            imageData.height,
            this.config.eyeWidth,
            this.config.eyeHeight,
            blendshapes,
            headPose
        );

        // Predict X and Y coordinates
        const rawX = dotOptimized(features, this.coefficientsX);
        const rawY = dotOptimized(features, this.coefficientsY);

        // Apply head pose compensation if available
        const { x, y } = this.applyHeadPoseCompensation(rawX, rawY, headPose);

        return { x, y };
    }

    /**
     * Convert various image types to ImageData.
     */
    private toImageData(
        image: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
    ): ImageData {
        if (image instanceof ImageData) {
            return image;
        }

        // Create a canvas to extract ImageData
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('Failed to create canvas context');
        }

        if (image instanceof HTMLVideoElement) {
            canvas.width = image.videoWidth;
            canvas.height = image.videoHeight;
        } else {
            canvas.width = image.width;
            canvas.height = image.height;
        }

        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    /**
     * Get the training time from the last calibration in milliseconds.
     * Returns 0 if tracker hasn't been calibrated.
     */
    getLastTrainingTimeMs(): number {
        return this.lastTrainingTimeMs;
    }

    /**
     * Get the current configuration.
     */
    getConfig(): Required<WebcamETLightConfig> {
        return { ...this.config };
    }

    /**
     * Reset the tracker to pre-calibration state.
     */
    reset(): void {
        this.coefficientsX = null;
        this.coefficientsY = null;
        this.lastTrainingTimeMs = 0;
        this.calibrationMeanHeadPose = null;
        if (this.state === TrackerState.Calibrated) {
            this.state = TrackerState.Ready;
        }
    }

    /**
     * Clean up resources.
     */
    dispose(): void {
        this.faceDetector.close();
        this.coefficientsX = null;
        this.coefficientsY = null;
        this.lastTrainingTimeMs = 0;
        this.calibrationMeanHeadPose = null;
        this.state = TrackerState.Uninitialized;
    }

    /**
     * Compute mean head pose from an array of head poses.
     */
    private computeMeanHeadPose(poses: HeadPose[]): HeadPose {
        const n = poses.length;
        return {
            yaw: poses.reduce((sum, p) => sum + p.yaw, 0) / n,
            pitch: poses.reduce((sum, p) => sum + p.pitch, 0) / n,
            roll: poses.reduce((sum, p) => sum + p.roll, 0) / n,
            translationX: poses.reduce((sum, p) => sum + p.translationX, 0) / n,
            translationY: poses.reduce((sum, p) => sum + p.translationY, 0) / n,
            translationZ: poses.reduce((sum, p) => sum + p.translationZ, 0) / n,
        };
    }

    /**
     * Apply head pose compensation to a gaze prediction.
     * Adjusts gaze based on the difference between current head pose and calibration mean.
     */
    private applyHeadPoseCompensation(
        gazeX: number,
        gazeY: number,
        _currentHeadPose: HeadPose | undefined
    ): { x: number; y: number } {
        // DISABLED: Linear compensation doesn't work well.
        // The relationship between head rotation and gaze offset is complex
        // and depends on screen distance, size, and individual characteristics.
        // TODO: Implement learned compensation factors from calibration data.
        return { x: gazeX, y: gazeY };

        // Original implementation (keeping for reference):
        /*
        // If no head pose data available, return original gaze
        if (!this.calibrationMeanHeadPose || !currentHeadPose) {
            return { x: gazeX, y: gazeY };
        }

        // Compute head pose delta from calibration mean
        const deltaYaw = currentHeadPose.yaw - this.calibrationMeanHeadPose.yaw;
        const deltaPitch = currentHeadPose.pitch - this.calibrationMeanHeadPose.pitch;

        // Apply compensation (head turns right = gaze shifts left, head looks up = gaze shifts down)
        // The compensation factors are empirically determined
        const compensatedX = gazeX - deltaYaw * this.HEAD_POSE_YAW_FACTOR;
        const compensatedY = gazeY + deltaPitch * this.HEAD_POSE_PITCH_FACTOR;

        return { x: compensatedX, y: compensatedY };
        */
    }
}
