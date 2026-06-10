/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test as base, expect, type Page } from '@playwright/test';
import type { RealCameraTestConfig, RealCameraTestSourceDescriptor } from '@realeye-io/realtesting-camera';

const CAMERA_STORAGE_KEY = 'webcam-et-light-selected-camera';

interface DemoE2EConfig {
    enabled?: boolean;
    delegate?: 'GPU' | 'CPU';
    runningMode?: 'VIDEO' | 'IMAGE';
    maxResolution?: 'VGA' | 'HD' | 'Full HD' | 'QHD' | '4K';
    calibrationSamplesPerPoint?: number;
    calibrationCaptureIntervalMs?: number;
    calibrationInitialDelayMs?: number;
    renderFullApp?: boolean;
    forceFaceDetection?: boolean;
    permissionAutoResponse?: {
        allow: boolean;
        afterPromptMs?: number;
    };
    primarySourceDescriptor?: RealCameraTestSourceDescriptor;
    secondarySourceDescriptor?: RealCameraTestSourceDescriptor;
}

interface DemoNavigationOptions {
    realCameraConfig?: Partial<RealCameraTestConfig>;
    e2eConfig?: Partial<DemoE2EConfig>;
    searchParams?: Record<string, string | number | boolean | undefined>;
    // When true, skips the E2E query params so the full App (with real CSS) renders
    // instead of DemoE2EStaticHarness. Still retains virtual camera support via
    // __REALCAMERA_TEST_CONFIG__ addInitScript.
    skipE2EMode?: boolean;
}

interface VirtualDeviceInfo {
    id: string;
    label: string;
    enabled: boolean;
}

interface PermissionRequest {
    id: string;
    deviceId: string;
    requestedAt: number;
}

interface DemoHarness {
    goto: (options?: DemoNavigationOptions) => Promise<void>;
    startPreview: () => Promise<void>;
    waitForTrackerReady: () => Promise<void>;
    waitForNoFace: () => Promise<void>;
    waitForFaceDetected: () => Promise<void>;
    getState: () => Promise<Record<string, unknown>>;
    listVirtualDevices: () => Promise<VirtualDeviceInfo[]>;
    getPrimaryDeviceId: () => Promise<string>;
    getSecondaryDeviceId: () => Promise<string>;
    setFaceSource: (deviceId?: string) => Promise<string>;
    setPersonSource: (deviceId?: string) => Promise<string>;
    setBlankSource: (deviceId?: string, label?: string) => Promise<string>;
    setPatternSource: (deviceId?: string, label?: string) => Promise<string>;
    waitForPermissionRequest: () => Promise<PermissionRequest>;
    respondToPermissionRequest: (id: string, allow: boolean, afterMs?: number) => Promise<void>;
    flushPendingPermissionRequests: (allow: boolean) => Promise<void>;
}

const DEFAULT_REALCAMERA_CONFIG: RealCameraTestConfig = {
    enabled: true,
    blockPhysicalDevices: true,
    virtualPermission: 'allow',
    virtualVideoConstraintsOverride: {
        width: 640,
        height: 480,
        frameRate: 30,
    },
};

const DEFAULT_E2E_CONFIG: DemoE2EConfig = {
    enabled: true,
    renderFullApp: true,
    delegate: 'CPU',
    runningMode: 'IMAGE',
    maxResolution: 'VGA',
    calibrationSamplesPerPoint: 1,
    calibrationCaptureIntervalMs: 0,
    calibrationInitialDelayMs: 0,
};

const waitForRealCameraApi = async (page: Page): Promise<void> => {
    const hasImmediateApi = await page.evaluate(
        () => Boolean((window as Window & { __realcameraTestApi?: unknown }).__realcameraTestApi)
    );

    if (!hasImmediateApi) {
        await page.waitForFunction(
            () => Boolean((window as Window & { __realcameraTestApi?: unknown }).__realcameraTestApi),
            { timeout: 10_000 }
        );
    }
};

const buildDemoUrl = (searchParams?: Record<string, string | number | boolean | undefined>, skipE2EMode?: boolean): string => {
    const params = new URLSearchParams();

    if (!skipE2EMode) {
        params.set('realcameraTest', '1');
        params.set('webcamEtLightE2E', '1');
    }

    for (const [key, value] of Object.entries(searchParams ?? {})) {
        if (value === undefined) {
            continue;
        }
        params.set(key, String(value));
    }

    return `/?${params.toString()}`;
};

const resolveDeviceId = async (page: Page, index: number): Promise<string> => {
    const deviceId = await page.evaluate((targetIndex: number) => {
        const api = (window as Window & {
            __realcameraTestApi?: { listVirtualDevices: () => Array<{ id: string }> };
        }).__realcameraTestApi;
        return api?.listVirtualDevices()[targetIndex]?.id ?? null;
    }, index);

    if (!deviceId) {
        throw new Error(`Virtual device at index ${index} is not available.`);
    }

    return deviceId;
};

const setSourceForDevice = async (
    page: Page,
    deviceId: string,
    descriptor: RealCameraTestSourceDescriptor
): Promise<void> => {
    await page.evaluate(
        async ({ id, source }: { id: string; source: RealCameraTestSourceDescriptor }) => {
            const api = (window as Window & {
                __realcameraTestApi?: {
                    setVirtualSourceForDevice: (
                        deviceId: string,
                        descriptor: RealCameraTestSourceDescriptor
                    ) => Promise<void>;
                };
            }).__realcameraTestApi;

            if (!api) {
                throw new Error('RealCamera test API is not available.');
            }

            await api.setVirtualSourceForDevice(id, source);
        },
        { id: deviceId, source: descriptor }
    );
};

export const test = base.extend<{ demoApp: DemoHarness }>({
    page: async ({ page }, use) => {
        await page.context().grantPermissions(['camera']);
        await use(page);
    },
    demoApp: async ({ page }, use) => {
        const demoApp: DemoHarness = {
            goto: async (options = {}) => {
                const realCameraConfig: RealCameraTestConfig = {
                    ...DEFAULT_REALCAMERA_CONFIG,
                    ...options.realCameraConfig,
                };
                const e2eConfig: DemoE2EConfig = {
                    ...DEFAULT_E2E_CONFIG,
                    ...options.e2eConfig,
                };

                await page.addInitScript(
                    ({ cameraStorageKey, testCameraConfig, demoConfig }) => {
                        window.localStorage.removeItem(cameraStorageKey);
                        (window as Window & { __REALCAMERA_TEST_CONFIG__?: unknown }).__REALCAMERA_TEST_CONFIG__ = testCameraConfig;
                        (window as Window & { __WEBCAM_ET_LIGHT_E2E_CONFIG__?: unknown }).__WEBCAM_ET_LIGHT_E2E_CONFIG__ = demoConfig;
                    },
                    {
                        cameraStorageKey: CAMERA_STORAGE_KEY,
                        testCameraConfig: realCameraConfig,
                        demoConfig: e2eConfig,
                    }
                );

                await page.goto(buildDemoUrl(options.searchParams, options.skipE2EMode), { waitUntil: 'domcontentloaded' });
                await waitForRealCameraApi(page);
            },
            startPreview: async () => {
                await page.getByTestId('start-camera-button').click({ force: true });
                await page.waitForFunction(() => {
                    const api = (window as Window & {
                        __webcamETLightDemo__?: {
                            getState: () => { isPreviewStarted: boolean };
                        };
                    }).__webcamETLightDemo__;
                    return api?.getState().isPreviewStarted === true;
                });
            },
            waitForTrackerReady: async () => {
                await expect(page.getByTestId('tracker-status-dot')).toHaveAttribute(
                    'data-state',
                    /(ready|calibrated)/,
                    { timeout: 30_000 }
                );
            },
            waitForNoFace: async () => {
                await page.waitForFunction(() => {
                    const api = (window as Window & {
                        __webcamETLightDemo__?: {
                            getState: () => { noFaceDetected: boolean };
                        };
                    }).__webcamETLightDemo__;
                    return api?.getState().noFaceDetected === true;
                });
            },
            waitForFaceDetected: async () => {
                await page.waitForFunction(() => {
                    const api = (window as Window & {
                        __webcamETLightDemo__?: {
                            getState: () => { noFaceDetected: boolean; canStartCalibration: boolean };
                        };
                    }).__webcamETLightDemo__;
                    const state = api?.getState();
                    return Boolean(state && state.noFaceDetected === false && state.canStartCalibration === true);
                });
            },
            getState: async () => {
                return page.evaluate(() => {
                    const api = (window as Window & {
                        __webcamETLightDemo__?: { getState: () => Record<string, unknown> };
                    }).__webcamETLightDemo__;
                    return api?.getState() ?? {};
                });
            },
            listVirtualDevices: async () => {
                return page.evaluate(() => {
                    const api = (window as Window & {
                        __realcameraTestApi?: {
                            listVirtualDevices: () => Array<{ id: string; label: string; enabled: boolean }>;
                        };
                    }).__realcameraTestApi;
                    return api?.listVirtualDevices() ?? [];
                });
            },
            getPrimaryDeviceId: async () => resolveDeviceId(page, 0),
            getSecondaryDeviceId: async () => resolveDeviceId(page, 1),
            setFaceSource: async (deviceId?: string) => {
                const id = deviceId ?? (await resolveDeviceId(page, 0));
                await setSourceForDevice(page, id, {
                    type: 'color',
                    color: '#d9a17a',
                    text: 'Face fixture',
                });
                return id;
            },
            setPersonSource: async (deviceId?: string) => {
                const id = deviceId ?? (await resolveDeviceId(page, 0));
                await setSourceForDevice(page, id, {
                    type: 'image',
                    url: '/person_in_camera.webp',
                });
                return id;
            },
            setBlankSource: async (deviceId?: string, label: string = 'No face fixture') => {
                const id = deviceId ?? (await resolveDeviceId(page, 0));
                await setSourceForDevice(page, id, {
                    type: 'blank',
                    color: '#0f172a',
                    text: label,
                });
                return id;
            },
            setPatternSource: async (deviceId?: string, label: string = 'Pattern fixture') => {
                const id = deviceId ?? (await resolveDeviceId(page, 0));
                await setSourceForDevice(page, id, {
                    type: 'color',
                    color: '#1d4ed8',
                    text: label,
                });
                return id;
            },
            waitForPermissionRequest: async () => {
                return page.evaluate(async () => {
                    const api = (window as Window & {
                        __realcameraTestApi?: {
                            waitForPermissionRequest: () => Promise<PermissionRequest>;
                        };
                    }).__realcameraTestApi;
                    if (!api) {
                        throw new Error('RealCamera test API is not available.');
                    }
                    return api.waitForPermissionRequest();
                });
            },
            respondToPermissionRequest: async (id: string, allow: boolean, afterMs: number = 0) => {
                await page.evaluate(
                    ({ requestId, isAllowed, delayMs }) => {
                        const api = (window as Window & {
                            __realcameraTestApi?: {
                                respondToPermissionRequest: (
                                    id: string,
                                    allow: boolean,
                                    options?: { afterMs?: number }
                                ) => Promise<void>;
                            };
                        }).__realcameraTestApi;
                        if (!api) {
                            throw new Error('RealCamera test API is not available.');
                        }

                        void api.respondToPermissionRequest(requestId, isAllowed, { afterMs: delayMs });
                    },
                    { requestId: id, isAllowed: allow, delayMs: afterMs }
                );
            },
            flushPendingPermissionRequests: async (allow: boolean) => {
                await page.evaluate((isAllowed: boolean) => {
                    const api = (window as Window & {
                        __realcameraTestApi?: {
                            listPendingPermissionRequests: () => PermissionRequest[];
                            respondToPermissionRequest: (
                                id: string,
                                allow: boolean,
                                options?: { afterMs?: number }
                            ) => Promise<void>;
                        };
                    }).__realcameraTestApi;
                    if (!api) {
                        throw new Error('RealCamera test API is not available.');
                    }

                    const pending = api.listPendingPermissionRequests();
                    for (const request of pending) {
                        void api.respondToPermissionRequest(request.id, isAllowed);
                    }
                }, allow);
            },
        };

        await use(demoApp);
    },
});

export { expect };
