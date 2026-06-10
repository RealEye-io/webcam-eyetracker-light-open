/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import type { RealCameraTestConfig } from '@realeye-io/realtesting-camera';

import type { RealCameraTestSourceDescriptor } from '@realeye-io/realtesting-camera';

export interface WebcamETLightDemoE2EConfig {
    enabled?: boolean;
    delegate?: 'GPU' | 'CPU';
    runningMode?: 'VIDEO' | 'IMAGE';
    maxResolution?: 'VGA' | 'HD' | 'Full HD' | 'QHD' | '4K';
    calibrationSamplesPerPoint?: number;
    calibrationCaptureIntervalMs?: number;
    calibrationInitialDelayMs?: number;
    permissionAutoResponse?: {
        allow: boolean;
        afterPromptMs?: number;
    };
    primarySourceDescriptor?: RealCameraTestSourceDescriptor;
    secondarySourceDescriptor?: RealCameraTestSourceDescriptor;
    // When true, renders the full App component (with CSS) instead of DemoE2EStaticHarness,
    // while still using the DemoE2ETracker and virtual camera.
    renderFullApp?: boolean;
    // When true, DemoE2ETracker always reports a synthetic face for every frame.
    forceFaceDetection?: boolean;
}

export interface WebcamETLightDemoState {
    trackerState: string;
    isInitializing: boolean;
    isCalibrating: boolean;
    isTracking: boolean;
    error: string | null;
    hasGaze: boolean;
    noFaceDetected: boolean;
    selectedDeviceId: string | null;
    canStartCalibration: boolean;
    canStartTracking: boolean;
    calibrationPointCount: number;
}

export interface WebcamETLightDemoTestApi {
    tracker: unknown;
    getState: () => WebcamETLightDemoState;
}

export interface WebcamETLightDemoE2EVideoDevice {
    id: string;
    label: string;
    enabled: boolean;
}

export interface WebcamETLightDemoE2EVideoBridge {
    listDevices: () => WebcamETLightDemoE2EVideoDevice[];
    getSourceDescriptor: (deviceId: string) => RealCameraTestSourceDescriptor | null;
    subscribe: (listener: () => void) => () => void;
}

declare global {
    interface Window {
        __REALCAMERA_TEST_CONFIG__?: RealCameraTestConfig;
        __WEBCAM_ET_LIGHT_E2E_CONFIG__?: WebcamETLightDemoE2EConfig;
        __webcamETLightDemo__?: WebcamETLightDemoTestApi;
        __webcamEtLightE2EVideo__?: WebcamETLightDemoE2EVideoBridge;
        __WebcamETLight__?: unknown;
    }
}

const TEST_MODE_QUERY_PARAMS = [
    'realcameraTest',
    'realcamera-test',
    'realtestingTest',
    'realtesting-test',
    'webcamEtLightE2E',
    'webcam-et-light-e2e',
] as const;

export const getDemoE2EConfig = (): WebcamETLightDemoE2EConfig => {
    if (typeof window === 'undefined') {
        return {};
    }

    return window.__WEBCAM_ET_LIGHT_E2E_CONFIG__ ?? {};
};

export const isDemoE2EMode = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }

    const params = new URLSearchParams(window.location.search);
    const hasTestQueryParam = TEST_MODE_QUERY_PARAMS.some((param) => params.has(param));
    const e2eConfig = getDemoE2EConfig();

    return Boolean(
        hasTestQueryParam ||
        e2eConfig.enabled === true ||
        window.__REALCAMERA_TEST_CONFIG__?.enabled === true
    );
};

/** Returns true when E2E mode is active but the full App (with CSS) should render instead of StaticHarness. */
export const shouldRenderFullApp = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }
    const e2eConfig = getDemoE2EConfig();
    return e2eConfig.renderFullApp === true;
};
