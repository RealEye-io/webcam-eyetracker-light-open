/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/main.css';
import { installRealCameraTestMode } from './testing/installRealCameraTestMode';
import { isDemoE2EMode } from './testing/e2eConfig';
import { setEyeBoxScale, getEyeBoxScale, resetEyeBoxScale } from '../../lib/features/EyeBoxScale';
import {
    AUGMENTATION_OFFSETS_1PX,
    AUGMENTATION_OFFSETS_2PX,
    setAugmentationOffsets,
    getAugmentationOffsets,
    resetAugmentationOffsets
} from '../../lib/features/FeatureExtractor';

// Expose for testing - Eye box scale
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__setEyeBoxScale__ = setEyeBoxScale;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__getEyeBoxScale__ = getEyeBoxScale;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__resetEyeBoxScale__ = resetEyeBoxScale;

// Expose for testing - Augmentation offsets
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__AUGMENTATION_OFFSETS_1PX__ = AUGMENTATION_OFFSETS_1PX;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__AUGMENTATION_OFFSETS_2PX__ = AUGMENTATION_OFFSETS_2PX;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__setAugmentationOffsets__ = setAugmentationOffsets;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__getAugmentationOffsets__ = getAugmentationOffsets;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__resetAugmentationOffsets__ = resetAugmentationOffsets;

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const bootstrap = async (): Promise<void> => {
    await installRealCameraTestMode();

    const root = createRoot(container);
    const app = <App />;

    root.render(isDemoE2EMode() ? app : <React.StrictMode>{app}</React.StrictMode>);
};

void bootstrap();
