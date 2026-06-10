/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Unit tests for optimized matrix operations (ml-matrix based).
 */

import { describe, it, expect } from 'vitest';
import {
    ridgeOptimized,
    ridgeOptimizedLU,
    predictOptimized,
    dotOptimized,
    multiplyOptimized,
    transposeOptimized,
} from '../../lib/math/matrix-optimized';
import { ridge, predict } from '../../lib/math/matrix';

describe('Optimized Matrix Operations', () => {
    describe('transposeOptimized', () => {
        it('transposes a matrix', () => {
            const A = [
                [1, 2, 3],
                [4, 5, 6],
            ];
            const At = transposeOptimized(A);
            expect(At).toEqual([
                [1, 4],
                [2, 5],
                [3, 6],
            ]);
        });
    });

    describe('multiplyOptimized', () => {
        it('multiplies two matrices', () => {
            const A = [
                [1, 2],
                [3, 4],
            ];
            const B = [
                [5, 6],
                [7, 8],
            ];
            const C = multiplyOptimized(A, B);
            expect(C).toEqual([
                [19, 22],
                [43, 50],
            ]);
        });
    });

    describe('dotOptimized', () => {
        it('computes dot product of two vectors', () => {
            const a = [1, 2, 3];
            const b = [4, 5, 6];
            expect(dotOptimized(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
        });
    });
});

describe('Optimized Ridge Regression', () => {
    describe('ridgeOptimized (Cholesky)', () => {
        it('fits a simple linear model', () => {
            // y = 2x + 1 with bias term
            const X = [
                [1, 1], // x=1, bias=1
                [2, 1], // x=2, bias=1
                [3, 1], // x=3, bias=1
                [4, 1], // x=4, bias=1
            ];
            const y = [3, 5, 7, 9]; // y = 2x + 1

            const beta = ridgeOptimized(X, y, 0); // No regularization for exact fit

            // beta[0] should be ~2 (slope), beta[1] should be ~1 (intercept)
            expect(beta[0]).toBeCloseTo(2, 3);
            expect(beta[1]).toBeCloseTo(1, 3);
        });

        it('applies regularization', () => {
            const X = [
                [1, 1],
                [2, 1],
                [3, 1],
            ];
            const y = [3, 5, 7];

            const betaNoReg = ridgeOptimized(X, y, 0);
            const betaWithReg = ridgeOptimized(X, y, 1); // Strong regularization

            // Regularization should shrink coefficients
            const normNoReg = Math.sqrt(betaNoReg[0] ** 2 + betaNoReg[1] ** 2);
            const normWithReg = Math.sqrt(betaWithReg[0] ** 2 + betaWithReg[1] ** 2);

            expect(normWithReg).toBeLessThan(normNoReg);
        });

        it('produces same results as pure JS ridge()', () => {
            // Generate test data
            const X: number[][] = [];
            const y: number[] = [];

            for (let i = 0; i < 20; i++) {
                const x = i / 10;
                X.push([x, 1]);
                y.push(3 * x + 2);
            }

            const betaPureJS = ridge(X, y, 1e-5);
            const betaOptimized = ridgeOptimized(X, y, 1e-5);

            // Results should be very close
            expect(betaOptimized[0]).toBeCloseTo(betaPureJS[0], 3);
            expect(betaOptimized[1]).toBeCloseTo(betaPureJS[1], 3);
        });
    });

    describe('ridgeOptimizedLU', () => {
        it('fits a simple linear model', () => {
            const X = [
                [1, 1],
                [2, 1],
                [3, 1],
                [4, 1],
            ];
            const y = [3, 5, 7, 9];

            const beta = ridgeOptimizedLU(X, y, 0);

            expect(beta[0]).toBeCloseTo(2, 3);
            expect(beta[1]).toBeCloseTo(1, 3);
        });
    });

    describe('predictOptimized', () => {
        it('predicts using coefficients', () => {
            const beta = [2, 1]; // y = 2x + 1
            const X = [[5, 1]]; // x = 5

            const predictions = predictOptimized(X, beta);
            expect(predictions).toEqual([11]); // 2*5 + 1
        });

        it('handles single vector input', () => {
            const beta = [2, 1];
            const x = [5, 1];

            const prediction = predictOptimized(x, beta);
            expect(prediction).toBe(11);
        });

        it('produces same results as pure JS predict()', () => {
            const beta = [3, 2];
            const X = [[5, 1], [10, 1], [15, 1]];

            const predPureJS = predict(X, beta) as number[];
            const predOptimized = predictOptimized(X, beta) as number[];

            expect(predOptimized[0]).toBeCloseTo(predPureJS[0], 5);
            expect(predOptimized[1]).toBeCloseTo(predPureJS[1], 5);
            expect(predOptimized[2]).toBeCloseTo(predPureJS[2], 5);
        });
    });

    describe('High-dimensional regression (eye tracker simulation)', () => {
        it('handles 769 features (typical eye tracker config)', () => {
            // Generate 5 samples × 769 features (16x16 face + 2×16x16 eyes + bias)
            const featureCount = 769;
            const samples = 5;
            const X: number[][] = [];
            const y: number[] = [];

            for (let i = 0; i < samples; i++) {
                const row: number[] = [];
                for (let j = 0; j < featureCount - 1; j++) {
                    row.push((Math.random() - 0.5) * 2);
                }
                row.push(1.0); // bias
                X.push(row);
                y.push(Math.random() * 1920); // screen coordinate
            }

            // Should not throw
            const beta = ridgeOptimized(X, y, 1e-5);

            // Should return correct number of coefficients
            expect(beta.length).toBe(featureCount);

            // Coefficients should be finite
            expect(beta.every(v => Number.isFinite(v))).toBe(true);
        });

        it('matches pure JS implementation for high-dimensional data', () => {
            const featureCount = 100;
            const samples = 10;
            const X: number[][] = [];
            const y: number[] = [];

            // Use seeded random for reproducibility
            const seed = 42;
            const seededRandom = () => {
                const x = Math.sin(seed) * 10000;
                return x - Math.floor(x);
            };

            for (let i = 0; i < samples; i++) {
                const row: number[] = [];
                for (let j = 0; j < featureCount - 1; j++) {
                    row.push((seededRandom() - 0.5) * 2);
                }
                row.push(1.0);
                X.push(row);
                y.push(seededRandom() * 1920);
            }

            const betaPureJS = ridge(X, y, 1e-5);
            const betaOptimized = ridgeOptimized(X, y, 1e-5);

            // Results should match within numerical tolerance
            for (let i = 0; i < featureCount; i++) {
                expect(betaOptimized[i]).toBeCloseTo(betaPureJS[i], 2);
            }
        });
    });
});
