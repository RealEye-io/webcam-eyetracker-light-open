/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Unit tests for matrix operations and ridge regression.
 */

import { describe, it, expect } from 'vitest';
import {
    zeros,
    identity,
    transpose,
    multiply,
    addToDiagonal,
    luDecompose,
    luSolve,
    dot,
    ridge,
    predict,
} from '../../lib/math/matrix';

describe('Matrix Operations', () => {
    describe('zeros', () => {
        it('creates a matrix filled with zeros', () => {
            const m = zeros(2, 3);
            expect(m).toEqual([
                [0, 0, 0],
                [0, 0, 0],
            ]);
        });
    });

    describe('identity', () => {
        it('creates an identity matrix', () => {
            const m = identity(3);
            expect(m).toEqual([
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1],
            ]);
        });
    });

    describe('transpose', () => {
        it('transposes a matrix', () => {
            const A = [
                [1, 2, 3],
                [4, 5, 6],
            ];
            const At = transpose(A);
            expect(At).toEqual([
                [1, 4],
                [2, 5],
                [3, 6],
            ]);
        });
    });

    describe('multiply', () => {
        it('multiplies two matrices', () => {
            const A = [
                [1, 2],
                [3, 4],
            ];
            const B = [
                [5, 6],
                [7, 8],
            ];
            const C = multiply(A, B);
            expect(C).toEqual([
                [19, 22],
                [43, 50],
            ]);
        });

        it('throws for incompatible dimensions', () => {
            const A = [[1, 2, 3]];
            const B = [[1, 2]];
            expect(() => multiply(A, B)).toThrow();
        });
    });

    describe('addToDiagonal', () => {
        it('adds scalar to diagonal elements', () => {
            const A = [
                [1, 2],
                [3, 4],
            ];
            const result = addToDiagonal(A, 10);
            expect(result).toEqual([
                [11, 2],
                [3, 14],
            ]);
        });
    });

    describe('dot', () => {
        it('computes dot product of two vectors', () => {
            const a = [1, 2, 3];
            const b = [4, 5, 6];
            expect(dot(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
        });
    });

    describe('luDecompose', () => {
        it('decomposes a simple matrix', () => {
            const A = [
                [2, 1],
                [1, 3],
            ];
            const { L, U } = luDecompose(A);

            // Verify L is lower triangular
            expect(L[0][1]).toBe(0);

            // Verify U is upper triangular
            expect(U[1][0]).toBe(0);
        });
    });

    describe('luSolve', () => {
        it('solves a simple linear system', () => {
            // Solve: 2x + y = 5, x + 3y = 6 => x = 1.8, y = 1.4
            const A = [
                [2, 1],
                [1, 3],
            ];
            const b = [5, 6];
            const x = luSolve(A, b);

            expect(x[0]).toBeCloseTo(1.8, 5);
            expect(x[1]).toBeCloseTo(1.4, 5);
        });

        it('solves a 3x3 system', () => {
            const A = [
                [3, 2, -1],
                [2, -2, 4],
                [-1, 0.5, -1],
            ];
            const b = [1, -2, 0];
            const x = luSolve(A, b);

            // Verify Ax = b
            const result = multiply(A, x.map(v => [v])).map(r => r[0]);
            expect(result[0]).toBeCloseTo(b[0], 5);
            expect(result[1]).toBeCloseTo(b[1], 5);
            expect(result[2]).toBeCloseTo(b[2], 5);
        });
    });
});

describe('Ridge Regression', () => {
    describe('ridge', () => {
        it('fits a simple linear model', () => {
            // y = 2x + 1 with bias term
            const X = [
                [1, 1], // x=1, bias=1
                [2, 1], // x=2, bias=1
                [3, 1], // x=3, bias=1
                [4, 1], // x=4, bias=1
            ];
            const y = [3, 5, 7, 9]; // y = 2x + 1

            const beta = ridge(X, y, 0); // No regularization for exact fit

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

            const betaNoReg = ridge(X, y, 0);
            const betaWithReg = ridge(X, y, 1); // Strong regularization

            // Regularization should shrink coefficients
            const normNoReg = Math.sqrt(betaNoReg[0] ** 2 + betaNoReg[1] ** 2);
            const normWithReg = Math.sqrt(betaWithReg[0] ** 2 + betaWithReg[1] ** 2);

            expect(normWithReg).toBeLessThan(normNoReg);
        });
    });

    describe('predict', () => {
        it('predicts using coefficients', () => {
            const beta = [2, 1]; // y = 2x + 1
            const X = [[5, 1]]; // x = 5

            const predictions = predict(X, beta);
            expect(predictions).toEqual([11]); // 2*5 + 1
        });

        it('handles single vector input', () => {
            const beta = [2, 1];
            const x = [5, 1];

            const prediction = predict(x, beta);
            expect(prediction).toBe(11);
        });
    });

    describe('end-to-end regression', () => {
        it('fits and predicts noisy data', () => {
            // Generate noisy data: y = 3x + 2 + noise
            const X: number[][] = [];
            const y: number[] = [];

            for (let i = 0; i < 100; i++) {
                const x = i / 10;
                const noise = (Math.random() - 0.5) * 0.5;
                X.push([x, 1]);
                y.push(3 * x + 2 + noise);
            }

            const beta = ridge(X, y, 1e-5);

            // Check that coefficients are close to true values
            expect(beta[0]).toBeCloseTo(3, 0); // slope
            expect(beta[1]).toBeCloseTo(2, 0); // intercept

            // Check predictions
            const testX = [[5, 1], [10, 1]];
            const predictions = predict(testX, beta) as number[];

            expect(predictions[0]).toBeCloseTo(17, 0); // 3*5 + 2
            expect(predictions[1]).toBeCloseTo(32, 0); // 3*10 + 2
        });
    });
});
