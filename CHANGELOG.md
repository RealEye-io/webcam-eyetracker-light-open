# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] — 2026-06-09

### 🎉 Initial Open Source Release

**Public v1.0.0 of RealEye Webcam EyeTracker Light Open — browser-based eye tracking with zero setup.**

#### ✨ Features

- **Pure browser eye tracking** — runs entirely client-side, no servers, no hardware
- **MediaPipe Face Landmarker** (with iris tracking) + BlazeFace fallback
- **Ridge regression gaze prediction** — 1,653 features: face coords + blendshapes + eye pixels
- **17-point calibration grid** — proven optimal pattern
- **Automatic head-pose compensation**
- **±1px calibration augmentation** (9× synthetic samples)
- **TypeScript-first** — full type definitions included
- **Local model hosting** — no CDN dependencies for MediaPipe
- **Mobile device warning banner** — non-desktop devices see a compatibility notice explaining the desktop-first experience
- **Improved mobile UX** — touch-friendly controls, larger calibration points, and full-width side panel behavior on small screens
- **Responsive layout** — two-column sidebar collapses to a single column on smaller screens
- **Tap feedback** — `hover: none` media query support for touch-only devices

#### 📦 Published on npm

- Package: `@realeye-io/webcam-eyetracker-light-open`
- License: dual-licensed under AGPL/commercial terms
- Supports: ESM + CJS, TypeScript + compiled JS

#### 🏗 Architecture

- `lib/` — Core tracker library (ridge regression, features, calibration)
- `apps/demo_app/` — Interactive React demo
- `tests/` — Unit (Vitest) + E2E (Playwright) suites

#### 📄 Documentation

- Merged README with full technical documentation
- CONTRIBUTING.md with development setup and guidelines
- API reference for all public exports
- Added device compatibility guidance for desktop-first usage
- Added dual-license documentation and third-party notices for MediaPipe assets and direct dependencies

#### ♻️ Refactoring

- Extracted inline layout styles in `App.tsx` to CSS classes for media query targeting

#### 🧪 Testing

- Matrix math unit tests
- Feature extraction unit tests
- Calibration pattern tests
- E2E browser tests with virtual cameras
- Accuracy validation suite (with reference data service)
