/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useEffect, useState } from 'react';

/**
 * Information shown about the webcam stream and tracker configuration.
 */
export interface TrackerInfo {
    // Webcam
    videoWidth?: number;
    videoHeight?: number;
    fps?: number;
    deviceId?: string;
    deviceLabel?: string;

    // Tracker
    trackerState: string;
    delegate: 'GPU' | 'CPU';
    runningMode: 'VIDEO' | 'IMAGE';
    faceDetectorMode: 'landmarker' | 'blazeface';
    useLandmarks: boolean;
    featureCount: number;
    calibrationPoints: number;
    ridgeLambda: string;

    // Runtime
    processingAvgMs: number | null;
    samplingRate: number;
    gazePredictions: number;
    trackingDurationSec: number;
}

interface TrackerInfoPanelProps {
    info: TrackerInfo;
    collapsed?: boolean;
    onToggle?: () => void;
}

function InfoRow({ label, value, tooltip }: { label: string; value: string | number; tooltip?: string }) {
    return (
        <div className="info-row" title={tooltip}>
            <span className="info-label">{label}</span>
            <span className="info-value" style={{ fontFamily: 'Roboto Mono, monospace' }}>{value}</span>
        </div>
    );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="info-section">
            <h4 className="info-section-title">{title}</h4>
            <div className="info-section-body">
                {children}
            </div>
        </div>
    );
}

export const TrackerInfoPanel: React.FC<TrackerInfoPanelProps> = ({ info, collapsed, onToggle }) => {
    const [isCollapsed, setIsCollapsed] = useState(!!collapsed);

    useEffect(() => {
        if (collapsed !== undefined) setIsCollapsed(!!collapsed);
    }, [collapsed]);

    const toggle = () => {
        setIsCollapsed((v) => !v);
        onToggle?.();
    };

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    return (
        <div className={`tracker-info-panel ${isCollapsed ? 'collapsed' : ''}`}>
            <button
                className="info-panel-header"
                onClick={toggle}
                aria-expanded={!isCollapsed}
                aria-label="Toggle tracker info panel"
            >
                <span className="info-panel-title">
                    <span className="info-panel-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                        </svg>
                    </span>
                    Tech Info
                </span>
                <span className="info-panel-chevron">{isCollapsed ? '▶' : '▼'}</span>
            </button>

            {!isCollapsed && (
                <div className="info-panel-body">
                    {/* Webcam section */}
                    <InfoSection title="Webcam">
                        <InfoRow
                            label="Resolution"
                            value={info.videoWidth && info.videoHeight ? `${info.videoWidth}×${info.videoHeight}` : '—'}
                            tooltip="Native camera resolution from video element"
                        />
                        <InfoRow label="Frame Rate" value={info.fps ?? '—'} tooltip="Camera FPS from MediaStream track settings" />
                        <InfoRow
                            label="Device"
                            value={info.deviceLabel || (info.deviceId ? `${info.deviceId.slice(0, 12)}…` : '—')}
                            tooltip="Selected camera device"
                        />
                    </InfoSection>

                    {/* Tracker section */}
                    <InfoSection title="Eye Tracker">
                        <InfoRow label="State" value={info.trackerState} />
                        <InfoRow
                            label="Inference"
                            value={info.delegate}
                            tooltip="GPU = WebGL acceleration, CPU = WASM"
                        />
                        <InfoRow
                            label="Face Mode"
                            value={info.runningMode}
                            tooltip="VIDEO = temporal tracking, IMAGE = frame-by-frame"
                        />
                        <InfoRow
                            label="Detector"
                            value={info.faceDetectorMode}
                            tooltip="landmarker = 478 points + iris, blazeface = 6 keypoints"
                        />
                        <InfoRow
                            label="Landmarks"
                            value={info.useLandmarks ? 'On' : 'Off'}
                            tooltip="Use geometric landmark features vs pixel features"
                        />
                        <InfoRow
                            label="Features"
                            value={info.featureCount.toLocaleString()}
                            tooltip="Total feature vector dimensions sent to ridge regression"
                        />
                        <InfoRow
                            label="Calibration"
                            value={`${info.calibrationPoints}-point grid`}
                            tooltip="Number of calibration points in the default pattern"
                        />
                        <InfoRow
                            label="Ridge λ"
                            value={info.ridgeLambda}
                            tooltip="Regularization parameter for ridge regression"
                        />
                    </InfoSection>

                    {/* Runtime section */}
                    <InfoSection title="Runtime">
                        <InfoRow
                            label="Process Frame"
                            value={info.processingAvgMs !== null ? `${info.processingAvgMs.toFixed(1)} ms` : '—'}
                            tooltip="Average frame processing time (10s sliding window)"
                        />
                        <InfoRow
                            label="Sampling Rate"
                            value={info.samplingRate > 0 ? `${info.samplingRate} Hz` : '—'}
                            tooltip="Gaze prediction frequency during tracking"
                        />
                        <InfoRow
                            label="Predictions"
                            value={info.gazePredictions.toLocaleString()}
                            tooltip="Total gaze predictions since tracking started"
                        />
                        <InfoRow
                            label="Duration"
                            value={info.trackingDurationSec > 0 ? formatDuration(info.trackingDurationSec) : '—'}
                            tooltip="Time tracking has been active"
                        />
                    </InfoSection>
                </div>
            )}
        </div>
    );
};
