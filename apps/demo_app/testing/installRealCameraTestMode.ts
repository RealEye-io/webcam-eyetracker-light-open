/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import type { RealCameraTestSourceDescriptor } from '@realeye-io/realtesting-camera';
import {
    getDemoE2EConfig,
    isDemoE2EMode,
    type WebcamETLightDemoE2EVideoBridge,
    type WebcamETLightDemoE2EVideoDevice,
} from './e2eConfig';
import { PERSON_IMAGE_DESCRIPTOR } from './personImageUri';

type RealCameraTestWindow = Window & {
    __realcameraTestApi?: {
        setVirtualSourceForDevice: (
            id: string,
            descriptor: RealCameraTestSourceDescriptor
        ) => Promise<void>;
        listPendingPermissionRequests: () => Array<{ id: string }>;
        respondToPermissionRequest: (
            id: string,
            allow: boolean,
            options?: { afterMs?: number }
        ) => Promise<void>;
        listVirtualDevices: () => WebcamETLightDemoE2EVideoDevice[];
    };
    __webcamEtLightPermissionAutoResponderId__?: number;
    __webcamEtLightE2EVideo__?: WebcamETLightDemoE2EVideoBridge;
};

const DEFAULT_TEST_CONSTRAINTS = {
    width: 640,
    height: 480,
    frameRate: 30,
} as const;

const drawLabel = (
    ctx: CanvasRenderingContext2D,
    text: string,
    y: number,
    fontSize: number = 22
): void => {
    ctx.fillStyle = '#f8fafc';
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillText(text, 24, y);
};

const createBlankSource = (label: string) => ({
    type: 'callback' as const,
    draw: (ctx: CanvasRenderingContext2D, info: { width: number; height: number }) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, info.width, info.height);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 4;
        ctx.strokeRect(12, 12, info.width - 24, info.height - 24);
        drawLabel(ctx, label, 48, 24);
        drawLabel(ctx, 'Use __realcameraTestApi.setVirtualSourceForDevice(...)', 84, 16);
    },
});

const createAlternateSource = (label: string) => ({
    type: 'callback' as const,
    draw: (ctx: CanvasRenderingContext2D, info: { width: number; height: number; frameIndex: number }) => {
        const gradient = ctx.createLinearGradient(0, 0, info.width, info.height);
        gradient.addColorStop(0, '#22d3ee');
        gradient.addColorStop(1, '#a855f7');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, info.width, info.height);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.fillRect(16, 16, info.width - 32, 86);
        drawLabel(ctx, label, 52, 24);
        drawLabel(ctx, `Frame ${info.frameIndex}`, 82, 18);
    },
});

const createDescriptorSource = (descriptor: RealCameraTestSourceDescriptor) => {
    switch (descriptor.type) {
        case 'blank':
            return createBlankSource(descriptor.text ?? 'ET Light blank fixture');
        case 'pattern':
            return createAlternateSource('ET Light pattern fixture');
        case 'color':
            return {
                type: 'callback' as const,
                draw: (ctx: CanvasRenderingContext2D, info: { width: number; height: number }) => {
                    ctx.fillStyle = descriptor.color;
                    ctx.fillRect(0, 0, info.width, info.height);
                    if ('text' in descriptor && descriptor.text) {
                        drawLabel(ctx, descriptor.text, 48, 24);
                    }
                },
            };
        default:
            return null;
    }
};

const imageUrlToDataUrl = async (url: string): Promise<string> => {
    if (url.startsWith('data:')) {
        return url;
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load image source: ${url}`);
    }

    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error(`Failed to read image source: ${url}`));
        reader.readAsDataURL(blob);
    });
};

export const installRealCameraTestMode = async (): Promise<void> => {
    if (!isDemoE2EMode()) {
        return;
    }

    const demoConfig = getDemoE2EConfig();

    const { RealCamera } = await import('@realeye-io/realtesting-camera');
    if (RealCamera.isInstalled()) {
        return;
    }

    RealCamera.install({
        mode: 'proxy',
        virtualPermission: 'allow',
        blockPhysicalDevices: true,
        testApi: {
            autoEnable: true,
        },
    });

    const primaryDeviceId = RealCamera.createVirtualDevice({
        label: 'ET Light Test Camera A',
        defaultConstraints: DEFAULT_TEST_CONSTRAINTS,
    });
    const secondaryDeviceId = RealCamera.createVirtualDevice({
        label: 'ET Light Test Camera B',
        defaultConstraints: DEFAULT_TEST_CONSTRAINTS,
    });

    // Always start with blank source — will be overridden for renderFullApp below
    const defaultPrimaryDescriptor: RealCameraTestSourceDescriptor = {
        type: 'blank',
        color: '#0f172a',
        text: 'ET Light test camera A',
    };
    const defaultSecondaryDescriptor: RealCameraTestSourceDescriptor = {
        type: 'pattern',
    };
    const sourceDescriptors = new Map<string, RealCameraTestSourceDescriptor>([
        [primaryDeviceId, demoConfig.primarySourceDescriptor ?? defaultPrimaryDescriptor],
        [secondaryDeviceId, demoConfig.secondarySourceDescriptor ?? defaultSecondaryDescriptor],
    ]);
    const listeners = new Set<() => void>();
    const notifyListeners = () => {
        for (const listener of listeners) {
            listener();
        }
    };

    const applyDescriptorSource = async (
        deviceId: string,
        descriptor: RealCameraTestSourceDescriptor,
        api?: RealCameraTestWindow['__realcameraTestApi']
    ): Promise<void> => {
        sourceDescriptors.set(deviceId, descriptor);
        const source = createDescriptorSource(descriptor);
        if (source) {
            RealCamera.setVirtualSource(deviceId, source);
            notifyListeners();
            return;
        }
        if (api) {
            await api.setVirtualSourceForDevice(deviceId, descriptor as RealCameraTestSourceDescriptor);
            notifyListeners();
        }
    };

    // Set initial sources
    RealCamera.setVirtualSource(primaryDeviceId, createBlankSource('ET Light test camera A'));
    RealCamera.setVirtualSource(secondaryDeviceId, createAlternateSource('ET Light test camera B'));

    const testWindow = window as RealCameraTestWindow;
    const api = testWindow.__realcameraTestApi;
    if (api) {
        const originalSetVirtualSourceForDevice = api.setVirtualSourceForDevice.bind(api);
        api.setVirtualSourceForDevice = async (id, descriptor) => {
            const normalizedDescriptor = descriptor.type === 'image'
                ? { ...descriptor, url: await imageUrlToDataUrl(descriptor.url) }
                : descriptor;

            sourceDescriptors.set(id, normalizedDescriptor);
            notifyListeners();
            await originalSetVirtualSourceForDevice(id, normalizedDescriptor);
        };
    }

    await applyDescriptorSource(primaryDeviceId, sourceDescriptors.get(primaryDeviceId)!, api);
    await applyDescriptorSource(secondaryDeviceId, sourceDescriptors.get(secondaryDeviceId)!, api);

    // If renderFullApp, use person image for realistic screenshots
    if (demoConfig.renderFullApp && api) {
        await api.setVirtualSourceForDevice(primaryDeviceId, PERSON_IMAGE_DESCRIPTOR);
        sourceDescriptors.set(primaryDeviceId, PERSON_IMAGE_DESCRIPTOR);
        notifyListeners();
    }

    testWindow.__webcamEtLightE2EVideo__ = {
        listDevices: () => api?.listVirtualDevices() ?? [
            { id: primaryDeviceId, label: 'ET Light Test Camera A', enabled: true },
            { id: secondaryDeviceId, label: 'ET Light Test Camera B', enabled: true },
        ],
        getSourceDescriptor: (deviceId: string) =>
            sourceDescriptors.get(deviceId) as RealCameraTestSourceDescriptor | null,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };

    if (testWindow.__webcamEtLightPermissionAutoResponderId__) {
        clearInterval(testWindow.__webcamEtLightPermissionAutoResponderId__);
        delete testWindow.__webcamEtLightPermissionAutoResponderId__;
    }

    if (demoConfig.permissionAutoResponse) {
        const { allow, afterPromptMs = 0 } = demoConfig.permissionAutoResponse;
        testWindow.__webcamEtLightPermissionAutoResponderId__ = window.setInterval(() => {
            const api = testWindow.__realcameraTestApi;
            if (!api) {
                return;
            }

            const pendingRequests = api.listPendingPermissionRequests();
            for (const request of pendingRequests) {
                void api.respondToPermissionRequest(request.id, allow, { afterMs: afterPromptMs });
            }
        }, 50);
    }
};
