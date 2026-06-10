/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Feature extraction from face images for ridge regression.
 *
 * Extracts features by:
 * 1. Cropping the face region using the bounding box
 * 2. Resizing to a fixed size (default 16×16)
 * 3. Optionally applying Gaussian blur for translation invariance
 * 4. Converting to grayscale
 * 5. Z-score normalization to handle brightness/contrast changes
 * 6. Flattening to a 1D array
 * 7. Optionally adding eye region features (default 16×16 per eye)
 * 8. Adding a bias term (1.0) for the regression intercept
 */

import type { BoundingBox, FaceKeypoint, FaceBlendshapes } from '../types';
import { LANDMARK_INDICES } from '../face/FaceDetector';
import { REALEYE_EYE_INDICES, EYE_INPUT_WIDTH, EYE_INPUT_HEIGHT, type HeadPose } from '../face/FaceLandmarkerAdapter';
import { EYE_BOX_SCALE } from './EyeBoxScale';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/** Number of blendshape features (eye/brow/nose related) */
export const BLENDSHAPE_FEATURE_COUNT = 22;

/** Number of head pose features (yaw, pitch, roll, translations) */
export const HEAD_POSE_FEATURE_COUNT = 6;

const DEFAULT_FACE_SIZE = 16;

/**
 * Padding in pixels to add around eye crop before resizing.
 * Set to 4 to support ±2px augmentation shifts during calibration.
 */
const EYE_CROP_PADDING = 4;

/** Maximum augmentation offset in pixels (for ±1px shifts, use 1; for ±2px, use 2) */
export const MAX_AUGMENTATION_OFFSET = 2;

// Minimum std deviation to avoid division by zero in normalization
const MIN_STD_DEV = 1e-6;

/**
 * Extract features from an image given a face bounding box.
 * This is the legacy function that extracts face features only.
 *
 * @param imageData - The source image as ImageData
 * @param boundingBox - The bounding box of the detected face
 * @param faceSize - Size to resize the face crop to (default 16)
 * @returns Feature vector with normalized grayscale values + bias term
 */
export function extractFeatures(
    imageData: ImageData,
    boundingBox: BoundingBox,
    faceSize: number = DEFAULT_FACE_SIZE
): number[] {
    // Crop the face region
    const cropped = cropImage(imageData, boundingBox);

    // Resize to target size
    const resized = resizeImage(cropped, faceSize, faceSize);

    // Convert to grayscale
    const grayscale = toGrayscale(resized);

    // Apply z-score normalization to handle brightness/contrast changes
    const normalized = zScoreNormalize(grayscale);

    // Add bias term (1.0) at the end for regression intercept
    normalized.push(1.0);

    return normalized;
}

/**
 * Extract combined features from face and eye regions.
 * Features are concatenated as: [face_features, left_eye_features, right_eye_features, bias]
 *
 * @param imageData - The source image as ImageData
 * @param boundingBox - The bounding box of the detected face
 * @param keypoints - Facial keypoints from MediaPipe (must include leftEye and rightEye)
 * @param useLandmarks - If true, use landmark-based features instead of face image (default true)
 * @param fullLandmarks - Optional: all 478 face landmarks from Face Landmarker for enhanced features
 * @param imageWidth - Image width (required when fullLandmarks is provided)
 * @param imageHeight - Image height (required when fullLandmarks is provided)
 * @param eyeWidth - Width for eye crop (default 30)
 * @param eyeHeight - Height for eye crop (default 15)
 * @param blendshapes - Optional: face blendshapes from MediaPipe (22 eye/brow/nose features)
 * @param headPose - Optional: head pose from transformation matrix (6 features)
 * @returns Combined feature vector with normalized grayscale values + bias term
 */
export function extractCombinedFeatures(
    imageData: ImageData,
    boundingBox: BoundingBox,
    keypoints: FaceKeypoint[],
    useLandmarks: boolean = true,
    fullLandmarks?: NormalizedLandmark[],
    imageWidth?: number,
    imageHeight?: number,
    eyeWidth: number = EYE_INPUT_WIDTH,
    eyeHeight: number = EYE_INPUT_HEIGHT,
    blendshapes?: FaceBlendshapes,
    headPose?: HeadPose
): number[] {
    // Use landmark-based features instead of face image if requested
    if (useLandmarks) {
        return extractLandmarkPlusEyeFeatures(
            imageData,
            boundingBox,
            keypoints,
            fullLandmarks,
            imageWidth,
            imageHeight,
            eyeWidth,
            eyeHeight,
            blendshapes,
            headPose
        );
    }

    // Extract face features (without bias term)
    const faceFeatures = extractFaceFeatures(imageData, boundingBox, DEFAULT_FACE_SIZE);

    // If no keypoints, return face features only
    if (!keypoints || keypoints.length === 0) {
        faceFeatures.push(1.0); // Add bias term
        return faceFeatures;
    }

    // Find eye keypoints
    // MediaPipe BlazeFace uses snake_case: 'left_eye', 'right_eye'
    const leftEye = keypoints.find((kp) => kp.name === 'left_eye' || kp.name === 'leftEye');
    const rightEye = keypoints.find((kp) => kp.name === 'right_eye' || kp.name === 'rightEye');

    // For face-image mode without full landmarks, add eye features using RealEye cropping if possible
    if (leftEye && rightEye && fullLandmarks && fullLandmarks.length >= 478 && imageWidth && imageHeight) {
        const leftEyeFeatures = extractRealEyeEyeFeatures(
            imageData,
            fullLandmarks,
            'left',
            imageWidth,
            imageHeight,
            eyeWidth,
            eyeHeight
        );
        const rightEyeFeatures = extractRealEyeEyeFeatures(
            imageData,
            fullLandmarks,
            'right',
            imageWidth,
            imageHeight,
            eyeWidth,
            eyeHeight
        );

        // Concatenate: face + left eye + right eye + bias
        return [...faceFeatures, ...leftEyeFeatures, ...rightEyeFeatures, 1.0];
    }

    // Fallback: face features only (no eye features without full landmarks)
    faceFeatures.push(1.0);
    return faceFeatures;
}

/**
 * Augmentation offsets for calibration: original (0,0) + 8 directions with ±1px shift.
 * Each array element is [offsetX, offsetY].
 */
export const AUGMENTATION_OFFSETS_1PX: readonly [number, number][] = [
    [0, 0],   // original (center)
    [-1, -1], // top-left
    [-1, 0],  // left
    [-1, 1],  // bottom-left
    [0, -1],  // top
    [0, 1],   // bottom
    [1, -1],  // top-right
    [1, 0],   // right
    [1, 1],   // bottom-right
] as const;

/**
 * Augmentation offsets for calibration: original + ±2px shifts.
 * Each array element is [offsetX, offsetY].
 */
export const AUGMENTATION_OFFSETS_2PX: readonly [number, number][] = [
    [0, 0],   // original (center)
    // ±2px shifts (8 directions)
    [-2, -2], [-2, 0], [-2, 2],
    [0, -2], [0, 2],
    [2, -2], [2, 0], [2, 2],
] as const;

/**
 * Currently active augmentation offsets (mutable for experimentation).
 * Default: AUGMENTATION_OFFSETS_1PX
 */
let activeAugmentationOffsets: readonly [number, number][] = AUGMENTATION_OFFSETS_1PX;

/**
 * Set the active augmentation offsets for calibration.
 */
export function setAugmentationOffsets(offsets: readonly [number, number][]): void {
    activeAugmentationOffsets = offsets;
}

/**
 * Get the currently active augmentation offsets.
 */
export function getAugmentationOffsets(): readonly [number, number][] {
    return activeAugmentationOffsets;
}

/**
 * Reset augmentation offsets to default (±1px).
 */
export function resetAugmentationOffsets(): void {
    activeAugmentationOffsets = AUGMENTATION_OFFSETS_1PX;
}

/**
 * Extract multiple augmented feature vectors from a single calibration sample.
 * Creates 9 samples: original + 8 shifted by ±1px in each direction.
 *
 * @param imageData - The source image
 * @param boundingBox - The bounding box of the detected face
 * @param keypoints - Facial keypoints from MediaPipe
 * @param fullLandmarks - All 478 face landmarks from Face Landmarker
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @param eyeWidth - Width for eye crop (default 32)
 * @param eyeHeight - Height for eye crop (default 16)
 * @param blendshapes - Optional face blendshapes
 * @param headPose - Optional head pose from transformation matrix
 * @returns Array of 9 feature vectors (one original + 8 augmented)
 */
export function extractAugmentedFeatures(
    imageData: ImageData,
    boundingBox: BoundingBox,
    keypoints: FaceKeypoint[],
    fullLandmarks: NormalizedLandmark[],
    imageWidth: number,
    imageHeight: number,
    eyeWidth: number = EYE_INPUT_WIDTH,
    eyeHeight: number = EYE_INPUT_HEIGHT,
    blendshapes?: FaceBlendshapes,
    headPose?: HeadPose
): number[][] {
    const results: number[][] = [];

    for (const [offsetX, offsetY] of activeAugmentationOffsets) {
        const features = extractLandmarkPlusEyeFeaturesWithOffset(
            imageData,
            boundingBox,
            keypoints,
            fullLandmarks,
            imageWidth,
            imageHeight,
            eyeWidth,
            eyeHeight,
            blendshapes,
            offsetX,
            offsetY,
            headPose
        );
        results.push(features);
    }

    return results;
}

/**
 * Extract landmark-based features combined with eye image features.
 * Features: [landmark_features, blendshape_features, head_pose_features, left_eye_features, right_eye_features, bias]
 *
 * When fullLandmarks (478 landmarks) is provided, uses all LANDMARK_INDICES positions
 * for more precise gaze features. Otherwise falls back to simplified keypoints.
 *
 * @param imageData - The source image
 * @param boundingBox - The bounding box of the detected face
 * @param keypoints - Facial keypoints from MediaPipe (simplified 5-6 keypoints)
 * @param fullLandmarks - Optional: all 478 face landmarks from Face Landmarker
 * @param imageWidth - Image width (required when fullLandmarks is provided)
 * @param imageHeight - Image height (required when fullLandmarks is provided)
 * @param eyeWidth - Width for eye crop (default 30)
 * @param eyeHeight - Height for eye crop (default 15)
 * @param blendshapes - Optional: face blendshapes from MediaPipe (22 eye/brow/nose features)
 * @param headPose - Optional: head pose from transformation matrix (6 features)
 * @returns Combined feature vector
 */
function extractLandmarkPlusEyeFeatures(
    imageData: ImageData,
    boundingBox: BoundingBox,
    keypoints: FaceKeypoint[],
    fullLandmarks?: NormalizedLandmark[],
    imageWidth?: number,
    imageHeight?: number,
    eyeWidth: number = EYE_INPUT_WIDTH,
    eyeHeight: number = EYE_INPUT_HEIGHT,
    blendshapes?: FaceBlendshapes,
    headPose?: HeadPose
): number[] {
    // If full landmarks available, use enhanced extraction with all LANDMARK_INDICES
    if (fullLandmarks && fullLandmarks.length >= 478 && imageWidth && imageHeight) {
        return extractEnhancedLandmarkFeatures(
            imageData,
            boundingBox,
            keypoints,
            fullLandmarks,
            imageWidth,
            imageHeight,
            eyeWidth,
            eyeHeight,
            blendshapes,
            headPose
        );
    }

    // Fallback to simplified keypoints extraction (no eye features without full landmarks)
    const features: number[] = [];

    // Normalize coordinates by face bounding box
    const faceW = boundingBox.width;
    const faceH = boundingBox.height;
    const faceCenterX = boundingBox.x + faceW / 2;
    const faceCenterY = boundingBox.y + faceH / 2;

    // Find key landmarks (mouth is intentionally excluded as it doesn't improve gaze accuracy)
    const leftEye = keypoints.find((kp) => kp.name === 'left_eye' || kp.name === 'leftEye');
    const rightEye = keypoints.find((kp) => kp.name === 'right_eye' || kp.name === 'rightEye');
    const nose = keypoints.find((kp) => kp.name === 'nose_tip' || kp.name === 'noseTip');
    const leftEar = keypoints.find((kp) => kp.name === 'left_ear_tragion' || kp.name === 'leftEarTragion');
    const rightEar = keypoints.find((kp) => kp.name === 'right_ear_tragion' || kp.name === 'rightEarTragion');

    // Add relative keypoint positions (normalized by face size)
    for (const kp of keypoints) {
        features.push((kp.x - faceCenterX) / faceW);
        features.push((kp.y - faceCenterY) / faceH);
    }

    // Add derived features if key landmarks are available
    if (leftEye && rightEye) {
        // Eye midpoint
        const eyeMidX = (leftEye.x + rightEye.x) / 2;
        const eyeMidY = (leftEye.y + rightEye.y) / 2;

        // Eye-to-eye distance (head scale/yaw indicator)
        const eyeDist = Math.sqrt(
            Math.pow(rightEye.x - leftEye.x, 2) +
            Math.pow(rightEye.y - leftEye.y, 2)
        );
        features.push(eyeDist / faceW);

        // Eye-to-eye vertical difference (head roll indicator)
        features.push((rightEye.y - leftEye.y) / faceH);

        // Eye midpoint relative to face center (head position)
        features.push((eyeMidX - faceCenterX) / faceW);
        features.push((eyeMidY - faceCenterY) / faceH);

        if (nose) {
            // Nose to eye midpoint (head pitch indicator)
            features.push((nose.x - eyeMidX) / faceW);
            features.push((nose.y - eyeMidY) / faceH);

            // Nose to face center
            features.push((nose.x - faceCenterX) / faceW);
            features.push((nose.y - faceCenterY) / faceH);
        }

        if (leftEar && rightEar) {
            // Ear-to-ear distance (face width indicator)
            const earDist = Math.sqrt(
                Math.pow(rightEar.x - leftEar.x, 2) +
                Math.pow(rightEar.y - leftEar.y, 2)
            );
            features.push(earDist / faceW);

            // Ear asymmetry (head yaw indicator)
            features.push((rightEar.x - leftEar.x) / faceW);
            features.push((rightEar.y - leftEar.y) / faceH);
        }
    }

    // Z-score normalize landmark features
    const normalizedLandmarks = zScoreNormalize(features);

    // Without full landmarks, cannot use RealEye eye cropping - return landmarks only
    normalizedLandmarks.push(1.0);
    return normalizedLandmarks;
}

/**
 * Extract landmark-based features with offset for augmentation.
 * Same as extractLandmarkPlusEyeFeatures but applies offset to eye crop extraction.
 */
function extractLandmarkPlusEyeFeaturesWithOffset(
    imageData: ImageData,
    boundingBox: BoundingBox,
    keypoints: FaceKeypoint[],
    fullLandmarks: NormalizedLandmark[],
    imageWidth: number,
    imageHeight: number,
    eyeWidth: number = EYE_INPUT_WIDTH,
    eyeHeight: number = EYE_INPUT_HEIGHT,
    blendshapes?: FaceBlendshapes,
    offsetX: number = 0,
    offsetY: number = 0,
    headPose?: HeadPose
): number[] {
    return extractEnhancedLandmarkFeaturesWithOffset(
        imageData,
        boundingBox,
        keypoints,
        fullLandmarks,
        imageWidth,
        imageHeight,
        eyeWidth,
        eyeHeight,
        blendshapes,
        offsetX,
        offsetY,
        headPose
    );
}

/**
 * Extract enhanced landmark features using raw coordinates + blendshapes + head pose.
 * This uses precise positions from 478 face landmarks plus semantic blendshapes
 * and head pose for better gaze prediction, especially with head movement.
 *
 * Features include:
 * - Raw landmark coordinates (15 landmarks × 2 coords = 30 features, no derived calculations)
 * - Blendshapes (22 eye/brow/nose semantic features)
 * - Head pose (6 features: yaw, pitch, roll, translationX, translationY, translationZ)
 * - Eye image features (40x20 using RealEye multi-landmark bounding boxes)
 *
 * Total: 30 raw coords + 22 blendshapes + 6 head pose + 1600 eye pixels + 1 bias = 1659 features
 */
function extractEnhancedLandmarkFeatures(
    imageData: ImageData,
    boundingBox: BoundingBox,
    _keypoints: FaceKeypoint[],
    landmarks: NormalizedLandmark[],
    imageWidth: number,
    imageHeight: number,
    eyeWidth: number = EYE_INPUT_WIDTH,
    eyeHeight: number = EYE_INPUT_HEIGHT,
    _blendshapes?: FaceBlendshapes,
    _headPose?: HeadPose
): number[] {
    const features: number[] = [];

    // Normalize coordinates by face bounding box
    const faceW = boundingBox.width;
    const faceH = boundingBox.height;
    const faceCenterX = boundingBox.x + faceW / 2;
    const faceCenterY = boundingBox.y + faceH / 2;

    // Helper to get landmark position normalized by face box
    const getLandmark = (index: number): { nx: number; ny: number } | null => {
        const lm = landmarks[index];
        if (!lm) return null;
        const x = lm.x * imageWidth;
        const y = lm.y * imageHeight;
        return {
            nx: (x - faceCenterX) / faceW,
            ny: (y - faceCenterY) / faceH,
        };
    };

    // Extract all 15 key landmarks from LANDMARK_INDICES (raw coordinates only)
    const landmarkPositions = [
        getLandmark(LANDMARK_INDICES.LEFT_IRIS_CENTER),
        getLandmark(LANDMARK_INDICES.RIGHT_IRIS_CENTER),
        getLandmark(LANDMARK_INDICES.LEFT_EYE_OUTER),
        getLandmark(LANDMARK_INDICES.LEFT_EYE_INNER),
        getLandmark(LANDMARK_INDICES.RIGHT_EYE_OUTER),
        getLandmark(LANDMARK_INDICES.RIGHT_EYE_INNER),
        getLandmark(LANDMARK_INDICES.LEFT_EYE_UPPER),
        getLandmark(LANDMARK_INDICES.LEFT_EYE_LOWER),
        getLandmark(LANDMARK_INDICES.RIGHT_EYE_UPPER),
        getLandmark(LANDMARK_INDICES.RIGHT_EYE_LOWER),
        getLandmark(LANDMARK_INDICES.NOSE_TIP),
        getLandmark(LANDMARK_INDICES.CHIN),
        getLandmark(LANDMARK_INDICES.FOREHEAD_TOP),
        getLandmark(LANDMARK_INDICES.LEFT_CHEEK),
        getLandmark(LANDMARK_INDICES.RIGHT_CHEEK),
    ];

    // Add raw normalized positions for all key landmarks (x, y pairs) - 30 features
    for (const lm of landmarkPositions) {
        if (lm) {
            features.push(lm.nx, lm.ny);
        } else {
            features.push(0, 0); // Default if landmark missing
        }
    }

    // Z-score normalize landmark coordinate features
    const normalizedLandmarks = zScoreNormalize(features);

    // Extract eye features using RealEye multi-landmark bounding boxes
    const leftEyeFeatures = extractRealEyeEyeFeatures(
        imageData,
        landmarks,
        'left',
        imageWidth,
        imageHeight,
        eyeWidth,
        eyeHeight
    );
    const rightEyeFeatures = extractRealEyeEyeFeatures(
        imageData,
        landmarks,
        'right',
        imageWidth,
        imageHeight,
        eyeWidth,
        eyeHeight
    );

    // Concatenate: landmarks (30) + left eye + right eye + bias (1)
    return [...normalizedLandmarks, ...leftEyeFeatures, ...rightEyeFeatures, 1.0];
}

/**
 * Extract enhanced landmark features with offset for augmentation.
 * Same as extractEnhancedLandmarkFeatures but applies offset to eye crop extraction.
 */
function extractEnhancedLandmarkFeaturesWithOffset(
    imageData: ImageData,
    boundingBox: BoundingBox,
    _keypoints: FaceKeypoint[],
    landmarks: NormalizedLandmark[],
    imageWidth: number,
    imageHeight: number,
    eyeWidth: number = EYE_INPUT_WIDTH,
    eyeHeight: number = EYE_INPUT_HEIGHT,
    _blendshapes?: FaceBlendshapes,
    offsetX: number = 0,
    offsetY: number = 0,
    _headPose?: HeadPose
): number[] {
    const features: number[] = [];

    // Normalize coordinates by face bounding box
    const faceW = boundingBox.width;
    const faceH = boundingBox.height;
    const faceCenterX = boundingBox.x + faceW / 2;
    const faceCenterY = boundingBox.y + faceH / 2;

    // Helper to get landmark position normalized by face box
    const getLandmark = (index: number): { nx: number; ny: number } | null => {
        const lm = landmarks[index];
        if (!lm) return null;
        const x = lm.x * imageWidth;
        const y = lm.y * imageHeight;
        return {
            nx: (x - faceCenterX) / faceW,
            ny: (y - faceCenterY) / faceH,
        };
    };

    // Extract all 15 key landmarks from LANDMARK_INDICES (raw coordinates only)
    const landmarkPositions = [
        getLandmark(LANDMARK_INDICES.LEFT_IRIS_CENTER),
        getLandmark(LANDMARK_INDICES.RIGHT_IRIS_CENTER),
        getLandmark(LANDMARK_INDICES.LEFT_EYE_OUTER),
        getLandmark(LANDMARK_INDICES.LEFT_EYE_INNER),
        getLandmark(LANDMARK_INDICES.RIGHT_EYE_OUTER),
        getLandmark(LANDMARK_INDICES.RIGHT_EYE_INNER),
        getLandmark(LANDMARK_INDICES.LEFT_EYE_UPPER),
        getLandmark(LANDMARK_INDICES.LEFT_EYE_LOWER),
        getLandmark(LANDMARK_INDICES.RIGHT_EYE_UPPER),
        getLandmark(LANDMARK_INDICES.RIGHT_EYE_LOWER),
        getLandmark(LANDMARK_INDICES.NOSE_TIP),
        getLandmark(LANDMARK_INDICES.CHIN),
        getLandmark(LANDMARK_INDICES.FOREHEAD_TOP),
        getLandmark(LANDMARK_INDICES.LEFT_CHEEK),
        getLandmark(LANDMARK_INDICES.RIGHT_CHEEK),
    ];

    // Add raw normalized positions for all key landmarks (x, y pairs) - 30 features
    for (const lm of landmarkPositions) {
        if (lm) {
            features.push(lm.nx, lm.ny);
        } else {
            features.push(0, 0);
        }
    }

    // Z-score normalize landmark coordinate features
    const normalizedLandmarks = zScoreNormalize(features);

    // Extract eye features WITH OFFSET for augmentation
    const leftEyeFeatures = extractRealEyeEyeFeatures(
        imageData,
        landmarks,
        'left',
        imageWidth,
        imageHeight,
        eyeWidth,
        eyeHeight,
        offsetX,
        offsetY
    );
    const rightEyeFeatures = extractRealEyeEyeFeatures(
        imageData,
        landmarks,
        'right',
        imageWidth,
        imageHeight,
        eyeWidth,
        eyeHeight,
        offsetX,
        offsetY
    );

    // Concatenate: landmarks (30) + left eye + right eye + bias (1)
    return [...normalizedLandmarks, ...leftEyeFeatures, ...rightEyeFeatures, 1.0];
}

/**
 * Get the landmark feature count.
 * Base: 5 keypoints × 2 coords = 10 (mouth excluded)
 * Derived: 11 additional features (distances, angles, etc.)
 *   - 4 eye-pair features (eyeDist, eyeDiffY, eyeMidX, eyeMidY)
 *   - 4 nose features (relative to eye midpoint and face center)
 *   - 3 ear features (earDist, earDiffX, earDiffY)
 * Total landmark features: 21
 */
const LANDMARK_FEATURE_COUNT = 21;

/** Number of eye-relative iris position features (4 per eye = 8 total) */
export const EYE_RELATIVE_FEATURE_COUNT = 8;

/**
 * Enhanced landmark feature count when using raw coordinates only.
 * - 15 landmark positions × 2 coords = 30 (raw, no derived calculations)
 * Total: 30 landmark features
 */
export const ENHANCED_LANDMARK_FEATURE_COUNT = 30;

/**
 * Extract face features without bias term (for concatenation).
 */
function extractFaceFeatures(
    imageData: ImageData,
    boundingBox: BoundingBox,
    faceSize: number
): number[] {
    const cropped = cropImage(imageData, boundingBox);
    const resized = resizeImage(cropped, faceSize, faceSize);
    const grayscale = toGrayscale(resized);
    return zScoreNormalize(grayscale);
}

/**
 * Extract eye features using RealEye's multi-landmark bounding box approach.
 * Uses multiple landmarks per boundary to find tight eye bounding box,
 * then resizes to non-square dimensions (default 32x16).
 *
 * @param imageData - The source image
 * @param landmarks - All 478 face landmarks (normalized)
 * @param eye - 'left' or 'right' eye
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @param targetWidth - Width to resize eye crop to (default 32)
 * @param targetHeight - Height to resize eye crop to (default 16)
 * @param offsetX - Pixel offset in X direction for augmentation (default 0)
 * @param offsetY - Pixel offset in Y direction for augmentation (default 0)
 * @returns Normalized grayscale features (without bias term)
 */
function extractRealEyeEyeFeatures(
    imageData: ImageData,
    landmarks: NormalizedLandmark[],
    eye: 'left' | 'right',
    imageWidth: number,
    imageHeight: number,
    targetWidth: number = EYE_INPUT_WIDTH,
    targetHeight: number = EYE_INPUT_HEIGHT,
    offsetX: number = 0,
    offsetY: number = 0
): number[] {
    // Get landmark indices for this eye
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

    // Calculate tight bounding box from multiple landmarks
    const rawMinX = Math.min(...indices.minX.map(i => landmarks[i].x * imageWidth));
    const rawMinY = Math.min(...indices.minY.map(i => landmarks[i].y * imageHeight));
    const rawMaxX = Math.max(...indices.maxX.map(i => landmarks[i].x * imageWidth));
    const rawMaxY = Math.max(...indices.maxY.map(i => landmarks[i].y * imageHeight));

    // Apply EYE_BOX_SCALE to expand/shrink the bounding box from center
    const boxWidth = rawMaxX - rawMinX;
    const boxHeight = rawMaxY - rawMinY;
    const centerX = (rawMinX + rawMaxX) / 2;
    const centerY = (rawMinY + rawMaxY) / 2;
    const scaledWidth = boxWidth * EYE_BOX_SCALE;
    const scaledHeight = boxHeight * EYE_BOX_SCALE;
    const minX = centerX - scaledWidth / 2;
    const minY = centerY - scaledHeight / 2;

    // Create bounding box with padding for augmentation support
    const padding = EYE_CROP_PADDING;
    const paddedBox: BoundingBox = {
        x: Math.round(minX) - padding,
        y: Math.round(minY) - padding,
        width: Math.round(scaledWidth) + 2 * padding,
        height: Math.round(scaledHeight) + 2 * padding,
    };

    // Crop the padded region
    const cropped = cropImage(imageData, paddedBox);

    // Calculate intermediate size: target + 2*padding to allow offset crops
    const intermediateWidth = targetWidth + 2 * padding;
    const intermediateHeight = targetHeight + 2 * padding;
    const resizedIntermediate = resizeImage(cropped, intermediateWidth, intermediateHeight);

    // Offset-crop: extract target size from (padding+offsetX, padding+offsetY)
    const resized = offsetCrop(resizedIntermediate, targetWidth, targetHeight, offsetX, offsetY, padding);
    const grayscale = toGrayscale(resized);

    return zScoreNormalize(grayscale);
}

/**
 * Crop a region from an ImageData object with offset from center.
 * Used for augmentation: offsetX/offsetY shift the crop from center position.
 */
function offsetCrop(
    imageData: ImageData,
    targetWidth: number,
    targetHeight: number,
    offsetX: number,
    offsetY: number,
    padding: number
): ImageData {
    const { width: srcWidth, height: srcHeight, data: srcData } = imageData;

    // Center position plus offset (offset shifts where we crop from)
    const startX = padding + offsetX;
    const startY = padding + offsetY;

    // Clamp to valid range
    const safeStartX = Math.max(0, Math.min(startX, srcWidth - targetWidth));
    const safeStartY = Math.max(0, Math.min(startY, srcHeight - targetHeight));
    const actualWidth = Math.min(targetWidth, srcWidth - safeStartX);
    const actualHeight = Math.min(targetHeight, srcHeight - safeStartY);

    const cropped = new Uint8ClampedArray(actualWidth * actualHeight * 4);

    for (let row = 0; row < actualHeight; row++) {
        for (let col = 0; col < actualWidth; col++) {
            const srcIdx = ((safeStartY + row) * srcWidth + (safeStartX + col)) * 4;
            const dstIdx = (row * actualWidth + col) * 4;

            cropped[dstIdx] = srcData[srcIdx]; // R
            cropped[dstIdx + 1] = srcData[srcIdx + 1]; // G
            cropped[dstIdx + 2] = srcData[srcIdx + 2]; // B
            cropped[dstIdx + 3] = srcData[srcIdx + 3]; // A
        }
    }

    return new ImageData(cropped, actualWidth, actualHeight);
}

/**
 * Crop a region from an ImageData object.
 */
function cropImage(imageData: ImageData, box: BoundingBox): ImageData {
    // Ensure bounding box is within image bounds
    const x = Math.max(0, Math.floor(box.x));
    const y = Math.max(0, Math.floor(box.y));
    const width = Math.min(Math.floor(box.width), imageData.width - x);
    const height = Math.min(Math.floor(box.height), imageData.height - y);

    if (width <= 0 || height <= 0) {
        throw new Error('Invalid bounding box: results in zero or negative dimensions');
    }

    const cropped = new Uint8ClampedArray(width * height * 4);

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const srcIdx = ((y + row) * imageData.width + (x + col)) * 4;
            const dstIdx = (row * width + col) * 4;

            cropped[dstIdx] = imageData.data[srcIdx]; // R
            cropped[dstIdx + 1] = imageData.data[srcIdx + 1]; // G
            cropped[dstIdx + 2] = imageData.data[srcIdx + 2]; // B
            cropped[dstIdx + 3] = imageData.data[srcIdx + 3]; // A
        }
    }

    return new ImageData(cropped, width, height);
}

/**
 * Extract the center region from an ImageData object.
 * Used for removing padding after bilinear resize.
 */
function centerCrop(imageData: ImageData, targetWidth: number, targetHeight: number): ImageData {
    const { width: srcWidth, height: srcHeight, data: srcData } = imageData;

    // Calculate offset to center the crop
    const offsetX = Math.floor((srcWidth - targetWidth) / 2);
    const offsetY = Math.floor((srcHeight - targetHeight) / 2);

    // Ensure we don't go out of bounds
    const startX = Math.max(0, offsetX);
    const startY = Math.max(0, offsetY);
    const actualWidth = Math.min(targetWidth, srcWidth - startX);
    const actualHeight = Math.min(targetHeight, srcHeight - startY);

    const cropped = new Uint8ClampedArray(actualWidth * actualHeight * 4);

    for (let row = 0; row < actualHeight; row++) {
        for (let col = 0; col < actualWidth; col++) {
            const srcIdx = ((startY + row) * srcWidth + (startX + col)) * 4;
            const dstIdx = (row * actualWidth + col) * 4;

            cropped[dstIdx] = srcData[srcIdx]; // R
            cropped[dstIdx + 1] = srcData[srcIdx + 1]; // G
            cropped[dstIdx + 2] = srcData[srcIdx + 2]; // B
            cropped[dstIdx + 3] = srcData[srcIdx + 3]; // A
        }
    }

    return new ImageData(cropped, actualWidth, actualHeight);
}

/**
 * Resize an ImageData to new dimensions using bilinear interpolation.
 */
function resizeImage(
    imageData: ImageData,
    newWidth: number,
    newHeight: number
): ImageData {
    const { width: srcWidth, height: srcHeight, data: srcData } = imageData;

    const dstData = new Uint8ClampedArray(newWidth * newHeight * 4);

    const xRatio = srcWidth / newWidth;
    const yRatio = srcHeight / newHeight;

    for (let dstY = 0; dstY < newHeight; dstY++) {
        for (let dstX = 0; dstX < newWidth; dstX++) {
            // Map destination pixel to source coordinates
            const srcX = dstX * xRatio;
            const srcY = dstY * yRatio;

            // Get the four surrounding source pixels
            const x0 = Math.floor(srcX);
            const y0 = Math.floor(srcY);
            const x1 = Math.min(x0 + 1, srcWidth - 1);
            const y1 = Math.min(y0 + 1, srcHeight - 1);

            // Calculate interpolation weights
            const xWeight = srcX - x0;
            const yWeight = srcY - y0;

            // Bilinear interpolation for each channel
            for (let c = 0; c < 4; c++) {
                const topLeft = srcData[(y0 * srcWidth + x0) * 4 + c];
                const topRight = srcData[(y0 * srcWidth + x1) * 4 + c];
                const bottomLeft = srcData[(y1 * srcWidth + x0) * 4 + c];
                const bottomRight = srcData[(y1 * srcWidth + x1) * 4 + c];

                const top = topLeft * (1 - xWeight) + topRight * xWeight;
                const bottom = bottomLeft * (1 - xWeight) + bottomRight * xWeight;
                const value = top * (1 - yWeight) + bottom * yWeight;

                dstData[(dstY * newWidth + dstX) * 4 + c] = Math.round(value);
            }
        }
    }

    return new ImageData(dstData, newWidth, newHeight);
}

/**
 * Convert ImageData to grayscale values (0-1 range).
 * Uses simple average formula: (R + G + B) / 3
 * This matches RealEye production WebGazer (re-wg.js) preprocessing.
 * Benchmark showed ~7.5px MAE improvement over luminance formula.
 */
function toGrayscale(imageData: ImageData): number[] {
    const { width, height, data } = imageData;
    const grayscale: number[] = [];

    for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];

        // Simple average (matches re-wg.js), normalized to 0-1
        const gray = (r + g + b) / 3 / 255;
        grayscale.push(gray);
    }

    return grayscale;
}

/**
 * Convert grayscale array (0-1 range) back to ImageData for visualization.
 */
function grayscaleToImageData(grayscale: number[], width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < grayscale.length; i++) {
        const value = Math.round(grayscale[i] * 255);
        data[i * 4] = value;     // R
        data[i * 4 + 1] = value; // G
        data[i * 4 + 2] = value; // B
        data[i * 4 + 3] = 255;   // A
    }

    return new ImageData(data, width, height);
}

/**
 * Z-score normalization: (x - mean) / std
 * Removes brightness offset and normalizes contrast.
 * Makes features robust to screen brightness changes.
 */
function zScoreNormalize(values: number[]): number[] {
    const n = values.length;
    if (n === 0) return [];

    // Compute mean
    let sum = 0;
    for (let i = 0; i < n; i++) {
        sum += values[i];
    }
    const mean = sum / n;

    // Compute standard deviation
    let sumSqDiff = 0;
    for (let i = 0; i < n; i++) {
        const diff = values[i] - mean;
        sumSqDiff += diff * diff;
    }
    const std = Math.sqrt(sumSqDiff / n);

    // Normalize with protection against division by zero
    const effectiveStd = Math.max(std, MIN_STD_DEV);
    const normalized: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        normalized[i] = (values[i] - mean) / effectiveStd;
    }

    return normalized;
}

/**
 * Get the expected feature count for a given face size.
 * Features = faceSize² (grayscale pixels) + 1 (bias term)
 */
export function getFeatureCount(faceSize: number = DEFAULT_FACE_SIZE): number {
    return faceSize * faceSize + 1;
}

/**
 * Get the expected combined feature count for landmarks + eye features (default)
 * or face-image + eye features (fallback when landmarks are disabled).
 * Uses RealEye multi-landmark eye cropping (30x15 by default).
 *
 * @param useLandmarks - If true, use landmark features instead of face image
 * @param useEnhancedLandmarks - If true and useLandmarks, use enhanced 43-feature landmarks
 * @param eyeWidth - Width for eye crop (default 30)
 * @param eyeHeight - Height for eye crop (default 15)
 * @returns Total feature count
 */
export function getCombinedFeatureCount(
    useLandmarks: boolean = true,
    useEnhancedLandmarks: boolean = false,
    eyeWidth: number = EYE_INPUT_WIDTH,
    eyeHeight: number = EYE_INPUT_HEIGHT
): number {
    const eyeFeatureCount = 2 * eyeWidth * eyeHeight;

    if (useLandmarks) {
        const landmarkCount = useEnhancedLandmarks ? ENHANCED_LANDMARK_FEATURE_COUNT : LANDMARK_FEATURE_COUNT;
        // RealEye eye crops: 2 eyes × width × height + bias
        return landmarkCount + eyeFeatureCount + 1;
    }

    // Face image mode: faceSize² + 2 eyes × width × height + bias
    return DEFAULT_FACE_SIZE * DEFAULT_FACE_SIZE + eyeFeatureCount + 1;
}

/**
 * Eye crop result for visualization/debugging.
 */
export interface EyeCrops {
    /** Left eye crop at original resolution (before resize) */
    leftEye: ImageData;
    /** Right eye crop at original resolution (before resize) */
    rightEye: ImageData;
    /** Left eye preprocessed for regression (resized, grayscale) */
    leftEyeProcessed: ImageData;
    /** Right eye preprocessed for regression (resized, grayscale) */
    rightEyeProcessed: ImageData;
    /** Left eye bounding box in source image coordinates */
    leftEyeBox: BoundingBox;
    /** Right eye bounding box in source image coordinates */
    rightEyeBox: BoundingBox;
    /** Source image dimensions */
    sourceWidth: number;
    sourceHeight: number;
    /** Target dimensions for regression input */
    targetWidth: number;
    targetHeight: number;
}

/**
 * Extract eye crops from an image for visualization/debugging.
 * Uses the same RealEye multi-landmark bounding box approach as feature extraction.
 *
 * @param imageData - The source image as ImageData
 * @param landmarks - All 478 face landmarks (normalized 0-1)
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @returns Eye crops and bounding boxes, or null if landmarks are insufficient
 */
export function extractEyeCrops(
    imageData: ImageData,
    landmarks: NormalizedLandmark[],
    imageWidth: number,
    imageHeight: number
): EyeCrops | null {
    if (!landmarks || landmarks.length < 478) {
        return null;
    }

    const extractEyeBox = (eye: 'left' | 'right'): BoundingBox => {
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

        const minX = Math.min(...indices.minX.map(i => landmarks[i].x * imageWidth));
        const minY = Math.min(...indices.minY.map(i => landmarks[i].y * imageHeight));
        const maxX = Math.max(...indices.maxX.map(i => landmarks[i].x * imageWidth));
        const maxY = Math.max(...indices.maxY.map(i => landmarks[i].y * imageHeight));

        return {
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(maxX - minX),
            height: Math.round(maxY - minY),
        };
    };

    // Helper to get preprocessed eye (same pipeline as regression)
    const getProcessedEye = (box: BoundingBox): ImageData => {
        const padding = EYE_CROP_PADDING;
        const paddedBox: BoundingBox = {
            x: box.x - padding,
            y: box.y - padding,
            width: box.width + 2 * padding,
            height: box.height + 2 * padding,
        };
        const cropped = cropImage(imageData, paddedBox);
        const intermediateWidth = EYE_INPUT_WIDTH + 2 * padding;
        const intermediateHeight = EYE_INPUT_HEIGHT + 2 * padding;
        const resizedIntermediate = resizeImage(cropped, intermediateWidth, intermediateHeight);
        const resized = centerCrop(resizedIntermediate, EYE_INPUT_WIDTH, EYE_INPUT_HEIGHT);
        // Convert grayscale values back to ImageData for visualization
        const grayscale = toGrayscale(resized);
        return grayscaleToImageData(grayscale, EYE_INPUT_WIDTH, EYE_INPUT_HEIGHT);
    };

    const leftEyeBox = extractEyeBox('left');
    const rightEyeBox = extractEyeBox('right');

    return {
        leftEye: cropImage(imageData, leftEyeBox),
        rightEye: cropImage(imageData, rightEyeBox),
        leftEyeProcessed: getProcessedEye(leftEyeBox),
        rightEyeProcessed: getProcessedEye(rightEyeBox),
        leftEyeBox,
        rightEyeBox,
        sourceWidth: imageWidth,
        sourceHeight: imageHeight,
        targetWidth: EYE_INPUT_WIDTH,
        targetHeight: EYE_INPUT_HEIGHT,
    };
}
