/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

/**
 * Eye bounding box scale factor for experiments.
 * Controls how much area around the eye landmarks is captured.
 */
export let EYE_BOX_SCALE = 1.2;

export function setEyeBoxScale(scale: number): void {
    EYE_BOX_SCALE = scale;
}

export function getEyeBoxScale(): number {
    return EYE_BOX_SCALE;
}

export function resetEyeBoxScale(): void {
    EYE_BOX_SCALE = 1.0;
}
