/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TrackerState, type CalibrationSample, type GazePoint } from '@lib/types';
import { GazeVisualization } from '../components/GazeVisualization';
import { Settings } from '../components/Settings';
import { DemoE2ETracker } from './DemoE2ETracker';
import { getDemoE2EConfig } from './e2eConfig';
import type { RealCameraTestSourceDescriptor } from '@realeye-io/realtesting-camera';
import { getCalibrationPoints, CalibrationPattern } from '@lib/calibration/CalibrationPatterns';

const STATUS_LABELS: Record<TrackerState, string> = {
    [TrackerState.Uninitialized]: 'Not Initialized',
    [TrackerState.Ready]: 'Ready for Calibration',
    [TrackerState.Calibrated]: 'Calibrated & Tracking',
    [TrackerState.Error]: 'Error',
};

const CAMERA_STORAGE_KEY = 'webcam-et-light-selected-camera';
const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 480;

interface DemoE2EDevice {
    id: string;
    label: string;
    enabled: boolean;
}

interface DemoCalibrationPoint {
    id: string;
    name: string;
    xPercent: number;
    yPercent: number;
}

const CALIBRATION_POINTS: DemoCalibrationPoint[] = getCalibrationPoints(CalibrationPattern.GRID_17).map((point, index) => ({
    id: `p${index + 1}`,
    name: `Point ${index + 1}`,
    xPercent: point.x * 100,
    yPercent: point.y * 100,
}));

const CALIBRATION_OVERLAY_STYLE: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#f5f5f5',
    zIndex: 1000,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
};

const CALIBRATION_POINT_BASE_STYLE: React.CSSProperties = {
    position: 'absolute',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.2s, background-color 0.2s, opacity 0.2s',
    animation: 'pulse 1.5s infinite',
    zIndex: 1002,
};

const getSavedDeviceId = (): string | null => {
    try {
        return localStorage.getItem(CAMERA_STORAGE_KEY);
    } catch {
        return null;
    }
};

const getBridgeDevices = (): DemoE2EDevice[] => {
    return window.__webcamEtLightE2EVideo__?.listDevices().filter((device) => device.enabled) ?? [];
};

const getPermissionMode = (): 'allow' | 'prompt' | 'deny' => {
    return window.__REALCAMERA_TEST_CONFIG__?.virtualPermission ?? 'allow';
};

const hexToRgb = (hex: string): [number, number, number] => {
    const normalized = hex.replace('#', '');
    const value = normalized.length === 3
        ? normalized.split('').map((char) => char + char).join('')
        : normalized;

    const red = parseInt(value.slice(0, 2), 16);
    const green = parseInt(value.slice(2, 4), 16);
    const blue = parseInt(value.slice(4, 6), 16);
    return [red, green, blue];
};

const createSyntheticImageData = (descriptor: RealCameraTestSourceDescriptor | null): ImageData => {
    const data = new Uint8ClampedArray(PREVIEW_WIDTH * PREVIEW_HEIGHT * 4);

    let red = 15;
    let green = 23;
    let blue = 42;

    if (descriptor?.type === 'color') {
        [red, green, blue] = hexToRgb(descriptor.color);
    } else if (descriptor?.type === 'pattern') {
        red = 29;
        green = 78;
        blue = 216;
    } else if (descriptor?.type === 'blank' && descriptor.color) {
        [red, green, blue] = hexToRgb(descriptor.color);
    } else if (descriptor?.type === 'image') {
        // Person image — render as skin-tone baseline (#d9a17a) for hasSyntheticFace detection
        red = 217;
        green = 161;
        blue = 122;
    }

    for (let index = 0; index < data.length; index += 4) {
        data[index] = red;
        data[index + 1] = green;
        data[index + 2] = blue;
        data[index + 3] = 255;
    }

    return new ImageData(data, PREVIEW_WIDTH, PREVIEW_HEIGHT);
};

const getPreviewStyle = (descriptor: RealCameraTestSourceDescriptor | null): React.CSSProperties => {
    if (!descriptor || descriptor.type === 'blank') {
        return {
            background: descriptor?.color ?? '#0f172a',
            color: '#f8fafc',
        };
    }

    if (descriptor.type === 'pattern') {
        return {
            background: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
            color: '#f8fafc',
        };
    }

    if (descriptor.type === 'image') {
        return {
            background: '#0f172a',
            color: '#f8fafc',
        };
    }

    return {
        background: descriptor.color,
        color: '#f8fafc',
    };
};

const getPreviewLabel = (descriptor: RealCameraTestSourceDescriptor | null): string => {
    if (!descriptor) {
        return 'No source';
    }

    if (descriptor.type === 'blank') {
        return descriptor.text ?? 'Blank source';
    }

    if (descriptor.type === 'pattern') {
        return 'Pattern source';
    }

    if (descriptor.type === 'image') {
        return descriptor.text ?? 'Image source';
    }

    return 'Color source';
};

const DemoE2ECalibrationOverlay: React.FC<{
    captureSample: () => ImageData | null;
    onComplete: (samples: CalibrationSample[]) => void;
    onCancel: () => void;
    samplesPerPoint?: number;
    captureIntervalMs?: number;
    initialDelayMs?: number;
}> = ({
    captureSample,
    onComplete,
    onCancel,
    samplesPerPoint = 1,
    captureIntervalMs = 0,
    initialDelayMs = 0,
}) => {
        const [currentPointIndex, setCurrentPointIndex] = useState(0);
        const [completedPoints, setCompletedPoints] = useState<Set<string>>(new Set());
        const [samples, setSamples] = useState<CalibrationSample[]>([]);
        const [isCapturing, setIsCapturing] = useState(false);

        useEffect(() => {
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    onCancel();
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
            };
        }, [onCancel]);

        const currentPoint = CALIBRATION_POINTS[currentPointIndex];

        const handlePointClick = async (point: DemoCalibrationPoint) => {
            if (isCapturing || point.id !== currentPoint.id) {
                return;
            }

            setIsCapturing(true);
            if (initialDelayMs > 0) {
                await new Promise((resolve) => window.setTimeout(resolve, initialDelayMs));
            }

            const gazeX = (point.xPercent / 100) * window.innerWidth;
            const gazeY = (point.yPercent / 100) * window.innerHeight;
            const nextSamples: CalibrationSample[] = [];

            for (let index = 0; index < samplesPerPoint; index += 1) {
                const image = captureSample();
                if (image) {
                    nextSamples.push({ image, gazeX, gazeY });
                }
                if (index < samplesPerPoint - 1 && captureIntervalMs > 0) {
                    await new Promise((resolve) => window.setTimeout(resolve, captureIntervalMs));
                }
            }

            const allSamples = [...samples, ...nextSamples];
            const nextCompleted = new Set(completedPoints);
            nextCompleted.add(point.id);
            setSamples(allSamples);
            setCompletedPoints(nextCompleted);
            setIsCapturing(false);

            if (currentPointIndex < CALIBRATION_POINTS.length - 1) {
                setCurrentPointIndex(currentPointIndex + 1);
                return;
            }

            onComplete(allSamples);
        };

        return (
            <div className="calibration-overlay" data-testid="calibration-overlay" style={CALIBRATION_OVERLAY_STYLE}>
                <div className="calibration-instruction" data-testid="calibration-instruction">
                    {isCapturing ? 'Capturing...' : <>Look at the <strong>{currentPoint.name}</strong> dot and click it</>}
                </div>

                {CALIBRATION_POINTS.map((point) => {
                    const isCompleted = completedPoints.has(point.id);
                    const isCurrent = point.id === currentPoint.id;
                    const isInactive = !isCompleted && !isCurrent;

                    return (
                        <div
                            key={point.id}
                            className={`calibration-point ${isCompleted ? 'completed' : ''} ${isInactive ? 'inactive' : ''}`}
                            data-testid="calibration-point"
                            data-point-id={point.id}
                            data-point-name={point.name}
                            data-current={isCurrent ? 'true' : 'false'}
                            data-completed={isCompleted ? 'true' : 'false'}
                            data-inactive={isInactive ? 'true' : 'false'}
                            style={{
                                ...CALIBRATION_POINT_BASE_STYLE,
                                backgroundColor: isCompleted ? '#4caf50' : '#f44336',
                                cursor: isInactive || isCompleted ? 'default' : 'pointer',
                                left: `${point.xPercent}%`,
                                top: `${point.yPercent}%`,
                                transform: 'translate(-50%, -50%)',
                                opacity: isCurrent ? 1 : isCompleted ? 0.7 : 0.2,
                                pointerEvents: isInactive || isCompleted ? 'none' : 'auto',
                            }}
                            onClick={() => void handlePointClick(point)}
                        >
                            <div className="calibration-point-inner" />
                        </div>
                    );
                })}

                <div className="calibration-progress" data-testid="calibration-progress">
                    {completedPoints.size} / {CALIBRATION_POINTS.length} points captured
                    <br />
                    <small>Press ESC to cancel</small>
                </div>
            </div>
        );
    };

export const DemoE2EStaticHarness: React.FC<{ appVersion: string }> = ({ appVersion }) => {
    const demoConfig = getDemoE2EConfig();
    const permissionMode = getPermissionMode();
    const tracker = useMemo(
        () => new DemoE2ETracker({ delegate: demoConfig.delegate, runningMode: demoConfig.runningMode }),
        [demoConfig.delegate, demoConfig.runningMode]
    );

    const [showSettings, setShowSettings] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [delegate, setDelegate] = useState<'GPU' | 'CPU'>(demoConfig.delegate ?? 'CPU');
    const [runningMode, setRunningMode] = useState<'VIDEO' | 'IMAGE'>(demoConfig.runningMode ?? 'VIDEO');
    const [maxResolution, setMaxResolution] = useState<'VGA' | 'HD' | 'Full HD' | 'QHD' | '4K'>(
        demoConfig.maxResolution ?? 'VGA'
    );
    const [trackerState, setTrackerState] = useState<TrackerState>(TrackerState.Uninitialized);
    const [isInitializing, setIsInitializing] = useState(true);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [isTracking, setIsTracking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [gaze, setGaze] = useState<GazePoint | null>(null);
    const [noFaceDetected, setNoFaceDetected] = useState(true);
    const [devices, setDevices] = useState<DemoE2EDevice[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(getSavedDeviceId);
    const [currentDescriptor, setCurrentDescriptor] = useState<RealCameraTestSourceDescriptor | null>(null);

    const syncDevices = useCallback(() => {
        const availableDevices = getBridgeDevices();
        setDevices(availableDevices);
        setSelectedDeviceId((current) => {
            if (current && availableDevices.some((device) => device.id === current)) {
                return current;
            }
            return availableDevices[0]?.id ?? null;
        });
    }, []);

    const evaluateCurrentSource = useCallback(() => {
        if (permissionMode !== 'allow') {
            setNoFaceDetected(true);
            setGaze(null);
            return null;
        }

        const imageData = createSyntheticImageData(currentDescriptor);
        const detection = tracker.detectFace(imageData);
        setNoFaceDetected(detection === null);
        setTrackerState(tracker.getState());

        if (isTracking && tracker.isCalibrated() && detection) {
            setGaze(tracker.predictWithDetection(imageData, detection));
        } else {
            setGaze(null);
        }

        return { imageData, detection };
    }, [currentDescriptor, isTracking, permissionMode, tracker]);

    useEffect(() => {
        tracker.initialize();
        setTrackerState(tracker.getState());
        setIsInitializing(false);
        syncDevices();

        const unsubscribe = window.__webcamEtLightE2EVideo__?.subscribe(() => {
            syncDevices();
        });

        return () => {
            unsubscribe?.();
            tracker.dispose();
        };
    }, [syncDevices, tracker]);

    useEffect(() => {
        const syncDescriptor = () => {
            if (!selectedDeviceId) {
                setCurrentDescriptor(null);
                setNoFaceDetected(true);
                return;
            }

            localStorage.setItem(CAMERA_STORAGE_KEY, selectedDeviceId);
            setCurrentDescriptor(window.__webcamEtLightE2EVideo__?.getSourceDescriptor(selectedDeviceId) ?? null);
        };

        syncDescriptor();
        const unsubscribe = window.__webcamEtLightE2EVideo__?.subscribe(() => {
            syncDescriptor();
        });

        return () => {
            unsubscribe?.();
        };
    }, [selectedDeviceId]);

    useEffect(() => {
        evaluateCurrentSource();
    }, [evaluateCurrentSource]);

    useEffect(() => {
        if (permissionMode === 'allow') {
            setError(null);
            return;
        }

        let cancelled = false;
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: false })
            .then((stream) => {
                stream.getTracks().forEach((track) => track.stop());
            })
            .catch((err) => {
                if (cancelled) {
                    return;
                }

                if (permissionMode === 'deny') {
                    setError('Webcam error: Failed to get webcam stream at any resolution');
                    return;
                }

                const message = err instanceof Error ? err.message : String(err);
                setError(`Webcam error: ${message}`);
            });

        return () => {
            cancelled = true;
        };
    }, [permissionMode]);

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__webcamETLightDemo__ = {
            tracker,
            getState: () => ({
                trackerState,
                isInitializing,
                isCalibrating,
                isTracking,
                error,
                hasGaze: gaze !== null,
                noFaceDetected,
                selectedDeviceId,
                canStartCalibration:
                    trackerState !== TrackerState.Uninitialized &&
                    trackerState !== TrackerState.Error &&
                    !isInitializing &&
                    !isTracking &&
                    !noFaceDetected,
                canStartTracking: trackerState === TrackerState.Calibrated && !isTracking,
                calibrationPointCount: 17,
            }),
            completeCalibration: () => {
                const imageData = currentDescriptor ? createSyntheticImageData(currentDescriptor) : null;
                if (!imageData) {
                    return;
                }

                const samples: CalibrationSample[] = Array.from({ length: 5 }, (_, index) => ({
                    image: imageData,
                    gazeX: window.innerWidth * (0.3 + (index * 0.1)),
                    gazeY: window.innerHeight * (0.3 + (index * 0.1)),
                }));

                try {
                    tracker.calibrate(samples);
                    setTrackerState(tracker.getState());
                    setIsCalibrating(false);
                    setError(null);
                    evaluateCurrentSource();
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Calibration failed';
                    setError(message);
                    setTrackerState(TrackerState.Error);
                    setIsCalibrating(false);
                }
            },
        };

        return () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (window as any).__webcamETLightDemo__;
        };
    }, [error, gaze, isCalibrating, isInitializing, isTracking, noFaceDetected, selectedDeviceId, tracker, trackerState]);

    const handleCalibrationComplete = useCallback(
        (samples: CalibrationSample[]) => {
            setIsCalibrating(false);
            try {
                tracker.calibrate(samples);
                setTrackerState(tracker.getState());
                setError(null);
                evaluateCurrentSource();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Calibration failed';
                setError(message);
                setTrackerState(TrackerState.Error);
            }
        },
        [evaluateCurrentSource, tracker]
    );

    const handleReset = () => {
        setIsTracking(false);
        setGaze(null);
        tracker.reset();
        setTrackerState(tracker.getState());
        setError(null);
        evaluateCurrentSource();
    };

    const canStartCalibration =
        trackerState !== TrackerState.Uninitialized &&
        trackerState !== TrackerState.Error &&
        !isInitializing &&
        !isTracking &&
        !noFaceDetected;
    const isImageSource = currentDescriptor?.type === 'image';

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-inner">
                    <div className="header-copy">
                        <div className="header-top">
                        </div>

                        <h1>Webcam ET Light Demo</h1>
                        <p>
                            Lightweight browser-based eye tracking that runs entirely locally with MediaPipe face detection,
                            ridge regression, and CSS-pixel gaze output.
                        </p>

                        <div className="header-badges" aria-label="Key product highlights">
                            <span className="header-badge">Local-only processing</span>
                            <span className="header-badge">MediaPipe face detection</span>
                            <span className="header-badge">17-point calibration</span>
                            <span className="header-badge">CSS-pixel gaze</span>
                        </div>
                    </div>

                    <aside className="header-card" aria-label="Live configuration summary">
                        <span className="header-card-eyebrow">Live summary</span>
                        <div className="header-card-grid">
                            <div className="header-card-item">
                                <span>Status</span>
                                <strong>{STATUS_LABELS[trackerState]}</strong>
                            </div>
                            <div className="header-card-item">
                                <span>Inference</span>
                                <strong>{demoConfig.delegate === 'GPU' ? 'GPU / WebGL' : 'CPU / WASM'}</strong>
                            </div>
                            <div className="header-card-item">
                                <span>Face mode</span>
                                <strong>{demoConfig.runningMode}</strong>
                            </div>
                            <div className="header-card-item">
                                <span>Max res</span>
                                <strong>{demoConfig.maxResolution ?? 'VGA'}</strong>
                            </div>
                        </div>
                        <div className="header-card-note">
                            <span className="header-card-note-dot" aria-hidden="true" />
                            <span>All inference stays on-device.</span>
                        </div>
                    </aside>
                </div>
            </header>

            <main className="main-content">
                <div className="status-bar" data-testid="tracker-status-bar">
                    <div className="status-indicator">
                        <span
                            className={`status-dot ${trackerState.toLowerCase()}`}
                            data-testid="tracker-status-dot"
                            data-state={trackerState}
                        />
                        <span>{STATUS_LABELS[trackerState]}</span>
                    </div>
                    {!isTracking && !isCalibrating && noFaceDetected && trackerState !== TrackerState.Uninitialized && (
                        <span style={{ color: '#ff9800' }} data-testid="idle-no-face-warning">
                            ⚠️ No face detected
                        </span>
                    )}
                    {isTracking && noFaceDetected && (
                        <span style={{ color: '#f44336' }} data-testid="tracking-no-face-warning">
                            ⚠️ No face detected
                        </span>
                    )}
                </div>

                {error && (
                    <div className="error-message" data-testid="error-message">
                        {error}
                    </div>
                )}

                <button
                    className="btn btn-secondary"
                    onClick={() => setShowSettings((value) => !value)}
                    style={{ marginBottom: '8px', width: '100%', maxWidth: '640px' }}
                >
                    {showSettings ? '▼ Hide Settings' : '▶ Show Settings'}
                </button>

                {showSettings && (
                    <Settings
                        delegate={delegate}
                        runningMode={runningMode}
                        maxResolution={maxResolution}
                        onDelegateChange={setDelegate}
                        onRunningModeChange={setRunningMode}
                        onMaxResolutionChange={setMaxResolution}
                        disabled={isCalibrating || isTracking}
                    />
                )}

                <button
                    className="btn btn-secondary"
                    onClick={() => setShowDiagnostics((value) => !value)}
                    style={{ marginTop: '16px', fontSize: '12px', width: '100%', maxWidth: '640px' }}
                >
                    {showDiagnostics ? '▼ Hide Diagnostics' : '▶ Show Diagnostics'}
                </button>

                {showDiagnostics && (
                    <div className="diagnostics-panel" style={{ marginTop: '8px', width: '100%', maxWidth: '640px' }}>
                        <h3>Diagnostics</h3>
                        <table className="diagnostics-table">
                            <tbody>
                                <tr>
                                    <td>Video Resolution:</td>
                                    <td>{`${PREVIEW_WIDTH}×${PREVIEW_HEIGHT}`}</td>
                                </tr>
                                <tr>
                                    <td>Webcam FPS:</td>
                                    <td>5</td>
                                </tr>
                                <tr>
                                    <td>Screen Resolution:</td>
                                    <td>{`${window.screen.width}×${window.screen.height}`}</td>
                                </tr>
                                <tr>
                                    <td>Viewport Size:</td>
                                    <td>{`${window.innerWidth}×${window.innerHeight}`}</td>
                                </tr>
                                <tr>
                                    <td>Device Pixel Ratio:</td>
                                    <td>{window.devicePixelRatio}</td>
                                </tr>
                                <tr>
                                    <td>Tracker State:</td>
                                    <td>{trackerState}</td>
                                </tr>
                                <tr>
                                    <td>Config (from URL):</td>
                                    <td>
                                        <code style={{ fontSize: '10px', wordBreak: 'break-all' }}>
                                            {JSON.stringify(demoConfig)}
                                        </code>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="webcam-selector" data-testid="webcam-selector">
                    <label htmlFor="webcam-select">Camera:</label>
                    <select
                        id="webcam-select"
                        data-testid="webcam-select"
                        value={selectedDeviceId ?? ''}
                        onChange={(event) => setSelectedDeviceId(event.target.value)}
                        disabled={isCalibrating || isTracking || devices.length === 0}
                    >
                        {devices.map((device) => (
                            <option key={device.id} value={device.id}>
                                {device.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="webcam-container" data-testid="webcam-container">
                    <div
                        className="webcam-video"
                        data-testid="webcam-video"
                        style={{
                            ...getPreviewStyle(currentDescriptor),
                            width: `${PREVIEW_WIDTH}px`,
                            height: `${PREVIEW_HEIGHT}px`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '12px',
                            fontWeight: 600,
                            textAlign: 'center',
                            padding: isImageSource ? 0 : '24px',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                        }}
                    >
                        {isImageSource ? (
                            <img
                                src={currentDescriptor?.url}
                                alt={getPreviewLabel(currentDescriptor)}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block',
                                }}
                            />
                        ) : (
                            getPreviewLabel(currentDescriptor)
                        )}
                    </div>
                </div>

                <div className="controls">
                    <button
                        className="btn btn-primary"
                        data-testid="start-calibration-button"
                        onClick={() => setIsCalibrating(true)}
                        disabled={!canStartCalibration}
                    >
                        {trackerState === TrackerState.Calibrated ? 'Recalibrate' : 'Start Calibration'}
                    </button>

                    {trackerState === TrackerState.Calibrated && (
                        <>
                            <button
                                className="btn btn-primary"
                                data-testid="tracking-toggle-button"
                                onClick={() => {
                                    if (isTracking) {
                                        setIsTracking(false);
                                        setGaze(null);
                                        return;
                                    }

                                    const frame = evaluateCurrentSource();
                                    if (!frame || !frame.detection || !tracker.isCalibrated()) {
                                        return;
                                    }

                                    setIsTracking(true);
                                    setGaze(tracker.predictWithDetection(frame.imageData, frame.detection));
                                }}
                            >
                                {isTracking ? 'Stop Tracking' : 'Start Tracking'}
                            </button>
                            <button className="btn btn-secondary" data-testid="reset-button" onClick={handleReset}>
                                Reset
                            </button>
                        </>
                    )}
                </div>
            </main>

            <footer className="footer" aria-label="App attribution">
                v{appVersion} · Created by <a href="https://www.realeye.io/" target="_blank" rel="noopener noreferrer" title="Online Research Platform with Webcam Eye-Tracking">RealEye</a> Sp. z o. o.
            </footer>

            {isCalibrating && (
                <DemoE2ECalibrationOverlay
                    captureSample={() => createSyntheticImageData(currentDescriptor)}
                    onComplete={handleCalibrationComplete}
                    onCancel={() => setIsCalibrating(false)}
                    samplesPerPoint={demoConfig.calibrationSamplesPerPoint}
                    captureIntervalMs={demoConfig.calibrationCaptureIntervalMs}
                    initialDelayMs={demoConfig.calibrationInitialDelayMs}
                />
            )}

            <GazeVisualization x={gaze?.x ?? null} y={gaze?.y ?? null} noFace={noFaceDetected} visible={isTracking} />
        </div>
    );
};
