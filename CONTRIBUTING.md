# Contributing to RealEye Webcam EyeTracker Light Open

Thank you for contributing to **@realeye-io/webcam-eyetracker-light-open**!

This guide covers how to set up the development environment, run tests, and submit pull requests.

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Adding New Features](#adding-new-features)

## 📖 Project Overview

RealEye Webcam EyeTracker Light Open is a pure-TypeScript, browser-based webcam eye-tracker. Key constraints:

- **Library in `lib/`** — Core eye-tracking code (no external eye-tracking libraries)
- **Demo in `apps/demo_app/`** — React app showcasing the library ([demo docs](apps/demo_app/demo_app.md))
- **Tests in `tests/`** — Unit (Vitest), E2E (Playwright)
- **No server required** — Everything runs client-side, no CDN, no WebGazer

For a high-level overview, see the [README.md](README.md). For user-facing documentation, see the [User Manual](USER_MANUAL.md).

## ⚖️ Contribution Licensing

This repository is dual-licensed under the terms described in `LICENSE`, `LICENSE-AGPL.md`, and `LICENSE-COMMERCIAL.md`.

By submitting a pull request, patch, or other contribution to this repository, you represent that you have the right to contribute that material and you agree that the maintainers may distribute your contribution as part of this project under:

- the GNU Affero General Public License, version 3 or later; and
- the repository's commercial license terms.

If you are contributing on behalf of an employer, client, university, or other organization, make sure you have the authority to agree to those terms before submitting.

## 🛠 Development Setup

```bash
# Clone & install
git clone https://github.com/RealEye-io/webcam-eyetracker-light-open.git
cd webcam-eyetracker-light-open
npm install

# Start the demo (hot-reload)
npm run dev

# Build library + demo
npm run build
```

### Requirements

- **Node.js** ≥ 18.0.0
- **npm** ≥ 7 (for optional workspaces)
- Optional: **Git LFS** for model files

## 📏 Coding Standards

- **TypeScript strict mode** — No `any`, proper type inference
- **ESLint** (`npm run lint`) — Run before every PR
- **No redundant comments** — Code should be self-documenting
- **Accuracy-affecting changes** must include updated tests

### Project-Specific Rules

- No external eye-tracking libraries (WebGazer, GazePointer, ...)
- No CDN-hosted MediaPipe models — all models must ship locally
- Preserve library contract: `predict() → null` on failed face detection
- Coordinate system: `{ x, y }` in CSS pixels, origin top-left

### File Size

- Aim for **≤ 300 lines per file** where practical
- Split logic across modules: `lib/calibration/`, `lib/math/`, etc.

## 🧪 Testing

```bash
# Quick validation
npm test               # Unit tests + demo E2E gate + CSS rendering

# Individual test suites
npm run test:unit      # Vitest (matrix math, features)
npm run test:e2e       # Playwright E2E (virtual camera)
npm run test:css       # CSS rendering tests
npm run test:screenshot # Screenshot capture tests
npm run test:watch     # Watch mode for unit tests
```

### Code Quality

```bash
npm run lint           # ESLint (lib, apps, tests)
npm run lint:fix       # ESLint with auto-fix
npm run typecheck      # TypeScript type checking (no emit)
```

### Building

```bash
npm run build          # Build library + demo
npm run build:lib      # Compile library only (for npm publish)
npm run build:demo     # Production demo build
```

### Updating Screenshots

The demo app includes screenshot fixtures in `public/screenshots/`. To regenerate:

```bash
node scripts/capture-screenshots.mjs
```

See [public/models/README.md](public/models/README.md) for model file management.

### When Accuracy Might Be Affected

If your PR changes calibration, features, or prediction paths:
- Re-run `npm run test:unit`
- If you have access to reference data, run `npm run test:accuracy`

### Calibration Updates

The project currently uses a single 17-point calibration flow.

If your PR changes calibration behavior:

1. Update `lib/calibration/CalibrationPatterns.ts`
2. Update `tests/unit/calibration-patterns.test.ts`
3. Update calibration documentation in `README.md` and `USER_MANUAL.md`

## 🚀 Pull Request Process

1. **Create a feature branch** from `main`
2. **Make changes** following coding standards
3. **Run lint & tests**:
   ```bash
   npm run lint
   npm test
   ```
4. **Open a PR** with:
   - Summary of changes (accuracy impact included, if applicable)
   - Screenshots or data for accuracy-affecting PRs
   - Links to relevant issues or discussions
   - Confirmation that you are able to contribute under the repository's dual-license model

**We require PRs to pass:**
- ✅ `npm run lint`
- ✅ `npm run build:lib`
- ✅ `npm test`

## 🤝 Code of Conduct

We follow a respectful, collaborative approach. Report any concerns to the maintainers.

## 🔒 Security

If you discover a security vulnerability, please follow our [Security Policy](SECURITY.md) and report it privately. Do not open a public issue.

---

*Questions? Open an [issue](https://github.com/RealEye-io/webcam-eyetracker-light-open/issues) or join the discussion!*
