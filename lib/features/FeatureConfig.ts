/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Feature ablation test script.
 * Tests different feature combinations to identify which help/hurt accuracy.
 * 
 * Run this via the accuracy test with different configurations.
 */

/**
 * Feature configuration for ablation study.
 */
export interface FeatureConfig {
    /** Include 30 raw landmark coordinates */
    useLandmarkCoords: boolean;
    /** Include 22 blendshape features */
    useBlendshapes: boolean;
    /** Include 6 head pose features (yaw, pitch, roll, translations) */
    useHeadPose: boolean;
    /** Include 8 eye-relative iris position features */
    useEyeRelative: boolean;
    /** Include eye image features (2 × eyeWidth × eyeHeight) */
    useEyeImages: boolean;
}

/**
 * Default configuration - all features enabled.
 */
export const DEFAULT_FEATURE_CONFIG: FeatureConfig = {
    useLandmarkCoords: true,
    useBlendshapes: true,
    useHeadPose: true,
    useEyeRelative: true,
    useEyeImages: true,
};

/**
 * Baseline configuration - no head movement features.
 */
export const BASELINE_CONFIG: FeatureConfig = {
    useLandmarkCoords: true,
    useBlendshapes: true,
    useHeadPose: false,
    useEyeRelative: false,
    useEyeImages: true,
};

/**
 * Minimal configuration - only eye images.
 */
export const EYE_IMAGES_ONLY_CONFIG: FeatureConfig = {
    useLandmarkCoords: false,
    useBlendshapes: false,
    useHeadPose: false,
    useEyeRelative: false,
    useEyeImages: true,
};

/**
 * Landmarks only configuration - no eye images.
 */
export const LANDMARKS_ONLY_CONFIG: FeatureConfig = {
    useLandmarkCoords: true,
    useBlendshapes: true,
    useHeadPose: true,
    useEyeRelative: true,
    useEyeImages: false,
};

/**
 * Configurations to test in ablation study.
 */
export const ABLATION_CONFIGS: { name: string; config: FeatureConfig }[] = [
    { name: 'all-features', config: DEFAULT_FEATURE_CONFIG },
    { name: 'no-head-pose', config: { ...DEFAULT_FEATURE_CONFIG, useHeadPose: false } },
    { name: 'no-eye-relative', config: { ...DEFAULT_FEATURE_CONFIG, useEyeRelative: false } },
    { name: 'no-blendshapes', config: { ...DEFAULT_FEATURE_CONFIG, useBlendshapes: false } },
    { name: 'baseline', config: BASELINE_CONFIG },
    { name: 'eye-images-only', config: EYE_IMAGES_ONLY_CONFIG },
    { name: 'landmarks-only', config: LANDMARKS_ONLY_CONFIG },
];

// Global feature config (mutable for testing)
let activeFeatureConfig: FeatureConfig = DEFAULT_FEATURE_CONFIG;

/**
 * Set the active feature configuration.
 */
export function setFeatureConfig(config: FeatureConfig): void {
    activeFeatureConfig = { ...config };
}

/**
 * Get the current feature configuration.
 */
export function getFeatureConfig(): FeatureConfig {
    return { ...activeFeatureConfig };
}

/**
 * Reset to default feature configuration.
 */
export function resetFeatureConfig(): void {
    activeFeatureConfig = { ...DEFAULT_FEATURE_CONFIG };
}
