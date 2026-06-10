/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useEffect, useRef } from 'react';
import type { RealCameraTestSourceDescriptor } from '@realeye-io/realtesting-camera';
import { isDemoE2EMode } from '../testing/e2eConfig';

export interface Resolution {
    width: number;
    height: number;
    name: string;
}

export const PREFERRED_RESOLUTIONS: Resolution[] = [
    { width: 3840, height: 2160, name: '4K' },
    { width: 2560, height: 1440, name: '1440p' },
    { width: 1920, height: 1080, name: '1080p' },
    { width: 1280, height: 720, name: '720p' },
    { width: 640, height: 480, name: 'VGA' },
];

/**
 * Video dimensions from the actual video element.
 * CRITICAL: On iOS, getSettings() may report landscape dimensions even for portrait cameras.
 * Always use videoElement.videoWidth/videoHeight as the source of truth.
 */
export interface ActualVideoDimensions {
    width: number;
    height: number;
    isPortrait: boolean;
    /** True if getSettings() reported different orientation than actual video */
    hasOrientationMismatch: boolean;
}

interface WebcamPreviewProps {
    deviceId?: string | null;
    onStreamReady?: (stream: MediaStream) => void;
    onError?: (error: Error) => void;
    videoRef?: React.RefObject<HTMLVideoElement | HTMLCanvasElement>;
    className?: string;
    /** Maximum resolution to attempt. Resolutions above this will be filtered out. */
    maxResolution?: 'VGA' | 'HD' | 'Full HD' | 'QHD' | '4K';
    /** 
     * Called with actual video dimensions from videoElement (source of truth).
     * This handles iOS Safari bug where getSettings() reports wrong orientation.
     */
    onResolutionDetected?: (
        requestedResolution: Resolution,
        actualDimensions: ActualVideoDimensions
    ) => void;
}

export const WebcamPreview: React.FC<WebcamPreviewProps> = ({
    deviceId,
    onStreamReady,
    onError,
    videoRef: externalVideoRef,
    className = '',
    maxResolution = '4K',
    onResolutionDetected,
}) => {
    const internalVideoRef = useRef<HTMLVideoElement | HTMLCanvasElement>(null);
    const videoRef = externalVideoRef ?? internalVideoRef;
    const streamRef = useRef<MediaStream | null>(null);
    const isStartingRef = useRef(false);
    const isDemoE2EAllow = isDemoE2EMode() && window.__REALCAMERA_TEST_CONFIG__?.virtualPermission === 'allow';

    // Store callbacks in refs to avoid re-running effect when they change
    const onStreamReadyRef = useRef(onStreamReady);
    const onErrorRef = useRef(onError);
    const onResolutionDetectedRef = useRef(onResolutionDetected);
    onStreamReadyRef.current = onStreamReady;
    onErrorRef.current = onError;
    onResolutionDetectedRef.current = onResolutionDetected;

    useEffect(() => {
        const element = videoRef.current;
        if (!element) return;

        if (isDemoE2EAllow && window.__webcamEtLightE2EVideo__) {
            const resolutionMap: Record<string, number> = {
                'VGA': 640,
                'HD': 1280,
                'Full HD': 1920,
                'QHD': 2560,
                '4K': 3840,
            };
            const maxWidth = resolutionMap[maxResolution];
            const allowedResolutions = PREFERRED_RESOLUTIONS.filter(r => r.width <= maxWidth);
            const usedResolution = allowedResolutions[0] ?? PREFERRED_RESOLUTIONS[PREFERRED_RESOLUTIONS.length - 1];

            if (!(element instanceof HTMLCanvasElement)) {
                onErrorRef.current?.(new Error('Demo E2E preview expected a canvas element.'));
                return;
            }

            element.width = usedResolution.width;
            element.height = usedResolution.height;
            const ctx = element.getContext('2d');

            if (!ctx) {
                onErrorRef.current?.(new Error('Failed to create demo E2E preview canvas.'));
                return;
            }

            const activeDeviceId =
                deviceId ?? window.__webcamEtLightE2EVideo__.listDevices().find(device => device.enabled)?.id ?? null;

            // Cache loaded images so we don't re-fetch on every frame
            const imageCache = new Map<string, HTMLImageElement>();

            const loadImage = (url: string): Promise<HTMLImageElement> => {
                if (imageCache.has(url)) {
                    return Promise.resolve(imageCache.get(url)!);
                }
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        imageCache.set(url, img);
                        resolve(img);
                    };
                    img.onerror = reject;
                    img.src = url;
                });
            };

            const drawDescriptor = (
                descriptor: RealCameraTestSourceDescriptor | null,
                frameIndex: number
            ) => {
                ctx.clearRect(0, 0, element.width, element.height);

                if (!descriptor || descriptor.type === 'blank') {
                    ctx.fillStyle = descriptor?.color ?? '#0f172a';
                    ctx.fillRect(0, 0, element.width, element.height);
                    if (descriptor?.text) {
                        ctx.fillStyle = '#f8fafc';
                        ctx.font = '24px sans-serif';
                        ctx.fillText(descriptor.text, 24, 48);
                    }
                    return;
                }

                if (descriptor.type === 'pattern') {
                    const gradient = ctx.createLinearGradient(0, 0, element.width, element.height);
                    gradient.addColorStop(0, '#22d3ee');
                    gradient.addColorStop(1, '#a855f7');
                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, 0, element.width, element.height);
                    ctx.fillStyle = 'rgba(15, 23, 34, 0.65)';
                    ctx.fillRect(16, 16, element.width - 32, 86);
                    ctx.fillStyle = '#f8fafc';
                    ctx.font = '24px sans-serif';
                    ctx.fillText('ET Light pattern fixture', 24, 52);
                    ctx.font = '18px sans-serif';
                    ctx.fillText(`Frame ${frameIndex}`, 24, 82);
                    return;
                }

                if (descriptor.type === 'color') {
                    ctx.fillStyle = descriptor.color;
                    ctx.fillRect(0, 0, element.width, element.height);
                    if (descriptor.text) {
                        ctx.fillStyle = '#f8fafc';
                        ctx.font = '24px sans-serif';
                        ctx.fillText(descriptor.text, 24, 48);
                    }
                    return;
                }

                if (descriptor.type === 'image' && descriptor.url) {
                    const cachedImg = imageCache.get(descriptor.url);
                    if (cachedImg) {
                        // Draw synchronously from cache
                        const imgAspect = cachedImg.width / cachedImg.height;
                        const canvasAspect = element.width / element.height;
                        let drawWidth, drawHeight, drawX, drawY;
                        if (imgAspect > canvasAspect) {
                            drawHeight = element.height;
                            drawWidth = drawHeight * imgAspect;
                            drawX = (element.width - drawWidth) / 2;
                            drawY = 0;
                        } else {
                            drawWidth = element.width;
                            drawHeight = drawWidth / imgAspect;
                            drawX = 0;
                            drawY = (element.height - drawHeight) / 2;
                        }
                        ctx.drawImage(cachedImg, drawX, drawY, drawWidth, drawHeight);
                    } else {
                        // Load async — first render will be blank, next render will draw
                        loadImage(descriptor.url).catch((err) => {
                            console.warn('Failed to load image source:', err);
                        });
                    }
                    return;
                }
            };

            let frameIndex = 0;
            const renderFrame = () => {
                if (!activeDeviceId) {
                    drawDescriptor(null, frameIndex);
                    return;
                }

                const descriptor = window.__webcamEtLightE2EVideo__?.getSourceDescriptor(activeDeviceId) ?? null;
                drawDescriptor(descriptor, frameIndex);
            };

            renderFrame();
            const intervalId = window.setInterval(() => {
                frameIndex += 1;
                renderFrame();
            }, 200);
            const unsubscribe = window.__webcamEtLightE2EVideo__.subscribe(() => {
                renderFrame();
            });

            onResolutionDetectedRef.current?.(usedResolution, {
                width: usedResolution.width,
                height: usedResolution.height,
                isPortrait: usedResolution.height > usedResolution.width,
                hasOrientationMismatch: false,
            });

            return () => {
                window.clearInterval(intervalId);
                unsubscribe();
            };
        }

        if (!(element instanceof HTMLVideoElement)) {
            onErrorRef.current?.(new Error('Standard webcam preview expected a video element.'));
            return;
        }

        const video = element;

        const tryResolution = async (resolution: Resolution): Promise<MediaStream | null> => {
            try {
                // Match ET Data Collector constraints exactly
                const constraints: MediaStreamConstraints = {
                    audio: false,
                    video: {
                        // deviceId comes first if specified, then other constraints
                        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
                        frameRate: { min: 15, ideal: 30 },
                        facingMode: 'user',
                        width: { ideal: resolution.width, max: 3840 },
                        height: { ideal: resolution.height, max: 3840 },
                    },
                };
                return await navigator.mediaDevices.getUserMedia(constraints);
            } catch {
                return null;
            }
        };

        const startWebcam = async () => {
            // Prevent multiple simultaneous start attempts
            if (isStartingRef.current) {
                return;
            }
            isStartingRef.current = true;

            // Stop existing stream if any
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }

            try {
                // Filter resolutions based on maxResolution setting
                const resolutionMap: Record<string, number> = {
                    'VGA': 640,
                    'HD': 1280,
                    'Full HD': 1920,
                    'QHD': 2560,
                    '4K': 3840,
                };
                const maxWidth = resolutionMap[maxResolution];
                const allowedResolutions = PREFERRED_RESOLUTIONS.filter(r => r.width <= maxWidth);

                let stream: MediaStream | null = null;
                let usedResolution: Resolution | null = null;

                // Try each resolution from highest to lowest
                for (const resolution of allowedResolutions) {
                    stream = await tryResolution(resolution);
                    if (stream) {
                        usedResolution = resolution;
                        const videoTrack = stream.getVideoTracks()[0];
                        const settings = videoTrack.getSettings();
                        console.log(`[WebcamPreview] Got stream at ${resolution.name}: requested ${resolution.width}×${resolution.height}, actual ${settings.width}×${settings.height}`);
                        break;
                    }
                }

                if (!stream || !usedResolution) {
                    throw new Error('Failed to get webcam stream at any resolution');
                }

                streamRef.current = stream;
                video.srcObject = stream;

                // Wait for loadedmetadata before playing
                await new Promise<void>((resolve, reject) => {
                    const handleLoaded = () => {
                        video.removeEventListener('loadedmetadata', handleLoaded);
                        video.removeEventListener('error', handleError);
                        resolve();
                    };
                    const handleError = () => {
                        video.removeEventListener('loadedmetadata', handleLoaded);
                        video.removeEventListener('error', handleError);
                        reject(new Error('Video failed to load'));
                    };
                    video.addEventListener('loadedmetadata', handleLoaded);
                    video.addEventListener('error', handleError);
                });

                await video.play();

                // CRITICAL: Get actual dimensions from video element, NOT from getSettings()
                // iOS Safari bug: getSettings() may report landscape dimensions for portrait cameras
                const actualWidth = video.videoWidth;
                const actualHeight = video.videoHeight;
                const isPortrait = actualHeight > actualWidth;

                // Check for iOS orientation mismatch
                const videoTrack = stream.getVideoTracks()[0];
                const settings = videoTrack.getSettings();
                const settingsWidth = settings.width ?? 0;
                const settingsHeight = settings.height ?? 0;
                const settingsIsLandscape = settingsWidth > settingsHeight;
                const actualIsLandscape = actualWidth > actualHeight;
                const hasOrientationMismatch = settingsIsLandscape !== actualIsLandscape;

                if (hasOrientationMismatch) {
                    console.warn(
                        `[WebcamPreview] iOS orientation bug detected!\n` +
                        `  getSettings() reported: ${settingsWidth}×${settingsHeight} (${settingsIsLandscape ? 'landscape' : 'portrait'})\n` +
                        `  Actual video element: ${actualWidth}×${actualHeight} (${isPortrait ? 'portrait' : 'landscape'})\n` +
                        `  Using actual video dimensions as source of truth.`
                    );
                }

                console.log(
                    `[WebcamPreview] Video ready:\n` +
                    `  Requested: ${usedResolution.name} (${usedResolution.width}×${usedResolution.height})\n` +
                    `  getSettings(): ${settingsWidth}×${settingsHeight}\n` +
                    `  Actual video: ${actualWidth}×${actualHeight} (${isPortrait ? 'portrait' : 'landscape'})\n` +
                    `  Orientation mismatch: ${hasOrientationMismatch}`
                );

                onResolutionDetectedRef.current?.(usedResolution, {
                    width: actualWidth,
                    height: actualHeight,
                    isPortrait,
                    hasOrientationMismatch,
                });

                onStreamReadyRef.current?.(stream);
            } catch (error) {
                const err = error instanceof Error ? error : new Error('Failed to access webcam');
                onErrorRef.current?.(err);
            } finally {
                isStartingRef.current = false;
            }
        };

        startWebcam();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [deviceId, isDemoE2EAllow, maxResolution, videoRef]); // Re-run when deviceId or maxResolution changes

    return (
        isDemoE2EAllow ? (
            <canvas
                ref={videoRef as React.RefObject<HTMLCanvasElement>}
                className={`webcam-video ${className}`}
                data-testid="webcam-video"
            />
        ) : (
            <video
                ref={videoRef as React.RefObject<HTMLVideoElement>}
                className={`webcam-video ${className}`}
                data-testid="webcam-video"
                playsInline
                muted
            />
        )
    );
};
