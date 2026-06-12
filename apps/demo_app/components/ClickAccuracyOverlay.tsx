/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useEffect, useState } from 'react';

export interface ClickAccuracyLine {
    id: number;
    click: { x: number; y: number };
    gaze: { x: number; y: number };
    distance: number;
    sampleCount: number;
    sampleStdDev: number;
}

interface ClickAccuracyOverlayProps {
    lines: ClickAccuracyLine[];
}

export const ClickAccuracyOverlay: React.FC<ClickAccuracyOverlayProps> = ({ lines }) => {
    const [{ width, height }, setViewport] = useState(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
    }));

    useEffect(() => {
        const handleResize = () => {
            setViewport({ width: window.innerWidth, height: window.innerHeight });
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    if (lines.length === 0) {
        return null;
    }

    return (
        <svg
            className="click-lines-overlay"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
        >
            {lines.map((line) => {
                const midX = (line.click.x + line.gaze.x) / 2;
                const midY = (line.click.y + line.gaze.y) / 2;

                return (
                    <g key={line.id} className="click-line-group">
                        <line
                            className="click-line"
                            x1={line.click.x}
                            y1={line.click.y}
                            x2={line.gaze.x}
                            y2={line.gaze.y}
                        />
                        <circle className="click-point" cx={line.click.x} cy={line.click.y} r={6} />
                        <circle className="gaze-point" cx={line.gaze.x} cy={line.gaze.y} r={6} />
                        <text className="click-line-label" x={midX} y={midY - 8}>
                            {`${line.sampleCount} samples · ${Math.round(line.distance)} px`}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};
