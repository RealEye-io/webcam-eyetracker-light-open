/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Optimized matrix operations using ml-matrix library.
 *
 * This module provides optimized implementations of matrix operations
 * using the ml-matrix library, which uses efficient algorithms for
 * matrix decomposition and solving linear systems.
 *
 * Key optimizations:
 * - Uses typed arrays internally for better memory efficiency
 * - Leverages optimized LAPACK-style algorithms
 * - Uses Cholesky decomposition for symmetric positive-definite matrices
 *   (which X'X + λI always is), providing ~2x speedup over LU
 */

import { Matrix, solve, CholeskyDecomposition } from 'ml-matrix';

export type { Matrix as MLMatrix } from 'ml-matrix';

/**
 * Ridge Regression using ml-matrix library with Cholesky decomposition.
 *
 * Solves: β = (X'X + λI)^(-1) X'y
 *
 * Uses Cholesky decomposition which is faster than LU for symmetric
 * positive-definite matrices (X'X + λI is always SPD when λ > 0).
 *
 * @param X - Feature matrix (n samples × p features) as 2D array
 * @param y - Target vector (n samples)
 * @param lambda - Regularization parameter (default 1e-5)
 * @returns Coefficient vector β (p features)
 */
export function ridgeOptimized(
    X: number[][],
    y: number[],
    lambda: number = 1e-5
): number[] {
    const n = X.length;
    const p = X[0].length;

    if (y.length !== n) {
        throw new Error(
            `Number of samples in X (${n}) must match length of y (${y.length})`
        );
    }

    // Convert to ml-matrix Matrix objects
    const Xm = new Matrix(X);
    const ym = Matrix.columnVector(y);

    // X' (transpose)
    const Xt = Xm.transpose();

    // X'X (p × p)
    const XtX = Xt.mmul(Xm);

    // X'X + λI (add regularization to diagonal)
    for (let i = 0; i < p; i++) {
        XtX.set(i, i, XtX.get(i, i) + lambda);
    }

    // X'y
    const Xty = Xt.mmul(ym);

    // Solve (X'X + λI)β = X'y using Cholesky decomposition
    // Cholesky is ~2x faster than LU for SPD matrices
    try {
        const cholesky = new CholeskyDecomposition(XtX);
        const beta = cholesky.solve(Xty);
        return beta.getColumn(0);
    } catch {
        // Fallback to general solve if Cholesky fails (shouldn't happen with λ > 0)
        const beta = solve(XtX, Xty);
        return beta.getColumn(0);
    }
}

/**
 * Ridge Regression using ml-matrix with general solve (LU-based).
 * Provided for comparison with Cholesky-based version.
 *
 * @param X - Feature matrix (n samples × p features) as 2D array
 * @param y - Target vector (n samples)
 * @param lambda - Regularization parameter (default 1e-5)
 * @returns Coefficient vector β (p features)
 */
export function ridgeOptimizedLU(
    X: number[][],
    y: number[],
    lambda: number = 1e-5
): number[] {
    const n = X.length;
    const p = X[0].length;

    if (y.length !== n) {
        throw new Error(
            `Number of samples in X (${n}) must match length of y (${y.length})`
        );
    }

    // Convert to ml-matrix Matrix objects
    const Xm = new Matrix(X);
    const ym = Matrix.columnVector(y);

    // X' (transpose)
    const Xt = Xm.transpose();

    // X'X (p × p)
    const XtX = Xt.mmul(Xm);

    // X'X + λI (add regularization to diagonal)
    for (let i = 0; i < p; i++) {
        XtX.set(i, i, XtX.get(i, i) + lambda);
    }

    // X'y
    const Xty = Xt.mmul(ym);

    // Solve using general solver (LU-based)
    const beta = solve(XtX, Xty);
    return beta.getColumn(0);
}

/**
 * Optimized matrix multiplication using ml-matrix.
 *
 * @param A - First matrix
 * @param B - Second matrix
 * @returns Product A × B
 */
export function multiplyOptimized(A: number[][], B: number[][]): number[][] {
    const Am = new Matrix(A);
    const Bm = new Matrix(B);
    return Am.mmul(Bm).to2DArray();
}

/**
 * Optimized matrix transpose using ml-matrix.
 *
 * @param A - Matrix to transpose
 * @returns Transposed matrix
 */
export function transposeOptimized(A: number[][]): number[][] {
    const Am = new Matrix(A);
    return Am.transpose().to2DArray();
}

/**
 * Compute dot product of two vectors.
 * Uses simple loop - ml-matrix doesn't provide significant benefit here.
 */
export function dotOptimized(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Vectors must have same length for dot product');
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}

/**
 * Predict using ridge regression coefficients.
 * Compatible with coefficients from ridgeOptimized().
 *
 * @param X - Feature matrix (n samples × p features) or single feature vector
 * @param beta - Coefficient vector from ridgeOptimized()
 * @returns Predictions vector (n samples) or single prediction
 */
export function predictOptimized(
    X: number[][] | number[],
    beta: number[]
): number[] | number {
    // Handle single feature vector
    if (!Array.isArray(X[0])) {
        return dotOptimized(X as number[], beta);
    }

    // Handle feature matrix
    const XMatrix = X as number[][];
    return XMatrix.map(row => dotOptimized(row, beta));
}
