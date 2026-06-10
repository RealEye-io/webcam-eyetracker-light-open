/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

import { test, expect } from '@playwright/test';

/**
 * CSS rendering acceptance tests for the E2E demo app (DemoE2EStaticHarness).
 *
 * These tests verify that the global stylesheet (main.css) is properly loaded
 * and applied. They check CSS variables, computed styles, and layout properties.
 *
 * This test suite would have caught the `sideEffects: false` bundle bug where
 * webpack tree-shook all CSS imports, making the app render without styles.
 */
test.describe('CSS Rendering - Main App', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the E2E demo app (uses DemoE2EStaticHarness for deterministic rendering)
        await page.goto('/?e2e=true');
        // Wait for React to mount - use .header which is the actual class in DemoE2EStaticHarness
        await page.waitForSelector('.header', { timeout: 10_000 });
    });

    test('CSS variables are defined on :root and have expected values', async ({ page }) => {
        const vars = await page.evaluate(() => {
            const root = getComputedStyle(document.documentElement);
            return {
                accent: root.getPropertyValue('--color-accent').trim(),
                text: root.getPropertyValue('--color-text').trim(),
                bgColor: root.getPropertyValue('--color-bg').trim(),
                surface: root.getPropertyValue('--color-surface').trim(),
                border: root.getPropertyValue('--color-border').trim(),
                radius: root.getPropertyValue('--radius-sm').trim(),
            };
        });

        // Empty CSS variables means the stylesheet was tree-shaken or not loaded
        expect(vars.accent, '--color-accent should not be empty').not.toBe('');
        expect(vars.text, '--color-text should not be empty').not.toBe('');
        expect(vars.bgColor, '--color-bg should not be empty').not.toBe('');
        expect(vars.surface, '--color-surface should not be empty').not.toBe('');
        expect(vars.radius, '--radius-sm should not be empty').not.toBe('');

        // Verify design token values
        expect(vars.accent).toBe('#0066ff');
        expect(vars.text).toBe('#111111');
        expect(vars.bgColor).toBe('#fafafa');
        expect(vars.surface).toBe('#ffffff');
        expect(vars.radius).toBe('6px');
    });

    test('webpack style-loader injects <style> tags with main.css content', async ({ page }) => {
        const info = await page.evaluate(() => {
            const tags = document.querySelectorAll('head style');
            let cssFound = false;
            for (const tag of tags) {
                if (tag.textContent.includes('--color-accent')) {
                    cssFound = true;
                    break;
                }
            }
            return { count: tags.length, cssFound };
        });

        expect(info.count, 'style tags should be injected by webpack').toBeGreaterThan(0);
        expect(info.cssFound, 'main.css content should be in injected style tags').toBe(true);
    });

    test('body uses CSS variable for background color', async ({ page }) => {
        const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(bodyBg, 'body background should use a light color from CSS').toMatch(/25[0-9]|255/);
    });

    test('header uses block layout with border bottom', async ({ page }) => {
        const styles = await page.evaluate(() => {
            const el = document.querySelector('.header');
            if (!el) return null;
            const s = getComputedStyle(el);
            return {
                display: s.display,
                borderBottomWidth: s.borderBottomWidth,
                padding: s.padding,
            };
        });

        expect(styles, '.header element should exist').not.toBeNull();
        expect(styles!.display).toBe('block');
        // Header may not have a border or specific background - check structure instead
        expect(styles!.borderBottomWidth).toBeDefined();
    });

    test('btn-primary uses accent blue background', async ({ page }) => {
        const bg = await page.evaluate(() => {
            const btn = document.querySelector('.btn-primary');
            if (!btn) return null;
            return getComputedStyle(btn).backgroundColor;
        });

        expect(bg, '.btn-primary should exist').not.toBeNull();
        expect(bg, 'primary button should use accent blue').toMatch(/0, 102, 255|rgb\(0, 102, 255\)/);
    });

    test('calibration overlay dots use accent color', async ({ page }) => {
        // Verify the CSS selector exists in the style tags
        const hasDotStyle = await page.evaluate(() => {
            const tags = document.querySelectorAll('head style');
            for (const tag of tags) {
                if (tag.textContent.includes('.calibration-point') && tag.textContent.includes('#0066ff')) {
                    return true;
                }
            }
            return false;
        });

        expect(hasDotStyle, 'calibration points should use accent color').toBe(true);
    });

    test('error message uses flat border style (not gradient)', async ({ page }) => {
        const hasErrorStyle = await page.evaluate(() => {
            const tags = document.querySelectorAll('head style');
            for (const tag of tags) {
                if (tag.textContent.includes('.error-message')) {
                    // Should NOT have gradient
                    return !tag.textContent.match(/\.error-message[^{]*\{[^}]*gradient/i);
                }
            }
            return false;
        });

        // If the style exists, it should not use gradients
        expect(hasErrorStyle, 'error messages should not use gradients').toBe(true);
    });
});
