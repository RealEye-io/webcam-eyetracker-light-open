/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Matrix operations for ridge regression.
 * All matrices are represented as 2D arrays: number[][] where [row][col].
 */

export type Matrix = number[][];
export type Vector = number[];

/**
 * Create a matrix filled with zeros.
 */
export function zeros(rows: number, cols: number): Matrix {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
}

/**
 * Create an identity matrix of size n×n.
 */
export function identity(n: number): Matrix {
    const result = zeros(n, n);
    for (let i = 0; i < n; i++) {
        result[i][i] = 1;
    }
    return result;
}

/**
 * Transpose a matrix: swap rows and columns.
 */
export function transpose(A: Matrix): Matrix {
    const rows = A.length;
    const cols = A[0].length;
    const result = zeros(cols, rows);
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            result[j][i] = A[i][j];
        }
    }
    return result;
}

/**
 * Multiply two matrices A (m×n) and B (n×p) → C (m×p).
 */
export function multiply(A: Matrix, B: Matrix): Matrix {
    const m = A.length;
    const n = A[0].length;
    const p = B[0].length;

    if (B.length !== n) {
        throw new Error(
            `Matrix dimensions incompatible for multiplication: A is ${m}×${n}, B is ${B.length}×${p}`
        );
    }

    const C = zeros(m, p);
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < p; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) {
                sum += A[i][k] * B[k][j];
            }
            C[i][j] = sum;
        }
    }
    return C;
}

/**
 * Multiply matrix A by a scalar value.
 */
export function scalarMultiply(A: Matrix, scalar: number): Matrix {
    return A.map(row => row.map(val => val * scalar));
}

/**
 * Add two matrices element-wise.
 */
export function add(A: Matrix, B: Matrix): Matrix {
    if (A.length !== B.length || A[0].length !== B[0].length) {
        throw new Error('Matrix dimensions must match for addition');
    }
    return A.map((row, i) => row.map((val, j) => val + B[i][j]));
}

/**
 * Add a scalar to the diagonal elements of a square matrix.
 * Used for ridge regularization: A + λI
 */
export function addToDiagonal(A: Matrix, scalar: number): Matrix {
    const n = A.length;
    if (A[0].length !== n) {
        throw new Error('Matrix must be square for addToDiagonal');
    }
    const result = A.map(row => [...row]);
    for (let i = 0; i < n; i++) {
        result[i][i] += scalar;
    }
    return result;
}

/**
 * Convert a 1D vector to a column matrix (n×1).
 */
export function vectorToColumn(v: Vector): Matrix {
    return v.map(val => [val]);
}

/**
 * Extract a column from a matrix as a vector.
 */
export function columnToVector(A: Matrix, col: number = 0): Vector {
    return A.map(row => row[col]);
}

/**
 * LU Decomposition with partial pivoting.
 * Decomposes matrix A into L (lower triangular) and U (upper triangular).
 * Returns { L, U, P } where P*A = L*U
 */
export function luDecompose(A: Matrix): { L: Matrix; U: Matrix; P: number[] } {
    const n = A.length;
    if (A[0].length !== n) {
        throw new Error('LU decomposition requires a square matrix');
    }

    // Create working copy of A
    const U = A.map(row => [...row]);
    const L = identity(n);
    const P: number[] = Array.from({ length: n }, (_, i) => i);

    for (let k = 0; k < n; k++) {
        // Find pivot (largest absolute value in column k, from row k downward)
        let maxVal = Math.abs(U[k][k]);
        let maxRow = k;
        for (let i = k + 1; i < n; i++) {
            if (Math.abs(U[i][k]) > maxVal) {
                maxVal = Math.abs(U[i][k]);
                maxRow = i;
            }
        }

        // Swap rows in U, P, and L (for columns < k)
        if (maxRow !== k) {
            [U[k], U[maxRow]] = [U[maxRow], U[k]];
            [P[k], P[maxRow]] = [P[maxRow], P[k]];
            for (let j = 0; j < k; j++) {
                [L[k][j], L[maxRow][j]] = [L[maxRow][j], L[k][j]];
            }
        }

        // Check for singularity
        if (Math.abs(U[k][k]) < 1e-12) {
            throw new Error('Matrix is singular or nearly singular');
        }

        // Eliminate below diagonal
        for (let i = k + 1; i < n; i++) {
            const factor = U[i][k] / U[k][k];
            L[i][k] = factor;
            for (let j = k; j < n; j++) {
                U[i][j] -= factor * U[k][j];
            }
        }
    }

    return { L, U, P };
}

/**
 * Solve a linear system Ax = b using LU decomposition.
 * First solves Ly = Pb (forward substitution),
 * then solves Ux = y (backward substitution).
 */
export function luSolve(A: Matrix, b: Vector): Vector {
    const n = A.length;
    if (b.length !== n) {
        throw new Error('Vector b must have same length as matrix dimension');
    }

    const { L, U, P } = luDecompose(A);

    // Apply permutation to b
    const pb = P.map(i => b[i]);

    // Forward substitution: Ly = pb
    const y: Vector = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        let sum = pb[i];
        for (let j = 0; j < i; j++) {
            sum -= L[i][j] * y[j];
        }
        y[i] = sum;
    }

    // Backward substitution: Ux = y
    const x: Vector = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = y[i];
        for (let j = i + 1; j < n; j++) {
            sum -= U[i][j] * x[j];
        }
        x[i] = sum / U[i][i];
    }

    return x;
}

/**
 * Compute dot product of two vectors.
 */
export function dot(a: Vector, b: Vector): number {
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
 * Ridge Regression: Solve for coefficients β in y = Xβ + ε
 * with L2 regularization.
 *
 * Solves: β = (X'X + λI)^(-1) X'y
 *
 * @param X - Feature matrix (n samples × p features)
 * @param y - Target vector (n samples)
 * @param lambda - Regularization parameter (default 1e-5)
 * @returns Coefficient vector β (p features)
 */
export function ridge(X: Matrix, y: Vector, lambda: number = 1e-5): Vector {
    const n = X.length;

    if (y.length !== n) {
        throw new Error(
            `Number of samples in X (${n}) must match length of y (${y.length})`
        );
    }

    // X' (transpose)
    const Xt = transpose(X);

    // X'X (p × p)
    const XtX = multiply(Xt, X);

    // X'X + λI (add regularization to diagonal)
    const XtXreg = addToDiagonal(XtX, lambda);

    // X'y (p × 1 as vector)
    const yCol = vectorToColumn(y);
    const XtyMatrix = multiply(Xt, yCol);
    const Xty = columnToVector(XtyMatrix);

    // Solve (X'X + λI)β = X'y
    const beta = luSolve(XtXreg, Xty);

    return beta;
}

/**
 * Predict using ridge regression coefficients.
 *
 * @param X - Feature matrix (n samples × p features) or single feature vector
 * @param beta - Coefficient vector from ridge()
 * @returns Predictions vector (n samples)
 */
export function predict(X: Matrix | Vector, beta: Vector): Vector | number {
    // Handle single feature vector
    if (!Array.isArray(X[0])) {
        return dot(X as Vector, beta);
    }

    // Handle feature matrix
    const XMatrix = X as Matrix;
    return XMatrix.map(row => dot(row, beta));
}
