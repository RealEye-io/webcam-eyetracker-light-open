/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { WebcamETLight, TrackerState, CalibrationSample, GazePoint, FaceDetectionResult, type WebcamETLightConfig, extractEyeCrops, type EyeCrops } from '@lib/index';
import { WebcamPreview } from './components/WebcamPreview';
import { WebcamSelector } from './components/WebcamSelector';
import { CalibrationOverlay } from './components/CalibrationOverlay';
import { GazeVisualization } from './components/GazeVisualization';
import { FaceOverlay } from './components/FaceOverlay';
import { ClickAccuracyOverlay, ClickAccuracyLine } from './components/ClickAccuracyOverlay';
import { Settings } from './components/Settings';
import { DeviceWarningBanner } from './components/DeviceWarningBanner';
import { getDemoE2EConfig, isDemoE2EMode, shouldRenderFullApp } from './testing/e2eConfig';
import { DemoE2ETracker } from './testing/DemoE2ETracker';
import { DemoE2EStaticHarness } from './testing/DemoE2EStaticHarness';

// Lazy-load GazeTrail (only needed during tracking, well after initial render)
const GazeTrail = lazy(() => import('./components/GazeTrail').then(m => ({ default: m.GazeTrail })));

declare const __APP_VERSION__: string;

// Expose WebcamETLight class globally for E2E testing with different configurations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__WebcamETLight__ = WebcamETLight;

const DEMO_E2E_MODE = isDemoE2EMode();
const DEMO_E2E_CONFIG = getDemoE2EConfig();
const DEMO_E2E_LOOP_INTERVAL_MS = DEMO_E2E_MODE ? 100 : 0;

type DemoTracker = Pick<
    WebcamETLight,
    | 'initialize'
    | 'dispose'
    | 'getState'
    | 'isReady'
    | 'isCalibrated'
    | 'detectFace'
    | 'calibrate'
    | 'predictWithDetection'
    | 'reset'
>;

const STATUS_LABELS: Record<TrackerState, string> = {
    [TrackerState.Uninitialized]: 'Not Initialized',
    [TrackerState.Ready]: 'Ready for Calibration',
    [TrackerState.Calibrated]: 'Calibrated & Tracking',
    [TrackerState.Error]: 'Error',
};

const CAMERA_STORAGE_KEY = 'webcam-et-light-selected-camera';

// Load saved camera device ID synchronously to prevent race condition
const getSavedDeviceId = (): string | null => {
    try {
        return localStorage.getItem(CAMERA_STORAGE_KEY);
    } catch {
        return null;
    }
};

const BACKGROUND_COLORS = {
    default: '#f5f5f5',
    white: '#ffffff',
    gray: '#808080',
    black: '#000000',
};

const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

// Parse config from URL search params (for A/B testing)
const getConfigFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    // Start empty so the library defaults apply unless explicitly overridden
    const config: WebcamETLightConfig = {};

    // Boolean params
    if (params.has('useLandmarks')) {
        config.useLandmarks = params.get('useLandmarks') === 'true';
    }

    // Numeric params
    if (params.has('eyeWidth')) {
        config.eyeWidth = parseInt(params.get('eyeWidth')!, 10);
    }
    if (params.has('eyeHeight')) {
        config.eyeHeight = parseInt(params.get('eyeHeight')!, 10);
    }
    if (params.has('eyeSize')) {
        const size = parseInt(params.get('eyeSize')!, 10);
        if (!Number.isNaN(size)) {
            config.eyeWidth = size;
            config.eyeHeight = size;
        }
    }

    return config;
};

const createDemoTracker = (config: WebcamETLightConfig): DemoTracker => {
    return DEMO_E2E_MODE ? new DemoE2ETracker(config) : new WebcamETLight(config);
};

export const App: React.FC = () => {
    if (DEMO_E2E_MODE && !shouldRenderFullApp()) {
        return <DemoE2EStaticHarness appVersion={__APP_VERSION__} />;
    }

    // Settings
    const [showSettings, setShowSettings] = useState(false);
    const [delegate, setDelegate] = useState<'GPU' | 'CPU'>(DEMO_E2E_CONFIG.delegate ?? 'GPU');
    const [runningMode, setRunningMode] = useState<'VIDEO' | 'IMAGE'>(DEMO_E2E_CONFIG.runningMode ?? 'VIDEO');
    const [maxResolution, setMaxResolution] = useState<'VGA' | 'HD' | 'Full HD' | 'QHD' | '4K'>(
        DEMO_E2E_CONFIG.maxResolution ?? '4K'
    );

    // Config can be overridden via URL params for A/B testing
    const [tracker, setTracker] = useState<DemoTracker>(() => createDemoTracker({ ...getConfigFromUrl(), delegate, runningMode }));
    const [trackerState, setTrackerState] = useState<TrackerState>(TrackerState.Uninitialized);
    const [isInitializing, setIsInitializing] = useState(false);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [isTracking, setIsTracking] = useState(false);
    const [isPreviewStarted, setIsPreviewStarted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [gaze, setGaze] = useState<GazePoint | null>(null);
    const [noFaceDetected, setNoFaceDetected] = useState(true); // Start with true until first detection
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(getSavedDeviceId);
    const [deviceRefreshKey, setDeviceRefreshKey] = useState(0);
    const [faceDetection, setFaceDetection] = useState<FaceDetectionResult | null>(null);
    const [backgroundColor, setBackgroundColor] = useState(BACKGROUND_COLORS.default);
    const [samplingRate, setSamplingRate] = useState<number>(0);
    const [processingAvgMs, setProcessingAvgMs] = useState<number | null>(null);
    const [clickLines, setClickLines] = useState<ClickAccuracyLine[]>([]);
    const [averageLineDistance, setAverageLineDistance] = useState<number | null>(null);
    const [clickAccuracyStats, setClickAccuracyStats] = useState<{ average: number; count: number } | null>(null);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);
    const [webcamFps, setWebcamFps] = useState<number | null>(null);
    const [eyeCrops, setEyeCrops] = useState<EyeCrops | null>(null);
    const hasMountedSettingsRef = useRef(false);
    const leftEyeCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightEyeCanvasRef = useRef<HTMLCanvasElement>(null);
    const leftEyeProcessedCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightEyeProcessedCanvasRef = useRef<HTMLCanvasElement>(null);

    const videoRef = useRef<HTMLVideoElement | HTMLCanvasElement>(null);
    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const [showFrozenFrame, setShowFrozenFrame] = useState(false);
    const trackingRAFRef = useRef<number | null>(null);
    const faceDetectionIntervalRef = useRef<number | null>(null);
    const isPredictingRef = useRef<boolean>(false);
    const isTrackingRef = useRef<boolean>(false);
    const gazeRef = useRef<GazePoint | null>(null);
    const lastFaceDetectionRunAtRef = useRef<number>(0);
    const lastTrackingRunAtRef = useRef<number>(0);
    const timingSamplesRef = useRef<Array<{ timestamp: number; duration: number }>>([]);
    const timingSumRef = useRef<number>(0);
    const lastTimingUpdateRef = useRef<number>(0);
    const lineIdRef = useRef<number>(0);
    const lastVideoTimeRef = useRef<number>(-1); // Track video frame changes

    const getPreviewDimensions = useCallback((element: HTMLVideoElement | HTMLCanvasElement) => {
        if (element instanceof HTMLVideoElement) {
            const videoElement = element as HTMLVideoElement;
            return { width: videoElement.videoWidth, height: videoElement.videoHeight };
        }

        return { width: element.width, height: element.height };
    }, []);

    const isPreviewReady = useCallback((element: HTMLVideoElement | HTMLCanvasElement) => {
        if (element instanceof HTMLVideoElement) {
            const videoElement = element as HTMLVideoElement;
            return (
                videoElement.readyState >= 2 &&
                videoElement.videoWidth > 0 &&
                videoElement.videoHeight > 0
            );
        }

        return element.width > 0 && element.height > 0;
    }, []);

    const recordTimingSample = useCallback(
        (durationMs: number, timestampMs: number) => {
            const cutoff = timestampMs - 10000;
            timingSamplesRef.current.push({ timestamp: timestampMs, duration: durationMs });
            timingSumRef.current += durationMs;

            while (timingSamplesRef.current.length > 0 && timingSamplesRef.current[0].timestamp < cutoff) {
                const removed = timingSamplesRef.current.shift();
                if (removed) {
                    timingSumRef.current -= removed.duration;
                }
            }

            if (timestampMs - lastTimingUpdateRef.current >= 500) {
                const count = timingSamplesRef.current.length;
                const avg = count > 0 ? timingSumRef.current / count : 0;
                setProcessingAvgMs(avg);
                lastTimingUpdateRef.current = timestampMs;
            }
        },
        []
    );

    const resetTimingStats = useCallback(() => {
        timingSamplesRef.current = [];
        timingSumRef.current = 0;
        lastTimingUpdateRef.current = 0;
        setProcessingAvgMs(null);
    }, []);

    const clearFaceDetectionLoop = useCallback(() => {
        if (faceDetectionIntervalRef.current === null) {
            return;
        }

        if (DEMO_E2E_MODE) {
            window.clearTimeout(faceDetectionIntervalRef.current);
        } else {
            cancelAnimationFrame(faceDetectionIntervalRef.current);
        }
        faceDetectionIntervalRef.current = null;
    }, []);

    const scheduleFaceDetectionLoop = useCallback((callback: () => void) => {
        faceDetectionIntervalRef.current = DEMO_E2E_MODE
            ? window.setTimeout(callback, Math.max(DEMO_E2E_LOOP_INTERVAL_MS, 50))
            : requestAnimationFrame(callback);
    }, []);

    const clearTrackingLoop = useCallback(() => {
        if (trackingRAFRef.current === null) {
            return;
        }

        if (DEMO_E2E_MODE) {
            window.clearTimeout(trackingRAFRef.current);
        } else {
            cancelAnimationFrame(trackingRAFRef.current);
        }
        trackingRAFRef.current = null;
    }, []);

    const scheduleTrackingLoop = useCallback((callback: () => void) => {
        trackingRAFRef.current = DEMO_E2E_MODE
            ? window.setTimeout(callback, Math.max(DEMO_E2E_LOOP_INTERVAL_MS, 50))
            : requestAnimationFrame(callback);
    }, []);

    // Initialize tracker on mount
    useEffect(() => {
        let cancelled = false;

        const initTracker = async () => {
            setIsInitializing(true);
            setError(null);

            try {
                if (DEMO_E2E_MODE) {
                    void tracker.initialize();
                    if (cancelled) {
                        return;
                    }
                    setTrackerState(tracker.getState());
                    return;
                }
                await tracker.initialize();
                if (cancelled) {
                    return;
                }
                setTrackerState(tracker.getState());
            } catch (err) {
                if (cancelled) {
                    return;
                }
                const message = err instanceof Error ? err.message : 'Failed to initialize tracker';
                setError(message);
                setTrackerState(TrackerState.Error);
            } finally {
                if (!cancelled) {
                    setIsInitializing(false);
                }
            }
        };

        void initTracker();

        return () => {
            cancelled = true;
            tracker.dispose();
            isTrackingRef.current = false;
            clearTrackingLoop();
            clearFaceDetectionLoop();
        };
    }, [clearFaceDetectionLoop, clearTrackingLoop, tracker]);

    // Reinitialize tracker when settings change
    useEffect(() => {
        if (!hasMountedSettingsRef.current) {
            hasMountedSettingsRef.current = true;
            return;
        }

        if (isCalibrating || isTracking) {
            // Don't change settings during calibration or tracking
            return;
        }

        let cancelled = false;
        const previousTracker = tracker;

        const reinitTracker = async () => {
            setIsInitializing(true);
            setError(null);

            // Dispose old tracker
            previousTracker.dispose();

            // Create new tracker with updated settings
            const newTracker = createDemoTracker({
                ...getConfigFromUrl(),
                delegate,
                runningMode
            });

            try {
                if (DEMO_E2E_MODE) {
                    void newTracker.initialize();
                    if (cancelled) {
                        newTracker.dispose();
                        return;
                    }
                    setTracker(newTracker);
                    setTrackerState(newTracker.getState());
                    return;
                }
                await newTracker.initialize();
                if (cancelled) {
                    newTracker.dispose();
                    return;
                }
                setTracker(newTracker);
                setTrackerState(newTracker.getState());
            } catch (err) {
                if (cancelled) {
                    newTracker.dispose();
                    return;
                }
                const message = err instanceof Error ? err.message : 'Failed to initialize tracker';
                setError(message);
                setTrackerState(TrackerState.Error);
            } finally {
                if (!cancelled) {
                    setIsInitializing(false);
                }
            }
        };

        void reinitTracker();

        return () => {
            cancelled = true;
        };
    }, [delegate, runningMode]);

    useEffect(() => {
        if (!isTracking) {
            return;
        }

        const SAMPLE_WINDOW_MS = 500;
        const SAMPLE_INTERVAL_MS = 16; // ~60fps sampling
        let samplingTimeout: ReturnType<typeof setTimeout> | null = null;
        let sampleInterval: ReturnType<typeof setInterval> | null = null;

        const handleClick = (event: MouseEvent) => {
            const clickPoint = { x: event.clientX, y: event.clientY };
            const gazeSamples: Array<{ x: number; y: number }> = [];

            // Clear any previous sampling in progress
            if (samplingTimeout) {
                clearTimeout(samplingTimeout);
                samplingTimeout = null;
            }
            if (sampleInterval) {
                clearInterval(sampleInterval);
                sampleInterval = null;
            }

            // Sample gaze every ~16ms for 500ms
            sampleInterval = setInterval(() => {
                const currentGaze = gazeRef.current;
                if (currentGaze) {
                    gazeSamples.push({ x: currentGaze.x, y: currentGaze.y });
                }
            }, SAMPLE_INTERVAL_MS);

            // After 500ms, compute the averaged gaze point and create the accuracy line
            samplingTimeout = setTimeout(() => {
                if (sampleInterval) {
                    clearInterval(sampleInterval);
                    sampleInterval = null;
                }

                // Need at least one valid sample
                if (gazeSamples.length === 0) {
                    return;
                }

                // Compute mean
                const meanX = gazeSamples.reduce((sum, s) => sum + s.x, 0) / gazeSamples.length;
                const meanY = gazeSamples.reduce((sum, s) => sum + s.y, 0) / gazeSamples.length;

                // Compute standard deviation
                const varianceX = gazeSamples.reduce((sum, s) => sum + Math.pow(s.x - meanX, 2), 0) / gazeSamples.length;
                const varianceY = gazeSamples.reduce((sum, s) => sum + Math.pow(s.y - meanY, 2), 0) / gazeSamples.length;
                const stdDev = Math.sqrt((varianceX + varianceY) / 2);

                const averagedGaze = { x: meanX, y: meanY };
                const distance = Math.hypot(clickPoint.x - averagedGaze.x, clickPoint.y - averagedGaze.y);
                const id = lineIdRef.current++;

                const line: ClickAccuracyLine = {
                    id,
                    click: clickPoint,
                    gaze: averagedGaze,
                    distance,
                    sampleCount: gazeSamples.length,
                    sampleStdDev: stdDev,
                };

                setClickLines((prev) => [...prev, line]);
            }, SAMPLE_WINDOW_MS);
        };

        window.addEventListener('click', handleClick);
        return () => {
            window.removeEventListener('click', handleClick);
            if (samplingTimeout) {
                clearTimeout(samplingTimeout);
            }
            if (sampleInterval) {
                clearInterval(sampleInterval);
            }
        };
    }, [isTracking]);

    useEffect(() => {
        if (clickLines.length === 0) {
            setAverageLineDistance(null);
            setClickAccuracyStats(null);
            return;
        }

        const total = clickLines.reduce((sum, line) => sum + line.distance, 0);
        const avg = total / clickLines.length;
        setAverageLineDistance(avg);
        setClickAccuracyStats({ average: avg, count: clickLines.length });
    }, [clickLines]);

    // Draw eye crops to canvases when available
    useEffect(() => {
        if (!eyeCrops) return;

        const drawToCanvas = (canvas: HTMLCanvasElement | null, imageData: ImageData) => {
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Scale up for visibility (4x)
            const scale = 4;
            canvas.width = imageData.width * scale;
            canvas.height = imageData.height * scale;

            // Create temporary canvas for the original size
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;
            tempCtx.putImageData(imageData, 0, 0);

            // Draw scaled up with nearest neighbor (crisp pixels)
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        };

        drawToCanvas(leftEyeCanvasRef.current, eyeCrops.leftEye);
        drawToCanvas(rightEyeCanvasRef.current, eyeCrops.rightEye);
        drawToCanvas(leftEyeProcessedCanvasRef.current, eyeCrops.leftEyeProcessed);
        drawToCanvas(rightEyeProcessedCanvasRef.current, eyeCrops.rightEyeProcessed);
    }, [eyeCrops]);

    // Face detection loop (runs when not tracking to show face box)
    useEffect(() => {
        if (!isPreviewStarted || isTracking || !tracker.isReady()) {
            // Stop face detection when tracking (gaze prediction handles it)
            clearFaceDetectionLoop();
            // Don't hide frozen frame here - tracking loop will handle it
            return;
        }

        const detectFace = () => {
            if (!videoRef.current || !isPreviewReady(videoRef.current)) {
                scheduleFaceDetectionLoop(detectFace);
                return;
            }

            const video = videoRef.current;
            const now = performance.now();
            const previewDimensions = getPreviewDimensions(video);

            if (
                DEMO_E2E_LOOP_INTERVAL_MS > 0 &&
                now - lastFaceDetectionRunAtRef.current < DEMO_E2E_LOOP_INTERVAL_MS
            ) {
                scheduleFaceDetectionLoop(detectFace);
                return;
            }
            lastFaceDetectionRunAtRef.current = now;

            // Only process if we have a new video frame (check currentTime)
            // In E2E mode with static image cameras, currentTime doesn't change, so skip this guard
            if (!DEMO_E2E_MODE && video instanceof HTMLVideoElement) {
                const videoElement = video as HTMLVideoElement;
                if (videoElement.currentTime === lastVideoTimeRef.current) {
                    scheduleFaceDetectionLoop(detectFace);
                    return;
                }
                lastVideoTimeRef.current = videoElement.currentTime;
            }

            try {
                const frameStart = performance.now();

                // Capture the current frame as ImageData - this is the frame we'll analyze
                const captureCanvas = document.createElement('canvas');
                captureCanvas.width = previewDimensions.width;
                captureCanvas.height = previewDimensions.height;
                const captureCtx = captureCanvas.getContext('2d');
                if (!captureCtx) {
                    scheduleFaceDetectionLoop(detectFace);
                    return;
                }
                captureCtx.drawImage(video, 0, 0);
                const imageData = captureCtx.getImageData(0, 0, captureCanvas.width, captureCanvas.height);

                // Display the frozen frame on canvas overlay
                if (!DEMO_E2E_MODE && displayCanvasRef.current) {
                    const displayCtx = displayCanvasRef.current.getContext('2d');
                    if (displayCtx) {
                        displayCanvasRef.current.width = previewDimensions.width;
                        displayCanvasRef.current.height = previewDimensions.height;
                        displayCtx.putImageData(imageData, 0, 0);
                        setShowFrozenFrame(true);
                    }
                }

                // Run face detection on the captured frame
                const detection = tracker.detectFace(imageData);
                setFaceDetection(detection);
                setNoFaceDetected(!detection);

                const frameEnd = performance.now();
                recordTimingSample(frameEnd - frameStart, frameEnd);

                // Always extract eye crops when face is detected
                if (!DEMO_E2E_MODE && detection && 'allLandmarks' in detection && detection.allLandmarks) {
                    const crops = extractEyeCrops(
                        imageData,
                        detection.allLandmarks,
                        previewDimensions.width,
                        previewDimensions.height
                    );
                    setEyeCrops(crops);
                } else if (!detection) {
                    setEyeCrops(null);
                }
            } catch (err) {
                console.error('Face detection error:', err);
            }

            scheduleFaceDetectionLoop(detectFace);
        };

        scheduleFaceDetectionLoop(detectFace);

        return () => {
            clearFaceDetectionLoop();
            // Hide frozen frame when face detection stops
            setShowFrozenFrame(false);
        };
    }, [clearFaceDetectionLoop, getPreviewDimensions, isPreviewReady, isPreviewStarted, isTracking, recordTimingSample, scheduleFaceDetectionLoop, showDiagnostics, tracker, trackerState]);

    const handleStartPreview = () => {
        setError(null);
        setIsPreviewStarted(true);
    };

    const handleStartCalibration = () => {
        setIsCalibrating(true);
        setError(null);
        setClickLines([]);
        setAverageLineDistance(null);
    };

    const handleCalibrationComplete = useCallback(
        (samples: CalibrationSample[]) => {
            setIsCalibrating(false);

            try {
                tracker.calibrate(samples);
                setTrackerState(tracker.getState());

                // Auto-start tracking after successful calibration
                resetTimingStats();
                setIsTracking(true);
                setError(null);
                startTrackingLoop();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Calibration failed';
                setError(message);
                setTrackerState(TrackerState.Error);
            }
        },
        [tracker]
    );

    const handleCalibrationCancel = () => {
        setIsCalibrating(false);
    };

    const handleStartTracking = () => {
        if (!tracker.isCalibrated()) {
            setError('Tracker must be calibrated before tracking');
            return;
        }

        resetTimingStats();
        setIsTracking(true);
        setError(null);
        startTrackingLoop();
    };

    const handleStopTracking = () => {
        isTrackingRef.current = false;
        setIsTracking(false);
        clearTrackingLoop();
        isPredictingRef.current = false;
        setGaze(null);
        gazeRef.current = null;
        setNoFaceDetected(false);
        setSamplingRate(0);
        resetTimingStats();
        setShowFrozenFrame(false);
    };

    const startTrackingLoop = useCallback(() => {
        isTrackingRef.current = true;

        // For calculating actual sampling rate (10-second sliding window)
        const frameTimestamps: number[] = [];
        let lastSamplingUpdate = 0;

        const track = () => {
            // Stop if tracking was disabled
            if (!isTrackingRef.current) {
                return;
            }

            // Schedule next frame first to keep loop running
            scheduleTrackingLoop(track);

            // Skip if previous prediction is still in progress
            if (isPredictingRef.current) {
                return;
            }

            if (!videoRef.current || !tracker.isCalibrated()) {
                return;
            }

            const video = videoRef.current;
            const now = performance.now();
            const previewDimensions = getPreviewDimensions(video);

            if (
                DEMO_E2E_LOOP_INTERVAL_MS > 0 &&
                now - lastTrackingRunAtRef.current < DEMO_E2E_LOOP_INTERVAL_MS
            ) {
                return;
            }
            lastTrackingRunAtRef.current = now;

            // Only process if we have a new video frame (check currentTime)
            // In E2E mode with static image cameras, currentTime doesn't change, so skip this guard
            if (!DEMO_E2E_MODE && video instanceof HTMLVideoElement) {
                const videoElement = video as HTMLVideoElement;
                if (videoElement.currentTime === lastVideoTimeRef.current) {
                    return;
                }
                lastVideoTimeRef.current = videoElement.currentTime;
            }

            isPredictingRef.current = true;

            // Calculate sampling rate (10-second sliding window, update every 500ms)
            frameTimestamps.push(now);
            // Remove timestamps older than 10 seconds
            const cutoff = now - 10000;
            while (frameTimestamps.length > 0 && frameTimestamps[0] < cutoff) {
                frameTimestamps.shift();
            }
            // Update display every 500ms
            if (now - lastSamplingUpdate >= 500) {
                if (frameTimestamps.length >= 2) {
                    const windowDuration = (frameTimestamps[frameTimestamps.length - 1] - frameTimestamps[0]) / 1000;
                    const rate = windowDuration > 0 ? (frameTimestamps.length - 1) / windowDuration : 0;
                    setSamplingRate(Math.round(rate));
                }
                lastSamplingUpdate = now;
            }

            const frameStart = performance.now();

            try {
                // Capture the current frame as ImageData - this is the frame we'll analyze
                const captureCanvas = document.createElement('canvas');
                captureCanvas.width = previewDimensions.width;
                captureCanvas.height = previewDimensions.height;
                const captureCtx = captureCanvas.getContext('2d');
                if (!captureCtx) {
                    isPredictingRef.current = false;
                    return;
                }
                captureCtx.drawImage(video, 0, 0);
                const imageData = captureCtx.getImageData(0, 0, captureCanvas.width, captureCanvas.height);

                // Display the frozen frame on canvas overlay
                if (!DEMO_E2E_MODE && displayCanvasRef.current) {
                    const displayCtx = displayCanvasRef.current.getContext('2d');
                    if (displayCtx) {
                        displayCanvasRef.current.width = previewDimensions.width;
                        displayCanvasRef.current.height = previewDimensions.height;
                        displayCtx.putImageData(imageData, 0, 0);
                        setShowFrozenFrame(true);
                    }
                }

                // Detect face and predict gaze on the SAME captured frame
                const detection = tracker.detectFace(imageData);

                if (detection === null) {
                    setNoFaceDetected(true);
                    setFaceDetection(null);
                    setGaze(null);
                    gazeRef.current = null;
                    setEyeCrops(null);
                } else {
                    const result = tracker.predictWithDetection(imageData, detection);
                    setNoFaceDetected(false);
                    setFaceDetection(detection);
                    setGaze(result);
                    gazeRef.current = result;

                    // Always extract eye crops for visualization during tracking
                    if (!DEMO_E2E_MODE && 'allLandmarks' in detection && detection.allLandmarks) {
                        const crops = extractEyeCrops(
                            imageData,
                            detection.allLandmarks,
                            previewDimensions.width,
                            previewDimensions.height
                        );
                        setEyeCrops(crops);
                    }
                }

                const frameEnd = performance.now();
                recordTimingSample(frameEnd - frameStart, frameEnd);
            } catch (err) {
                console.error('Tracking error:', err);
            } finally {
                isPredictingRef.current = false;
            }
        };

        // Start the animation loop
        scheduleTrackingLoop(track);
    }, [getPreviewDimensions, recordTimingSample, scheduleTrackingLoop, tracker]);

    const handleReset = () => {
        handleStopTracking();
        tracker.reset();
        setTrackerState(tracker.getState());
        setError(null);
        setClickLines([]);
        setAverageLineDistance(null);
    };

    // Track video resolution and FPS changes
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (video instanceof HTMLCanvasElement) {
            if (video.width > 0 && video.height > 0) {
                setVideoResolution({ width: video.width, height: video.height });
                setWebcamFps(5);
            }
            return;
        }

        const updateResolution = () => {
            const videoElement = video as HTMLVideoElement;
            if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                setVideoResolution({ width: videoElement.videoWidth, height: videoElement.videoHeight });

                // Get FPS from the video track settings
                const stream = videoElement.srcObject as MediaStream | null;
                if (stream) {
                    const videoTrack = stream.getVideoTracks()[0];
                    if (videoTrack) {
                        const settings = videoTrack.getSettings();
                        if (settings.frameRate) {
                            setWebcamFps(Math.round(settings.frameRate));
                        }
                    }
                }
            }
        };

        video.addEventListener('loadedmetadata', updateResolution);
        video.addEventListener('resize', updateResolution);

        // Check immediately if already loaded
        updateResolution();

        return () => {
            video.removeEventListener('loadedmetadata', updateResolution);
            video.removeEventListener('resize', updateResolution);
        };
    }, [selectedDeviceId]); // Re-attach when camera changes

    const handleWebcamError = (err: Error) => {
        setError(`Webcam error: ${err.message}`);
    };

    useEffect(() => {
        // Expose tracker plus a small, test-safe state surface for Playwright.
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
                isPreviewStarted,
                selectedDeviceId,
                canStartCalibration:
                    isPreviewStarted &&
                    trackerState !== TrackerState.Uninitialized &&
                    trackerState !== TrackerState.Error &&
                    !isInitializing &&
                    !isTracking &&
                    !noFaceDetected,
                canStartTracking: trackerState === TrackerState.Calibrated && !isTracking,
                calibrationPointCount: 17,
            }),
        };

        return () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (window as any).__webcamETLightDemo__;
        };
    }, [
        tracker,
        trackerState,
        isInitializing,
        isCalibrating,
        isTracking,
        error,
        gaze,
        noFaceDetected,
        isPreviewStarted,
        selectedDeviceId,
    ]);

    return (
        <div className="app-container" style={{ backgroundColor }}>
            <header className="header">
                <div className="header-inner">
                    <div className="header-copy">
                        <div className="header-top">
                        </div>

                        <h1>
                            <a href="https://www.realeye.io/" target="_blank" rel="noopener noreferrer" title="Online Research Platform with Webcam Eye-Tracking">RealEye</a> — Webcam EyeTracker Light
                        </h1>
                        <p>
                            A webcam eye-tracker running in your browser that provides on-screen gaze coordinates.
                            Works with any regular camera — laptop, USB, or mobile. Everything runs locally on your device.
                        </p>

                        <div className="header-badges" aria-label="Key product highlights">
                            <span className="header-badge">Light version</span>
                            <span className="header-badge">Local-only processing</span>
                            <span className="header-badge">Any camera: laptop, USB, mobile</span>
                            <span className="header-badge">17-point calibration</span>
                            <a
                                href="https://github.com/RealEye-io/webcam-eyetracker-light-open"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="header-badge header-badge-opensource"
                                title="Open source on GitHub"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                                </svg>
                                Open Source
                            </a>
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
                                <strong>{delegate === 'GPU' ? 'GPU / WebGL' : 'CPU / WASM'}</strong>
                            </div>
                            <div className="header-card-item">
                                <span>Face mode</span>
                                <strong>{runningMode}</strong>
                            </div>
                            <div className="header-card-item">
                                <span>Max res</span>
                                <strong>{maxResolution}</strong>
                            </div>
                            {isTracking && clickAccuracyStats != null && (
                                <div className="header-card-item header-card-item-accent">
                                    <span>Click vs Gaze Accuracy</span>
                                    <strong>{clickAccuracyStats.average.toFixed(1)} px</strong>
                                    <span className="header-card-item-detail">Average of {clickAccuracyStats.count} click{clickAccuracyStats.count !== 1 ? 's' : ''}</span>
                                </div>
                            )}
                        </div>
                        <div className="header-card-note">
                            <span className="header-card-note-dot" aria-hidden="true" />
                            {isTracking ? (
                                <span>💡 Click anywhere on screen to measure click accuracy</span>
                            ) : (
                                <span>All inference stays on-device.</span>
                            )}
                        </div>
                    </aside>
                </div>
            </header>

            <main className="main-content">
                {/* Mobile device warning banner */}
                {!DEMO_E2E_MODE && <DeviceWarningBanner />}

                {/* Two-column layout: sidebar for settings/diagnostics, main area for webcam */}
                <div className="demo-layout">
                    {/* Left sidebar - settings and diagnostics */}
                    <div className="demo-sidebar">
                        {/* Settings toggle button */}
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowSettings(!showSettings)}
                            style={{ marginBottom: '8px', width: '100%' }}
                        >
                            {showSettings ? '▼ Hide Settings' : '▶ Show Settings'}
                        </button>

                        {/* Settings */}
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

                        {/* Diagnostics toggle */}
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowDiagnostics(!showDiagnostics)}
                            style={{ marginTop: '16px', fontSize: '12px', width: '100%' }}
                        >
                            {showDiagnostics ? '▼ Hide Diagnostics' : '▶ Show Diagnostics'}
                        </button>

                        {/* Diagnostics panel */}
                        {showDiagnostics && (
                            <div className="diagnostics-panel" style={{ marginTop: '8px' }}>
                                <h3>Diagnostics</h3>
                                <table className="diagnostics-table">
                                    <tbody>
                                        <tr>
                                            <td>Video Resolution:</td>
                                            <td>
                                                {videoResolution
                                                    ? `${videoResolution.width}×${videoResolution.height}`
                                                    : 'Loading...'}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Webcam FPS:</td>
                                            <td>{webcamFps ?? 'N/A'}</td>
                                        </tr>
                                        <tr>
                                            <td>Screen Resolution:</td>
                                            <td>{window.screen.width}×{window.screen.height}</td>
                                        </tr>
                                        <tr>
                                            <td>Viewport Size:</td>
                                            <td>{window.innerWidth}×{window.innerHeight}</td>
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
                                            <td><code style={{ fontSize: '10px', wordBreak: 'break-all' }}>{JSON.stringify(getConfigFromUrl())}</code></td>
                                        </tr>
                                    </tbody>
                                </table>

                                {/* Processed eye crops (regression input) - labels swapped because view is mirrored */}
                                <div className="eye-crops-section">
                                    <h4>Regression Input {eyeCrops ? `(${eyeCrops.targetWidth}×${eyeCrops.targetHeight}px)` : ''}</h4>
                                    <div className="eye-crops-container">
                                        <div className="eye-crop">
                                            <label>Left Eye</label>
                                            <canvas ref={rightEyeProcessedCanvasRef} className="eye-canvas" />
                                        </div>
                                        <div className="eye-crop">
                                            <label>Right Eye</label>
                                            <canvas ref={leftEyeProcessedCanvasRef} className="eye-canvas" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Main area - webcam and controls */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {/* Status bar */}
                        <div className="status-bar" data-testid="tracker-status-bar">
                            <div className="status-indicator" data-testid="tracker-status-indicator">
                                <span
                                    className={`status-dot ${trackerState.toLowerCase()}`}
                                    data-testid="tracker-status-dot"
                                    data-state={trackerState}
                                />
                                <span>{STATUS_LABELS[trackerState]}</span>
                            </div>
                            {isInitializing && (
                                <div className="loading">
                                    <span className="spinner" />
                                    <span>Loading face detection model...</span>
                                </div>
                            )}
                            {isTracking && noFaceDetected && (
                                <span style={{ color: '#f44336' }} data-testid="tracking-no-face-warning">
                                    ⚠️ No face detected
                                </span>
                            )}
                            {clickLines.length > 0 && averageLineDistance !== null && (
                                <span className="metric-badge metric-badge-accuracy">
                                    Avg click error: {Math.round(averageLineDistance)} px
                                </span>
                            )}
                            {!isPreviewStarted && trackerState !== TrackerState.Uninitialized && trackerState !== TrackerState.Error && (
                                <span style={{ color: '#90caf9' }} data-testid="preview-not-started-hint">
                                    Click Start Camera to begin preview
                                </span>
                            )}
                            {!isTracking && !isCalibrating && isPreviewStarted && noFaceDetected && trackerState !== TrackerState.Uninitialized && (
                                <span style={{ color: '#ff9800' }} data-testid="idle-no-face-warning">
                                    ⚠️ No face detected
                                </span>
                            )}
                        </div>

                        {/* Error message */}
                        {error && (
                            <div className="error-message" data-testid="error-message">
                                {error}
                            </div>
                        )}

                        {/* Webcam selector */}
                        <WebcamSelector
                            selectedDeviceId={selectedDeviceId}
                            onDeviceChange={setSelectedDeviceId}
                            disabled={!isPreviewStarted || isCalibrating || isTracking}
                            refreshKey={deviceRefreshKey}
                        />

                        {/* Webcam preview */}
                        <div className="webcam-container" data-testid="webcam-container">
                            {!isPreviewStarted && (
                                <div className="webcam-placeholder" data-testid="webcam-placeholder">
                                    Camera is off. Click Start Camera to begin preview.
                                </div>
                            )}
                            {isPreviewStarted && (
                                <WebcamPreview
                                    deviceId={selectedDeviceId}
                                    videoRef={videoRef}
                                    onError={handleWebcamError}
                                    onStreamReady={() => setDeviceRefreshKey(k => k + 1)}
                                    maxResolution={maxResolution}
                                />
                            )}
                            <canvas
                                ref={displayCanvasRef}
                                className="webcam-video frozen-frame-canvas"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    zIndex: 5,
                                    display: showFrozenFrame ? 'block' : 'none',
                                }}
                            />
                            <FaceOverlay
                                videoRef={showFrozenFrame ? displayCanvasRef : videoRef}
                                detection={faceDetection}
                                visible={!DEMO_E2E_MODE && !isCalibrating && trackerState !== TrackerState.Uninitialized}
                            />
                            {trackerState === TrackerState.Uninitialized && (
                                <div className="webcam-overlay">
                                    <span>Initializing tracker...</span>
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <div className="controls">
                            <button
                                className="btn btn-secondary"
                                data-testid="start-camera-button"
                                onClick={handleStartPreview}
                                disabled={
                                    isPreviewStarted ||
                                    trackerState === TrackerState.Uninitialized ||
                                    trackerState === TrackerState.Error ||
                                    isInitializing ||
                                    isCalibrating ||
                                    isTracking
                                }
                            >
                                {isPreviewStarted ? 'Camera Started' : 'Start Camera'}
                            </button>

                            <button
                                className={`btn ${trackerState === TrackerState.Calibrated ? "btn-secondary" : "btn-primary"}`}
                                data-testid="start-calibration-button"
                                onClick={handleStartCalibration}
                                disabled={
                                    !isPreviewStarted ||
                                    trackerState === TrackerState.Uninitialized ||
                                    trackerState === TrackerState.Error ||
                                    isInitializing ||
                                    isTracking ||
                                    noFaceDetected
                                }
                                title={noFaceDetected ? 'Face must be detected to calibrate' : ''}
                            >
                                {trackerState === TrackerState.Calibrated ? 'Recalibrate' : 'Start Calibration'}
                            </button>

                            {trackerState === TrackerState.Calibrated && (
                                <>
                                    <button
                                        className={`btn ${isTracking ? "btn-danger" : "btn-cta"}`}
                                        data-testid="tracking-toggle-button"
                                        onClick={isTracking ? handleStopTracking : handleStartTracking}
                                    >
                                        {isTracking ? 'Stop Tracking' : 'Start Tracking'}
                                    </button>
                                    <button className="btn btn-secondary" data-testid="reset-button" onClick={handleReset}>
                                        Reset
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Background color buttons */}
                        <div className="background-controls">
                            <span className="background-label">Background:</span>
                            <button
                                className={`bg-btn bg-btn-default ${backgroundColor === BACKGROUND_COLORS.default ? 'active' : ''}`}
                                onClick={() => setBackgroundColor(BACKGROUND_COLORS.default)}
                                title="Default"
                            />
                            <button
                                className={`bg-btn bg-btn-white ${backgroundColor === BACKGROUND_COLORS.white ? 'active' : ''}`}
                                onClick={() => setBackgroundColor(BACKGROUND_COLORS.white)}
                                title="White"
                            />
                            <button
                                className={`bg-btn bg-btn-gray ${backgroundColor === BACKGROUND_COLORS.gray ? 'active' : ''}`}
                                onClick={() => setBackgroundColor(BACKGROUND_COLORS.gray)}
                                title="Gray"
                            />
                            <button
                                className={`bg-btn bg-btn-black ${backgroundColor === BACKGROUND_COLORS.black ? 'active' : ''}`}
                                onClick={() => setBackgroundColor(BACKGROUND_COLORS.black)}
                                title="Black"
                            />
                            <button
                                className="bg-btn bg-btn-random"
                                onClick={() => setBackgroundColor(getRandomColor())}
                                title="Random"
                            >
                                🎲
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="footer" aria-label="App attribution">
                v{__APP_VERSION__} · Created by <a href="https://www.realeye.io/" target="_blank" rel="noopener noreferrer" title="Online Research Platform with Webcam Eye-Tracking">RealEye</a> Sp. z o. o. — Poland, EU · <a href="https://github.com/RealEye-io/webcam-eyetracker-light-open" target="_blank" rel="noopener noreferrer">GitHub</a>
            </footer>

            {/* Calibration overlay */}
            {isCalibrating && (
                <CalibrationOverlay
                    videoRef={videoRef}
                    onComplete={handleCalibrationComplete}
                    onCancel={handleCalibrationCancel}
                    samplesPerPoint={DEMO_E2E_CONFIG.calibrationSamplesPerPoint}
                    captureIntervalMs={DEMO_E2E_CONFIG.calibrationCaptureIntervalMs}
                    initialDelayMs={DEMO_E2E_CONFIG.calibrationInitialDelayMs}
                />
            )}

            <ClickAccuracyOverlay lines={clickLines} />

            {/* Gaze visualization */}
            <GazeVisualization
                x={gaze?.x ?? null}
                y={gaze?.y ?? null}
                noFace={noFaceDetected}
                visible={isTracking}
            />

            {/* Gaze trail (lazy-loaded, only during tracking) */}
            {isTracking && (
                <Suspense fallback={null}>
                    <GazeTrail
                        gaze={gaze}
                        visible={isTracking}
                    />
                </Suspense>
            )}

            {/* Performance stats - fixed position bottom right (hidden during calibration) */}
            {!isCalibrating && (
                <div className="perf-stats-overlay">
                    {videoResolution && (
                        <div className="perf-stats-webcam">
                            Webcam: {videoResolution.width}×{videoResolution.height}
                            {webcamFps !== null && ` @ ${webcamFps} fps`}
                        </div>
                    )}
                    {processingAvgMs !== null && (
                        <div>
                            Proc: {processingAvgMs.toFixed(1)} ms
                        </div>
                    )}
                    {samplingRate > 0 && (
                        <div className="perf-stats-sampling">
                            Sampling: {samplingRate} Hz
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
