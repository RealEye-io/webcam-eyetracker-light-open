/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Calibration pattern utilities for WebcamETLight.
 *
 * The project currently uses a single 17-point grid calibration.
 */

/**
 * A calibration point position on screen (normalized 0-1).
 */
export interface CalibrationPoint {
    /** X position (0 = left edge, 1 = right edge) */
    x: number;
    /** Y position (0 = top edge, 1 = bottom edge) */
    y: number;
}

/**
 * Available calibration pattern.
 */
export enum CalibrationPattern {
    /** 17-point uniform grid pattern */
    GRID_17 = 'grid-17',
}

/**
 * Target MAE threshold for acceptable accuracy (110px).
 *
 * Kept as a shared threshold constant for calibration metadata.
 */
export const TARGET_MAE_THRESHOLD = 110;

/**
 * Generate calibration points for 17-point uniform grid.
 * 17 positions cover corners, edges, center, and intermediate regions.
 */
function generateGrid17Points(): CalibrationPoint[] {
    const margin = 0.05;
    const step = (1 - 2 * margin) / 3;
    const points: CalibrationPoint[] = [];

    for (let row = 0; row <= 3; row++) {
        for (let col = 0; col <= 3; col++) {
            const x = margin + col * step;
            const y = margin + row * step;
            points.push({ x, y });
        }
    }

    const hasCenter = points.some(p => Math.abs(p.x - 0.5) < 0.01 && Math.abs(p.y - 0.5) < 0.01);
    if (!hasCenter) {
        points.push({ x: 0.5, y: 0.5 });
    }

    return points.slice(0, 17);
}

/**
 * Get calibration points for the supported pattern.
 *
 * @param pattern - The calibration pattern to use
 * @returns Array of calibration points in normalized coordinates (0-1)
 */
export function getCalibrationPoints(pattern: CalibrationPattern): CalibrationPoint[] {
    switch (pattern) {
        case CalibrationPattern.GRID_17:
        default:
            return generateGrid17Points();
    }
}

/**
 * Get the recommended calibration pattern.
 * The project currently uses GRID_17 as the only supported pattern.
 */
export function getRecommendedPattern(): CalibrationPattern {
    return CalibrationPattern.GRID_17;
}

/**
 * Convert normalized point coordinates to screen pixels.
 */
export function toScreenCoordinates(
    point: CalibrationPoint,
    screenWidth: number,
    screenHeight: number
): { x: number; y: number } {
    return {
        x: Math.round(point.x * screenWidth),
        y: Math.round(point.y * screenHeight),
    };
}

/**
 * Get all calibration points converted to screen coordinates.
 */
export function getCalibrationPointsInPixels(
    pattern: CalibrationPattern,
    screenWidth: number,
    screenHeight: number
): Array<{ x: number; y: number }> {
    const normalizedPoints = getCalibrationPoints(pattern);
    return normalizedPoints.map(p => toScreenCoordinates(p, screenWidth, screenHeight));
}

/**
 * Default recommended number of samples to collect per calibration point.
 * With 9× augmentation, 5 samples × 9 = 45 augmented samples per point.
 */
export const RECOMMENDED_SAMPLES_PER_POINT = 5;

/**
 * Get information about a calibration pattern.
 */
export function getPatternInfo(pattern: CalibrationPattern): {
    name: string;
    description: string;
    pointCount: number;
    experimentalMAE: number | null;
    meetsTarget: boolean;
} {
    const patterns: Record<CalibrationPattern, {
        name: string;
        description: string;
        pointCount: number;
        experimentalMAE: number | null;
    }> = {
        [CalibrationPattern.GRID_17]: {
            name: 'Grid 17',
            description: '17-point calibration covering corners, edges, center, and intermediate regions',
            pointCount: 17,
            experimentalMAE: null,
        },
    };

    const info = patterns[pattern];
    return {
        ...info,
        meetsTarget: info.experimentalMAE !== null && info.experimentalMAE <= TARGET_MAE_THRESHOLD,
    };
}
