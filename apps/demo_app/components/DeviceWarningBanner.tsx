/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import React, { useState, useEffect } from 'react';

const MOBILE_WARNING_STORAGE_KEY = 'webcam-et-mobile-warning-dismissed';

function isMobileDevice(): boolean {
    // Combined detection: screen width AND touch AND mobile UA keyword (AND logic — conservative)
    const smallScreen = window.innerWidth <= 768;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );

    return smallScreen && hasTouch && mobileUA;
}

function getDismissed(): boolean {
    try {
        return localStorage.getItem(MOBILE_WARNING_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

function setDismissed(): void {
    try {
        localStorage.setItem(MOBILE_WARNING_STORAGE_KEY, 'true');
    } catch {
        // Storage may be unavailable (e.g. private browsing)
    }
}

export const DeviceWarningBanner: React.FC = () => {
    const [visible, setVisible] = useState(() => !getDismissed());

    // Re-check on mount in case detection changed (e.g. window resize during SPA nav)
    useEffect(() => {
        if (!isMobileDevice()) {
            setVisible(false);
        }
    }, []);

    const handleDismiss = () => {
        setVisible(false);
        setDismissed();
    };

    if (!visible) {
        return null;
    }

    return (
        <div className="device-warning-banner" role="alert">
            <div className="device-warning-icon" aria-hidden="true">
                ⚠️
            </div>
            <div className="device-warning-content">
                <strong>Desktop device recommended</strong>
                <p>
                    This eye-tracker demo works best on desktop or laptop computers with a fixed webcam.
                    Mobile devices are not optimized — calibration requires clicking small targets across
                    the screen, and accuracy will be significantly reduced.
                </p>
            </div>
            <button className="device-warning-dismiss" onClick={handleDismiss}>
                Got it
            </button>
        </div>
    );
};
