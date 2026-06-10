/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Unit tests for CalibrationPatterns module.
 */

import { describe, it, expect } from 'vitest';
import {
    CalibrationPattern,
    TARGET_MAE_THRESHOLD,
    RECOMMENDED_SAMPLES_PER_POINT,
    getCalibrationPoints,
    getRecommendedPattern,
    toScreenCoordinates,
    getCalibrationPointsInPixels,
    getPatternInfo,
} from '../../lib/calibration/CalibrationPatterns';

describe('CalibrationPatterns', () => {
    describe('getCalibrationPoints', () => {
        it('returns 17 points for GRID_17 pattern', () => {
            const points = getCalibrationPoints(CalibrationPattern.GRID_17);
            expect(points).toHaveLength(17);
        });

        it('all points have coordinates between 0 and 1', () => {
            const points = getCalibrationPoints(CalibrationPattern.GRID_17);
            for (const point of points) {
                expect(point.x).toBeGreaterThanOrEqual(0);
                expect(point.x).toBeLessThanOrEqual(1);
                expect(point.y).toBeGreaterThanOrEqual(0);
                expect(point.y).toBeLessThanOrEqual(1);
            }
        });

        it('includes center point', () => {
            const points = getCalibrationPoints(CalibrationPattern.GRID_17);
            const hasCenter = points.some(p =>
                Math.abs(p.x - 0.5) < 0.1 && Math.abs(p.y - 0.5) < 0.1
            );
            expect(hasCenter).toBe(true);
        });
    });

    describe('getRecommendedPattern', () => {
        it('returns GRID_17', () => {
            expect(getRecommendedPattern()).toBe(CalibrationPattern.GRID_17);
        });
    });

    describe('toScreenCoordinates', () => {
        it('converts normalized to screen coordinates correctly', () => {
            const result = toScreenCoordinates({ x: 0.5, y: 0.5 }, 1920, 1080);
            expect(result.x).toBe(960);
            expect(result.y).toBe(540);
        });

        it('handles edge cases', () => {
            expect(toScreenCoordinates({ x: 0, y: 0 }, 1920, 1080)).toEqual({ x: 0, y: 0 });
            expect(toScreenCoordinates({ x: 1, y: 1 }, 1920, 1080)).toEqual({ x: 1920, y: 1080 });
        });
    });

    describe('getCalibrationPointsInPixels', () => {
        it('converts all points to screen coordinates', () => {
            const pixels = getCalibrationPointsInPixels(
                CalibrationPattern.GRID_17,
                1920,
                1080
            );

            expect(pixels).toHaveLength(17);

            for (const p of pixels) {
                expect(Number.isInteger(p.x)).toBe(true);
                expect(Number.isInteger(p.y)).toBe(true);
                expect(p.x).toBeGreaterThanOrEqual(0);
                expect(p.x).toBeLessThanOrEqual(1920);
                expect(p.y).toBeGreaterThanOrEqual(0);
                expect(p.y).toBeLessThanOrEqual(1080);
            }
        });
    });

    describe('getPatternInfo', () => {
        it('returns correct info for GRID_17', () => {
            const info = getPatternInfo(CalibrationPattern.GRID_17);
            expect(info.pointCount).toBe(17);
            expect(info.name).toBeTruthy();
            expect(info.description).toBeTruthy();
        });

        it('returns meetsTarget=false when experimental MAE is unknown', () => {
            const info = getPatternInfo(CalibrationPattern.GRID_17);
            expect(info.experimentalMAE).toBeNull();
            expect(info.meetsTarget).toBe(false);
        });
    });

    describe('constants', () => {
        it('TARGET_MAE_THRESHOLD is 110', () => {
            expect(TARGET_MAE_THRESHOLD).toBe(110);
        });

        it('RECOMMENDED_SAMPLES_PER_POINT is 5', () => {
            expect(RECOMMENDED_SAMPLES_PER_POINT).toBe(5);
        });
    });
});
