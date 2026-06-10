/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CalibrationSample } from '@lib/types';
import { getCalibrationPoints, CalibrationPattern } from '@lib/calibration/CalibrationPatterns';

interface CalibrationPoint {
    id: string;
    name: string;
    xPercent: number;
    yPercent: number;
}

// Generate 17-point grid calibration pattern for improved accuracy (~155px MAE)
const generateCalibrationPoints = (): CalibrationPoint[] => {
    const points = getCalibrationPoints(CalibrationPattern.GRID_17);
    // Names are generated dynamically for 17-point grid (corners, edges, inner grid)
    return points.map((p, i) => ({
        id: `p${i + 1}`,
        name: `Point ${i + 1}`,
        xPercent: p.x * 100,
        yPercent: p.y * 100,
    }));
};

const CALIBRATION_POINTS: CalibrationPoint[] = generateCalibrationPoints();

// Default configuration for multi-sample capture
// Using 1 sample per point with 9x augmentation (±1px shifts) in the tracker
const DEFAULT_SAMPLES_PER_POINT = 1;
const DEFAULT_CAPTURE_INTERVAL_MS = 150;
const INITIAL_DELAY_MS = 200;

interface CalibrationOverlayProps {
    videoRef: React.RefObject<HTMLVideoElement | HTMLCanvasElement>;
    onComplete: (samples: CalibrationSample[]) => void;
    onCancel: () => void;
    /** Number of samples to capture per calibration point (default: 1) */
    samplesPerPoint?: number;
    /** Interval between sample captures in ms (default: 150) */
    captureIntervalMs?: number;
    /** Initial delay before capturing a point in ms (default: 200) */
    initialDelayMs?: number;
}

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({
    videoRef,
    onComplete,
    onCancel,
    samplesPerPoint = DEFAULT_SAMPLES_PER_POINT,
    captureIntervalMs = DEFAULT_CAPTURE_INTERVAL_MS,
    initialDelayMs = INITIAL_DELAY_MS,
}) => {
    const [currentPointIndex, setCurrentPointIndex] = useState(0);
    const [completedPoints, setCompletedPoints] = useState<Set<string>>(new Set());
    const [samples, setSamples] = useState<CalibrationSample[]>([]);
    const [isCapturing, setIsCapturing] = useState(false);
    const [captureProgress, setCaptureProgress] = useState<{ current: number; total: number } | null>(null);
    const [captureError, setCaptureError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const currentPoint = CALIBRATION_POINTS[currentPointIndex];

    const captureImage = useCallback((): ImageData | null => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas) {
            console.error('captureImage: video or canvas ref is null', { video: !!video, canvas: !!canvas });
            return null;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('captureImage: failed to get 2d context');
            return null;
        }

        // Check if video has valid dimensions
        const sourceWidth = video instanceof HTMLVideoElement ? video.videoWidth : video.width;
        const sourceHeight = video instanceof HTMLVideoElement ? video.videoHeight : video.height;

        if (sourceWidth === 0 || sourceHeight === 0) {
            console.error('captureImage: video dimensions are 0', {
                videoWidth: sourceWidth,
                videoHeight: sourceHeight,
                readyState: video instanceof HTMLVideoElement ? video.readyState : 'canvas'
            });
            return null;
        }

        canvas.width = sourceWidth;
        canvas.height = sourceHeight;

        ctx.drawImage(video, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }, [videoRef]);

    const handlePointClick = useCallback(
        async (point: CalibrationPoint) => {
            console.log('[Calibration] Point clicked:', point.id, { isCapturing, alreadyCompleted: completedPoints.has(point.id) });
            if (completedPoints.has(point.id) || isCapturing) return;

            setIsCapturing(true);
            setCaptureError(null);
            setCaptureProgress({ current: 0, total: samplesPerPoint });

            // Initial delay to ensure user is looking at the point
            await new Promise(resolve => setTimeout(resolve, initialDelayMs));

            // Calculate gaze coordinates in CSS pixels
            const gazeX = (point.xPercent / 100) * window.innerWidth;
            const gazeY = (point.yPercent / 100) * window.innerHeight;

            const newSamplesForPoint: CalibrationSample[] = [];

            // Capture multiple samples per point
            for (let i = 0; i < samplesPerPoint; i++) {
                setCaptureProgress({ current: i + 1, total: samplesPerPoint });

                console.log(`[Calibration] Capturing sample ${i + 1}/${samplesPerPoint} for point ${point.id}...`);
                const imageData = captureImage();

                if (imageData) {
                    newSamplesForPoint.push({
                        image: imageData,
                        gazeX,
                        gazeY,
                    });
                } else {
                    console.warn(`[Calibration] Failed to capture sample ${i + 1} for point ${point.id}`);
                }

                // Wait between captures (except after last one)
                if (i < samplesPerPoint - 1) {
                    await new Promise(resolve => setTimeout(resolve, captureIntervalMs));
                }
            }

            if (newSamplesForPoint.length === 0) {
                setCaptureError('Failed to capture any webcam images. Please ensure your webcam is working and try clicking the point again.');
                setIsCapturing(false);
                setCaptureProgress(null);
                return;
            }

            console.log(`[Calibration] Captured ${newSamplesForPoint.length}/${samplesPerPoint} samples for point ${point.id}`);

            const allSamples = [...samples, ...newSamplesForPoint];
            console.log('[Calibration] Total samples:', allSamples.length);
            setSamples(allSamples);
            setCompletedPoints(new Set([...completedPoints, point.id]));

            setIsCapturing(false);
            setCaptureProgress(null);

            // Move to next point or complete
            if (currentPointIndex < CALIBRATION_POINTS.length - 1) {
                console.log('[Calibration] Moving to next point:', currentPointIndex + 1);
                setCurrentPointIndex(currentPointIndex + 1);
            } else {
                // All points completed
                console.log('[Calibration] *** ALL POINTS COMPLETED *** Calling onComplete with', allSamples.length, 'samples');
                onComplete(allSamples);
                console.log('[Calibration] onComplete returned');
            }
        },
        [
            completedPoints,
            isCapturing,
            captureImage,
            samples,
            currentPointIndex,
            onComplete,
            samplesPerPoint,
            captureIntervalMs,
        ]
    );

    // Handle escape key to cancel
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    return (
        <div className="calibration-overlay" data-testid="calibration-overlay">
            {/* Hidden canvas for image capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Error message */}
            {captureError && (
                <div className="calibration-error" data-testid="calibration-error">
                    {captureError}
                </div>
            )}

            {/* Instruction */}
            <div className="calibration-instruction" data-testid="calibration-instruction">
                {isCapturing ? (
                    captureProgress ? (
                        `Capturing ${captureProgress.current}/${captureProgress.total}...`
                    ) : (
                        'Capturing...'
                    )
                ) : (
                    <>
                        Look at the <strong>{currentPoint.name}</strong> dot and click it
                    </>
                )}
            </div>

            {/* Calibration points */}
            {CALIBRATION_POINTS.map(point => {
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
                            left: `${point.xPercent}%`,
                            top: `${point.yPercent}%`,
                            transform: 'translate(-50%, -50%)',
                            opacity: isCurrent ? 1 : isCompleted ? 0.7 : 0.2,
                        }}
                        onClick={() => !isInactive && !isCompleted && handlePointClick(point)}
                    >
                        <div className="calibration-point-inner" />
                    </div>
                );
            })}

            {/* Progress indicator */}
            <div className="calibration-progress" data-testid="calibration-progress">
                {completedPoints.size} / {CALIBRATION_POINTS.length} points captured
                <br />
                <small>Press ESC to cancel</small>
            </div>
        </div>
    );
};
