/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useEffect, useRef } from 'react';
import type { FaceDetectionResult } from '@lib/types';

interface FaceOverlayProps {
    videoRef: React.RefObject<HTMLVideoElement | HTMLCanvasElement>;
    detection: FaceDetectionResult | null;
    visible: boolean;
}

/**
 * Overlay component that draws a bounding box around the detected face.
 * Positioned absolutely over the video element.
 */
export const FaceOverlay: React.FC<FaceOverlayProps> = ({
    videoRef,
    detection,
    visible,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const detectionRef = useRef<FaceDetectionResult | null>(null);
    const visibleRef = useRef(visible);

    // Keep refs in sync with props for use in animation frame
    detectionRef.current = detection;
    visibleRef.current = visible;

    useEffect(() => {
        const element = videoRef.current;
        const canvas = canvasRef.current;
        if (!element || !canvas) return;

        let animationId: number;

        const draw = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                animationId = requestAnimationFrame(draw);
                return;
            }

            // Match canvas size to element display size
            const rect = element.getBoundingClientRect();
            if (canvas.width !== rect.width || canvas.height !== rect.height) {
                canvas.width = rect.width;
                canvas.height = rect.height;
            }

            // Clear previous drawing
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const currentDetection = detectionRef.current;
            const currentVisible = visibleRef.current;

            // Get actual dimensions - works for both video and canvas
            const actualWidth = element instanceof HTMLVideoElement ? element.videoWidth : element.width;
            const actualHeight = element instanceof HTMLVideoElement ? element.videoHeight : element.height;

            if (!currentVisible || !currentDetection || actualWidth === 0) {
                animationId = requestAnimationFrame(draw);
                return;
            }

            // Calculate the actual displayed area accounting for object-fit: cover
            // object-fit: cover scales the video to fill the container while maintaining aspect ratio,
            // then crops the overflow. We need to calculate the offset and scale to map
            // video coordinates to the visible display area.
            const videoAspect = actualWidth / actualHeight;
            const containerAspect = rect.width / rect.height;

            let scale: number;
            let offsetX = 0;
            let offsetY = 0;

            if (videoAspect > containerAspect) {
                // Video is wider than container - will be cropped horizontally
                scale = rect.height / actualHeight;
                const scaledVideoWidth = actualWidth * scale;
                offsetX = (scaledVideoWidth - rect.width) / 2;
            } else {
                // Video is taller than container - will be cropped vertically
                scale = rect.width / actualWidth;
                const scaledVideoHeight = actualHeight * scale;
                offsetY = (scaledVideoHeight - rect.height) / 2;
            }

            const { boundingBox } = currentDetection;

            // The video is mirrored via CSS scaleX(-1), so we need to flip the x coordinate.
            // First scale the coordinates, then apply the mirror transformation relative to the canvas center.
            const scaledX = boundingBox.x * scale - offsetX;
            const scaledY = boundingBox.y * scale - offsetY;
            const scaledWidth = boundingBox.width * scale;
            const scaledHeight = boundingBox.height * scale;

            // Mirror X: flip around the center of the canvas
            const x = rect.width - scaledX - scaledWidth;
            const y = scaledY;
            const width = scaledWidth;
            const height = scaledHeight;

            // Draw bounding box
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);

            // Draw keypoints if available
            if (currentDetection.keypoints && currentDetection.keypoints.length > 0) {
                ctx.fillStyle = '#ff0000';
                for (const kp of currentDetection.keypoints) {
                    // Scale and offset first, then mirror
                    const scaledKpX = kp.x * scale - offsetX;
                    const scaledKpY = kp.y * scale - offsetY;
                    // Mirror X around canvas center
                    const kpX = rect.width - scaledKpX;
                    const kpY = scaledKpY;
                    ctx.beginPath();
                    ctx.arc(kpX, kpY, 4, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }

            // Draw label with confidence
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 14px sans-serif';
            const label = `Face ${Math.round(currentDetection.confidence * 100)}%`;
            const textMetrics = ctx.measureText(label);
            ctx.fillRect(x, y - 22, textMetrics.width + 10, 20);
            ctx.fillStyle = '#000';
            ctx.fillText(label, x + 5, y - 7);

            animationId = requestAnimationFrame(draw);
        };

        animationId = requestAnimationFrame(draw);

        return () => {
            cancelAnimationFrame(animationId);
        };
    }, [videoRef]);

    return (
        <canvas
            ref={canvasRef}
            className="face-overlay"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        />
    );
};
