/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Webcam ET Light - Main library exports
 */

export { WebcamETLight } from './WebcamETLight';
export { FaceDetector, LANDMARK_INDICES } from './face/FaceDetector';
export type { FaceLandmarkerResult, FaceDetectorMode } from './face/FaceDetector';
export { FaceLandmarkerAdapter } from './face/FaceLandmarkerAdapter';
export { BlazeFaceAdapter } from './face/BlazeFaceAdapter';
export {
    extractFeatures,
    extractCombinedFeatures,
    getFeatureCount,
    getCombinedFeatureCount,
    extractEyeCrops,
    AUGMENTATION_OFFSETS_1PX,
    AUGMENTATION_OFFSETS_2PX,
    setAugmentationOffsets,
    getAugmentationOffsets,
    resetAugmentationOffsets,
    type EyeCrops,
} from './features/FeatureExtractor';
export { setEyeBoxScale, getEyeBoxScale, resetEyeBoxScale } from './features/EyeBoxScale';
export {
    ridge,
    predict,
    transpose,
    multiply,
    luSolve,
    dot,
    type Matrix,
    type Vector,
} from './math/matrix';

export {
    ridgeOptimized,
    ridgeOptimizedLU,
    predictOptimized,
    dotOptimized,
    multiplyOptimized,
    transposeOptimized,
} from './math/matrix-optimized';

export {
    TrackerState,
    FaceNotDetectedError,
    CalibrationError,
    TrackerNotInitializedError,
    NotCalibratedError,
    type CalibrationSample,
    type GazePoint,
    type FaceDetectionResult,
    type BoundingBox,
    type FaceKeypoint,
    type WebcamETLightConfig,
} from './types';

// 17-point calibration pattern utilities
export {
    CalibrationPattern,
    TARGET_MAE_THRESHOLD,
    RECOMMENDED_SAMPLES_PER_POINT,
    getCalibrationPoints,
    getRecommendedPattern,
    toScreenCoordinates,
    getCalibrationPointsInPixels,
    getPatternInfo,
    type CalibrationPoint,
} from './calibration/CalibrationPatterns';
