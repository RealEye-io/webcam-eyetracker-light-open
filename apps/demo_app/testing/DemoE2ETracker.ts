/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import {
    TrackerState,
    type CalibrationSample,
    type FaceDetectionResult,
    type FaceKeypoint,
    type GazePoint,
    type WebcamETLightConfig,
} from '@lib/types';
import { getDemoE2EConfig, isDemoE2EMode } from './e2eConfig';

type SupportedImage = ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

const MIN_CALIBRATION_SAMPLES = 5;
const SKIN_PIXEL_RATIO_THRESHOLD = 0.02;

export class DemoE2ETracker {
    private state: TrackerState = TrackerState.Uninitialized;
    private alwaysDetectFace: boolean;

    constructor(_config: WebcamETLightConfig = {}) {
        // When forceFaceDetection is set, bypass skin-tone detection
        // and always return a synthetic face on every frame.
        this.alwaysDetectFace = isDemoE2EMode() && !!getDemoE2EConfig().forceFaceDetection;
    }

    async initialize(): Promise<void> {
        this.state = TrackerState.Ready;
    }

    getState(): TrackerState {
        return this.state;
    }

    isReady(): boolean {
        return this.state !== TrackerState.Uninitialized && this.state !== TrackerState.Error;
    }

    isCalibrated(): boolean {
        return this.state === TrackerState.Calibrated;
    }

    detectFace(image: SupportedImage): FaceDetectionResult | null {
        if (this.state === TrackerState.Uninitialized) {
            throw new Error('Tracker has not been initialized.');
        }

        const imageData = this.toImageData(image);
        if (this.alwaysDetectFace) {
            return this.createSyntheticDetection(imageData.width, imageData.height);
        }
        if (!this.hasSyntheticFace(imageData)) {
            return null;
        }

        return this.createSyntheticDetection(imageData.width, imageData.height);
    }

    calibrate(samples: CalibrationSample[]): void {
        if (this.state === TrackerState.Uninitialized) {
            throw new Error('Tracker has not been initialized.');
        }

        if (samples.length < MIN_CALIBRATION_SAMPLES) {
            throw new Error(`At least ${MIN_CALIBRATION_SAMPLES} samples are required for calibration.`);
        }

        if (!this.alwaysDetectFace) {
            const validSampleCount = samples.filter((sample) => this.hasSyntheticFace(sample.image)).length;
            if (validSampleCount < MIN_CALIBRATION_SAMPLES) {
                throw new Error('Face not detected in enough calibration samples.');
            }
        }

        this.state = TrackerState.Calibrated;
    }

    predictWithDetection(image: SupportedImage, detection: FaceDetectionResult): GazePoint {
        if (this.state !== TrackerState.Calibrated) {
            throw new Error('Tracker must be calibrated before tracking.');
        }

        const imageData = this.toImageData(image);
        const centerX = detection.boundingBox.x + detection.boundingBox.width / 2;
        const centerY = detection.boundingBox.y + detection.boundingBox.height / 2;

        return {
            x: this.scaleToViewport(centerX, imageData.width, window.innerWidth),
            y: this.scaleToViewport(centerY, imageData.height, window.innerHeight),
        };
    }

    reset(): void {
        if (this.state === TrackerState.Calibrated) {
            this.state = TrackerState.Ready;
        }
    }

    dispose(): void {
        this.state = TrackerState.Uninitialized;
    }

    private scaleToViewport(value: number, sourceSize: number, viewportSize: number): number {
        if (sourceSize <= 0 || viewportSize <= 0) {
            return 0;
        }

        const scaled = (value / sourceSize) * viewportSize;
        return Math.max(24, Math.min(viewportSize - 24, scaled));
    }

    private hasSyntheticFace(imageData: ImageData): boolean {
        const { data, width, height } = imageData;
        const stepX = Math.max(1, Math.floor(width / 32));
        const stepY = Math.max(1, Math.floor(height / 24));
        let sampledPixels = 0;
        let skinTonePixels = 0;

        for (let y = 0; y < height; y += stepY) {
            for (let x = 0; x < width; x += stepX) {
                const index = (y * width + x) * 4;
                const red = data[index] ?? 0;
                const green = data[index + 1] ?? 0;
                const blue = data[index + 2] ?? 0;
                const maxChannel = Math.max(red, green, blue);
                const minChannel = Math.min(red, green, blue);
                const isSkinTone = (
                    red > 95 &&
                    green > 40 &&
                    blue > 20 &&
                    maxChannel - minChannel > 15 &&
                    Math.abs(red - green) > 15 &&
                    red > green &&
                    red > blue
                );

                sampledPixels += 1;
                if (isSkinTone) {
                    skinTonePixels += 1;
                }
            }
        }

        // Check 1: frame-wide skin tone (solid color faces)
        if (sampledPixels > 0 && (skinTonePixels / sampledPixels) >= SKIN_PIXEL_RATIO_THRESHOLD) {
            return true;
        }

        // Check 2: centered face cluster (real person photos)
        // Look at the center 50%×60% region where a face would typically sit
        const centerX = width / 2;
        const centerY = height / 2;
        const faceRegionWidth = Math.floor(width * 0.5);
        const faceRegionHeight = Math.floor(height * 0.6);
        const faceXStart = Math.max(0, Math.floor(centerX - faceRegionWidth / 2));
        const faceXEnd = Math.min(width, Math.ceil(centerX + faceRegionWidth / 2));
        const faceYStart = Math.max(0, Math.floor(centerY - faceRegionHeight / 2));
        const faceYEnd = Math.min(height, Math.ceil(centerY + faceRegionHeight / 2));

        let faceRegionPixels = 0;
        let faceRegionSkinPixels = 0;

        for (let y = faceYStart; y < faceYEnd; y += stepY) {
            for (let x = faceXStart; x < faceXEnd; x += stepX) {
                const index = (y * width + x) * 4;
                const red = data[index] ?? 0;
                const green = data[index + 1] ?? 0;
                const blue = data[index + 2] ?? 0;
                const maxChannel = Math.max(red, green, blue);
                const minChannel = Math.min(red, green, blue);
                const isSkinTone = (
                    red > 95 &&
                    green > 40 &&
                    blue > 20 &&
                    maxChannel - minChannel > 15 &&
                    Math.abs(red - green) > 15 &&
                    red > green &&
                    red > blue
                );

                faceRegionPixels += 1;
                if (isSkinTone) {
                    faceRegionSkinPixels += 1;
                }
            }
        }

        // If ≥15% of the center region is skin-tone, treat as a face
        if (faceRegionPixels > 0 && (faceRegionSkinPixels / faceRegionPixels) >= 0.15) {
            return true;
        }

        return false;
    }

    private createSyntheticDetection(width: number, height: number): FaceDetectionResult {
        const boxWidth = width * 0.44;
        const boxHeight = height * 0.58;
        const boxX = (width - boxWidth) / 2;
        const boxY = height * 0.16;
        const keypoints = this.createSyntheticKeypoints(boxX, boxY, boxWidth, boxHeight);

        return {
            boundingBox: {
                x: boxX,
                y: boxY,
                width: boxWidth,
                height: boxHeight,
            },
            confidence: 0.99,
            keypoints,
        };
    }

    private createSyntheticKeypoints(
        boxX: number,
        boxY: number,
        boxWidth: number,
        boxHeight: number
    ): FaceKeypoint[] {
        return [
            { name: 'left_eye', x: boxX + boxWidth * 0.32, y: boxY + boxHeight * 0.38 },
            { name: 'right_eye', x: boxX + boxWidth * 0.68, y: boxY + boxHeight * 0.38 },
            { name: 'nose_tip', x: boxX + boxWidth * 0.5, y: boxY + boxHeight * 0.56 },
            { name: 'left_ear_tragion', x: boxX + boxWidth * 0.08, y: boxY + boxHeight * 0.5 },
            { name: 'right_ear_tragion', x: boxX + boxWidth * 0.92, y: boxY + boxHeight * 0.5 },
        ];
    }

    private toImageData(image: SupportedImage): ImageData {
        if (image instanceof ImageData) {
            return image;
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to create canvas context for test tracker.');
        }

        if (image instanceof HTMLVideoElement) {
            canvas.width = image.videoWidth;
            canvas.height = image.videoHeight;
        } else {
            canvas.width = image.width;
            canvas.height = image.height;
        }

        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
    }
}
