/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React from 'react';
import './Settings.css';

export interface SettingsProps {
    delegate: 'GPU' | 'CPU';
    runningMode: 'VIDEO' | 'IMAGE';
    maxResolution: 'VGA' | 'HD' | 'Full HD' | 'QHD' | '4K';
    onDelegateChange: (delegate: 'GPU' | 'CPU') => void;
    onRunningModeChange: (mode: 'VIDEO' | 'IMAGE') => void;
    onMaxResolutionChange: (resolution: 'VGA' | 'HD' | 'Full HD' | 'QHD' | '4K') => void;
    disabled?: boolean;
}

export const Settings: React.FC<SettingsProps> = ({
    delegate,
    runningMode,
    maxResolution,
    onDelegateChange,
    onRunningModeChange,
    onMaxResolutionChange,
    disabled = false,
}) => {
    return (
        <div className="settings-panel">
            <h3 className="settings-title">Settings</h3>
            
            <div className="settings-group">
                <label className="settings-label">
                    Face Detection Mode:
                    <select
                        className="settings-select"
                        value={runningMode}
                        onChange={(e) => onRunningModeChange(e.target.value as 'VIDEO' | 'IMAGE')}
                        disabled={disabled}
                    >
                        <option value="VIDEO">VIDEO (smooth tracking)</option>
                        <option value="IMAGE">IMAGE (deterministic)</option>
                    </select>
                </label>
                <span className="settings-hint">
                    {runningMode === 'VIDEO' 
                        ? 'Uses temporal tracking for smoother real-time webcam'
                        : 'Frame-by-frame detection, 100% deterministic for testing'}
                </span>
            </div>

            <div className="settings-group">
                <label className="settings-label">
                    Inference Device:
                    <select
                        className="settings-select"
                        value={delegate}
                        onChange={(e) => onDelegateChange(e.target.value as 'GPU' | 'CPU')}
                        disabled={disabled}
                    >
                        <option value="GPU">GPU (WebGL)</option>
                        <option value="CPU">CPU (WASM)</option>
                    </select>
                </label>
                <span className="settings-hint">
                    {delegate === 'GPU' 
                        ? 'Faster but may have slight non-determinism'
                        : 'Slower but more consistent across runs'}
                </span>
            </div>

            <div className="settings-group">
                <label className="settings-label">
                    Max Webcam Resolution:
                    <select
                        className="settings-select"
                        value={maxResolution}
                        onChange={(e) => onMaxResolutionChange(e.target.value as 'VGA' | 'HD' | 'Full HD' | 'QHD' | '4K')}
                        disabled={disabled}
                    >
                        <option value="VGA">VGA (640×480)</option>
                        <option value="HD">HD (1280×720)</option>
                        <option value="Full HD">Full HD (1920×1080)</option>
                        <option value="QHD">QHD (2560×1440)</option>
                        <option value="4K">4K (3840×2160)</option>
                    </select>
                </label>
                <span className="settings-hint">
                    Higher resolution = better accuracy but more CPU usage
                </span>
            </div>

            {disabled && (
                <div className="settings-warning">
                    ⚠️ Stop tracking/calibration to change settings
                </div>
            )}
        </div>
    );
};
