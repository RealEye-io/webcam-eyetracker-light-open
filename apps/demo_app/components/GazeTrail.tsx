/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useEffect, useRef } from 'react';

interface GazePoint {
    x: number;
    y: number;
}

interface GazeTrailProps {
    /** Current gaze position. Set to null to hide. */
    gaze: GazePoint | null;
    /** Number of trail points to render. Default 20. */
    trailLength?: number;
    /** Size of the main gaze dot in px. Default 16. */
    dotSize?: number;
    /** Whether the trail is actively visible (e.g. during tracking). */
    visible?: boolean;
}

const TRAIL_INTERVAL_MS = 32; // ~30 Hz sampling for trail

export const GazeTrail: React.FC<GazeTrailProps> = ({
    gaze,
    trailLength = 20,
    dotSize = 16,
    visible = true,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const trailRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
    const lastAddRef = useRef(0);

    useEffect(() => {
        if (!gaze || !visible) return;

        const now = performance.now();
        if (now - lastAddRef.current < TRAIL_INTERVAL_MS) return;
        lastAddRef.current = now;

        trailRef.current.push({ x: gaze.x, y: gaze.y, t: now });

        // Keep only the most recent points
        const cutoff = now - trailLength * TRAIL_INTERVAL_MS;
        trailRef.current = trailRef.current.filter((p) => p.t > cutoff);
    }, [gaze, trailLength, visible]);

    // Render the trail on canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Performance: mark canvas for GPU compositing
        canvas.style.willChange = 'transform';
        canvas.style.transform = 'translateZ(0)';

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const trail = trailRef.current;
        const len = trail.length;

        if (len === 0) return;

        // Draw trail segments
        for (let i = 1; i < len; i++) {
            const ratio = i / len; // 0->1, newer = higher ratio
            const alpha = ratio * 0.6;
            const size = dotSize * ratio * 0.5;

            ctx.beginPath();
            ctx.arc(trail[i].x, trail[i].y, Math.max(size, 2), 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(0, 102, 255, ${alpha})`;
            ctx.fill();
        }

        // Draw the latest gaze point as a bright dot
        const latest = trail[len - 1];
        // Outer glow
        const gradient = ctx.createRadialGradient(
            latest.x, latest.y, 0,
            latest.x, latest.y, dotSize * 1.5
        );
        gradient.addColorStop(0, 'rgba(0, 102, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(0, 102, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 102, 255, 0)');
        ctx.beginPath();
        ctx.arc(latest.x, latest.y, dotSize * 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Inner dot
        ctx.beginPath();
        ctx.arc(latest.x, latest.y, dotSize * 0.4, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 102, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }, [trailRef, dotSize]);

    // Resize handler
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Clear trail when not visible
    useEffect(() => {
        if (!visible) {
            trailRef.current = [];
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [visible]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: 999,
            }}
        />
    );
};
