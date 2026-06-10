/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React from 'react';

const GAZE_OVERLAY_STYLE: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: 999,
    overflow: 'hidden',
};

const GAZE_DOT_BASE_STYLE: React.CSSProperties = {
    position: 'fixed',
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    transition: 'transform 0.2s ease-out',
    willChange: 'transform',
    backfaceVisibility: 'hidden',
};

// Motion blur ghosts - staggered delays create a tail effect
const GHOST_STYLES: React.CSSProperties[] = [
    {
        position: 'fixed',
        width: '45px',
        height: '45px',
        borderRadius: '50%',
        transition: 'transform 1s ease-out',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        pointerEvents: 'none',
        opacity: 0.4,
    },
    {
        position: 'fixed',
        width: '55px',
        height: '55px',
        borderRadius: '50%',
        transition: 'transform 0.65s ease-out',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        pointerEvents: 'none',
        opacity: 0.25,
    },
    {
        position: 'fixed',
        width: '70px',
        height: '70px',
        borderRadius: '50%',
        transition: 'transform 0.35s ease-out',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        pointerEvents: 'none',
        opacity: 0.15,
    },
];

interface GazeVisualizationProps {
    x: number | null;
    y: number | null;
    noFace?: boolean;
    visible?: boolean;
}

export const GazeVisualization: React.FC<GazeVisualizationProps> = ({
    x,
    y,
    noFace = false,
    visible = true,
}) => {
    if (!visible || x === null || y === null) {
        return null;
    }

    // Calculate transform once instead of setting left/top on each element
    const transform = `translate(${x}px, ${y}px) translate(-50%, -50%) translateZ(0)`;

    return (
        <div className="gaze-overlay" style={GAZE_OVERLAY_STYLE}>
            {/* Motion blur ghosts - staggered delays create a tail effect */}
            {GHOST_STYLES.map((style, i) => (
                <div
                    key={`ghost-${i}`}
                    className={`gaze-ghost gaze-ghost-${i} ${noFace ? 'no-face' : ''}`}
                    style={{
                        ...style,
                        transform,
                    }}
                />
            ))}
            {/* Outer accuracy ring */}
            <div
                className={`gaze-dot-outer ${noFace ? 'no-face' : ''}`}
                style={{
                    position: 'fixed',
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    border: noFace ? '2px solid rgba(239, 68, 68, 0.6)' : '2px solid rgba(0, 102, 255, 0.3)',
                    transition: 'transform 0.2s ease-out',
                    willChange: 'transform',
                    backfaceVisibility: 'hidden',
                    transform,
                    top: 0,
                    left: 0,
                }}
            />
            {/* Inner gaze dot */}
            <div
                className={`gaze-dot ${noFace ? 'no-face' : ''}`}
                data-testid="gaze-dot"
                data-no-face={noFace ? 'true' : 'false'}
                style={{
                    ...GAZE_DOT_BASE_STYLE,
                    backgroundColor: noFace ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 102, 255, 0.5)',
                    border: noFace ? '3px solid #ef4444' : '3px solid #0066ff',
                    boxShadow: noFace
                        ? '0 0 12px rgba(239, 68, 68, 0.3)'
                        : '0 0 12px rgba(0, 102, 255, 0.4)',
                    transform,
                    top: 0,
                    left: 0,
                }}
            />
        </div>
    );
};
