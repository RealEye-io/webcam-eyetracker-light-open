/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Head pose augmentation for calibration data.
 * 
 * The key insight is that when calibrating, users typically hold their head still.
 * This means the model never learns the relationship between head movement and gaze.
 * 
 * This module synthetically augments calibration samples with simulated head movements
 * by modifying the feature vector to approximate the effect of head rotation.
 * 
 * The augmentation approach:
 * 1. Generate head pose variations (yaw, pitch deltas)
 * 2. Apply rotation transformation to landmark coordinate features
 * 3. Update head pose features in the feature vector
 * 4. Eye image features are left unchanged (they're already pose-relative)
 */

import type { HeadPose } from '../face/FaceLandmarkerAdapter';
import { HEAD_POSE_FEATURE_COUNT, BLENDSHAPE_FEATURE_COUNT } from './FeatureExtractor';

/**
 * Configuration for head pose augmentation.
 */
export interface HeadPoseAugmentationConfig {
    /** Maximum yaw (left/right) augmentation in radians */
    maxYaw: number;
    /** Maximum pitch (up/down) augmentation in radians */
    maxPitch: number;
    /** Number of augmentation steps in each direction */
    steps: number;
}

/**
 * Default augmentation config - small head movements (~5°)
 */
export const DEFAULT_HEAD_POSE_AUGMENTATION: HeadPoseAugmentationConfig = {
    maxYaw: Math.PI / 36,      // ±5 degrees
    maxPitch: Math.PI / 36,    // ±5 degrees
    steps: 1,                   // -5°, 0°, +5° = 3×3 = 9 variations
};

/**
 * Aggressive augmentation config - larger head movements (~10°)
 */
export const AGGRESSIVE_HEAD_POSE_AUGMENTATION: HeadPoseAugmentationConfig = {
    maxYaw: Math.PI / 18,      // ±10 degrees
    maxPitch: Math.PI / 18,    // ±10 degrees
    steps: 2,                   // -10°, -5°, 0°, +5°, +10° = 5×5 = 25 variations
};

// Feature indices in the enhanced landmark feature vector
// Layout: [30 landmark coords, 22 blendshapes, 6 head pose, 8 eye-relative, 1600 eye pixels, 1 bias]
const LANDMARK_COUNT = 15;  // Number of landmarks
const LANDMARK_COORDS_COUNT = LANDMARK_COUNT * 2;  // 30 total coords (x, y pairs)
const HEAD_POSE_START = LANDMARK_COORDS_COUNT + BLENDSHAPE_FEATURE_COUNT;  // 30 + 22 = 52
const EYE_RELATIVE_START = HEAD_POSE_START + HEAD_POSE_FEATURE_COUNT;  // 52 + 6 = 58

/**
 * Generate head pose augmented versions of a feature vector.
 * Creates multiple variations with different simulated head poses.
 * 
 * @param features - Original feature vector from calibration sample
 * @param baseHeadPose - The head pose from the original detection
 * @param config - Augmentation configuration
 * @returns Array of augmented feature vectors (including original)
 */
export function augmentFeaturesWithHeadPose(
    features: number[],
    baseHeadPose: HeadPose | undefined,
    config: HeadPoseAugmentationConfig = DEFAULT_HEAD_POSE_AUGMENTATION
): number[][] {
    const results: number[][] = [];
    const yawStep = config.maxYaw / config.steps;
    const pitchStep = config.maxPitch / config.steps;

    // Generate grid of augmented poses
    for (let yi = -config.steps; yi <= config.steps; yi++) {
        for (let pi = -config.steps; pi <= config.steps; pi++) {
            const deltaYaw = yi * yawStep;
            const deltaPitch = pi * pitchStep;

            const augmented = augmentFeatureVector(
                features,
                baseHeadPose,
                deltaYaw,
                deltaPitch
            );
            results.push(augmented);
        }
    }

    return results;
}

/**
 * Apply head pose augmentation to a single feature vector.
 * 
 * @param features - Original feature vector
 * @param baseHeadPose - Original head pose from detection
 * @param deltaYaw - Yaw change in radians
 * @param deltaPitch - Pitch change in radians
 * @returns Augmented feature vector
 */
function augmentFeatureVector(
    features: number[],
    baseHeadPose: HeadPose | undefined,
    deltaYaw: number,
    deltaPitch: number
): number[] {
    // If no change, return copy of original
    if (Math.abs(deltaYaw) < 0.001 && Math.abs(deltaPitch) < 0.001) {
        return [...features];
    }

    const augmented = [...features];

    // 1. Apply rotation to landmark coordinate features (first 30 features)
    // These are normalized (x, y) pairs, so we apply a simplified 2D rotation
    // that approximates the effect of head rotation on visible landmark positions
    const cy = Math.cos(-deltaYaw);  // Negative because yaw right moves landmarks left
    const sy = Math.sin(-deltaYaw);
    const sp = Math.sin(deltaPitch);

    for (let i = 0; i < LANDMARK_COUNT; i++) {
        const xIdx = i * 2;
        const yIdx = i * 2 + 1;

        const x = augmented[xIdx];
        const y = augmented[yIdx];

        // Apply yaw rotation (horizontal shift)
        // When head turns right (positive yaw), landmarks appear to shift left
        const x1 = cy * x - sy * 0.1;  // 0.1 is a scale factor for how much landmarks shift

        // Apply pitch rotation (vertical shift)
        // When head tilts up (positive pitch), landmarks appear to shift down
        const y1 = y + sp * 0.1;

        augmented[xIdx] = x1;
        augmented[yIdx] = y1;
    }

    // 2. Update head pose features (features 52-57)
    const base = baseHeadPose || { yaw: 0, pitch: 0, roll: 0, translationX: 0, translationY: 0, translationZ: 0 };
    augmented[HEAD_POSE_START] = base.yaw + deltaYaw;
    augmented[HEAD_POSE_START + 1] = base.pitch + deltaPitch;
    // Roll and translations stay the same

    // 3. Update eye-relative features (features 58-65)
    // When head rotates but gaze stays fixed on the same screen point,
    // the iris appears to shift within the eye in the opposite direction
    const irisShiftFactor = 0.2;  // How much iris position changes per radian of head rotation

    // Left eye iris relative X (feature 58): shifts right when head turns left
    augmented[EYE_RELATIVE_START] = augmented[EYE_RELATIVE_START] + deltaYaw * irisShiftFactor;
    // Left eye iris relative Y (feature 59): shifts down when head tilts up
    augmented[EYE_RELATIVE_START + 1] = augmented[EYE_RELATIVE_START + 1] + deltaPitch * irisShiftFactor;

    // Right eye iris relative X (feature 62): same shift pattern
    augmented[EYE_RELATIVE_START + 4] = augmented[EYE_RELATIVE_START + 4] + deltaYaw * irisShiftFactor;
    // Right eye iris relative Y (feature 63)
    augmented[EYE_RELATIVE_START + 5] = augmented[EYE_RELATIVE_START + 5] + deltaPitch * irisShiftFactor;

    return augmented;
}

/**
 * Generate multiple head pose variations without modifying features.
 * Useful for testing or when you need just the head poses.
 */
export function generateHeadPoseVariations(
    baseHeadPose: HeadPose | undefined,
    config: HeadPoseAugmentationConfig = DEFAULT_HEAD_POSE_AUGMENTATION
): HeadPose[] {
    const base: HeadPose = baseHeadPose || {
        yaw: 0,
        pitch: 0,
        roll: 0,
        translationX: 0,
        translationY: 0,
        translationZ: 0,
    };

    const poses: HeadPose[] = [];
    const yawStep = config.maxYaw / config.steps;
    const pitchStep = config.maxPitch / config.steps;

    for (let yi = -config.steps; yi <= config.steps; yi++) {
        for (let pi = -config.steps; pi <= config.steps; pi++) {
            poses.push({
                yaw: base.yaw + yi * yawStep,
                pitch: base.pitch + pi * pitchStep,
                roll: base.roll,
                translationX: base.translationX,
                translationY: base.translationY,
                translationZ: base.translationZ,
            });
        }
    }

    return poses;
}
