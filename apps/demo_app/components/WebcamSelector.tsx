/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useState, useEffect } from 'react';
import { isDemoE2EMode } from '../testing/e2eConfig';

const STORAGE_KEY = 'webcam-et-light-selected-camera';

interface WebcamDevice {
    deviceId: string;
    label: string;
}

interface WebcamSelectorProps {
    selectedDeviceId: string | null;
    onDeviceChange: (deviceId: string) => void;
    disabled?: boolean;
    /** When this value changes, the device list is re-enumerated (used to refresh labels after permission grant). */
    refreshKey?: number;
}

export const WebcamSelector: React.FC<WebcamSelectorProps> = ({
    selectedDeviceId,
    onDeviceChange,
    disabled = false,
    refreshKey,
}) => {
    const [devices, setDevices] = useState<WebcamDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const isDemoE2EAllow = isDemoE2EMode() && window.__REALCAMERA_TEST_CONFIG__?.virtualPermission === 'allow';

    useEffect(() => {
        const loadDevices = async () => {
            try {
                if (isDemoE2EAllow && window.__webcamEtLightE2EVideo__) {
                    const videoDevices = window.__webcamEtLightE2EVideo__
                        .listDevices()
                        .filter(device => device.enabled)
                        .map(device => ({ deviceId: device.id, label: device.label }));

                    setDevices(videoDevices);

                    if (videoDevices.length > 0) {
                        const selectedExists = selectedDeviceId &&
                            videoDevices.some(d => d.deviceId === selectedDeviceId);

                        if (!selectedExists) {
                            onDeviceChange(videoDevices[0].deviceId);
                        }
                    }
                    return;
                }

                const allDevices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = allDevices
                    .filter(device => device.kind === 'videoinput')
                    .map((device, index) => ({
                        deviceId: device.deviceId,
                        label: device.label || `Camera ${index + 1}`,
                    }));

                setDevices(videoDevices);

                // Only auto-select if no device is currently selected, or if selected device no longer exists
                if (videoDevices.length > 0) {
                    const selectedExists = selectedDeviceId &&
                        videoDevices.some(d => d.deviceId === selectedDeviceId);

                    if (!selectedExists) {
                        // Selected device doesn't exist - fall back to first device
                        onDeviceChange(videoDevices[0].deviceId);
                    }
                    // If selectedDeviceId already matches a valid device, don't call onDeviceChange
                    // to avoid restarting the webcam
                }
            } catch (error) {
                console.error('Failed to enumerate devices:', error);
            } finally {
                setLoading(false);
            }
        };

        loadDevices();

        if (isDemoE2EAllow && window.__webcamEtLightE2EVideo__) {
            return window.__webcamEtLightE2EVideo__.subscribe(() => {
                void loadDevices();
            });
        }

        // Listen for device changes (camera plugged/unplugged)
        const handleDeviceChange = () => {
            loadDevices();
        };
        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        };
    }, [isDemoE2EAllow, selectedDeviceId, onDeviceChange, refreshKey]);

    // Save selected device to localStorage when it changes
    useEffect(() => {
        if (selectedDeviceId) {
            localStorage.setItem(STORAGE_KEY, selectedDeviceId);
        }
    }, [selectedDeviceId]);

    if (loading) {
        return (
            <div className="webcam-selector" data-testid="webcam-selector">
                <label>Camera:</label>
                <select data-testid="webcam-select" disabled>
                    <option>Loading cameras...</option>
                </select>
            </div>
        );
    }

    if (devices.length === 0) {
        return (
            <div className="webcam-selector" data-testid="webcam-selector">
                <label>Camera:</label>
                <select data-testid="webcam-select" disabled>
                    <option>No cameras found</option>
                </select>
            </div>
        );
    }

    return (
        <div className="webcam-selector" data-testid="webcam-selector">
            <label htmlFor="webcam-select">Camera:</label>
            <select
                id="webcam-select"
                data-testid="webcam-select"
                value={selectedDeviceId ?? ''}
                onChange={(e) => onDeviceChange(e.target.value)}
                disabled={disabled}
            >
                {devices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                    </option>
                ))}
            </select>
        </div>
    );
};
