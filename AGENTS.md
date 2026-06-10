# RealEye Webcam EyeTracker Light Open - AI Agent Instructions

Version 1.0.0

This `AGENTS.md` contains the project-level rules for the RealEye Webcam EyeTracker Light Open repository.
Project documentation lives in `README.md` and app docs under `apps/<app_name>_app/<app_name>_app.md`.

## Mandatory Reading
- Read `README.md` before making changes.
- Read the relevant app doc for app-specific work.

## Documentation Rules
- This is a multi-app project with a core library and applications.
- `README.md` contains domain knowledge, architecture, and global logic.
- Each application has an `apps/<app_name>_app/<app_name>_app.md` file.
- Core eye-tracker library lives in top-level `lib/`.
- Applications import from `../../lib/` and live in `apps/<app_name>_app/`.
- Keep docs current and avoid duplicating implementation details.

## Code Quality
- Aim for max 300 lines per file where practical.
- Use TypeScript strict mode.
- Enforce ESLint for linting.
- Avoid redundant comments and commit noise.
- Completion gate: do not mark work complete until automated tests have run and passed (build, lint, unit, integration/E2E). Report results.

## Implementation Constraints
- No external eye-tracking libraries (e.g., WebGazer).
- Use `@mediapipe/tasks-vision` for face detection only.
- Implement ridge regression and matrix math from scratch in TypeScript.
- Host MediaPipe model files locally (not CDN).

## Testing Requirements
- Unit tests for matrix math and feature extraction.
- E2E tests using Playwright with virtual cameras.
- Default gate: `npm test` runs unit + demo E2E.
- Accuracy/integration tests may require an external reference data service.

## Error Handling
- If face is not detected, return `null` from `predict()` (no fallback gaze position).
- Provide clear error messages for calibration failures.
- Handle async operations with proper try/catch.

## Coordinate System
- All gaze coordinates are in CSS pixels.
- Origin: top-left corner of screen/viewport.
- X increases rightward; Y increases downward.

## Running Tests

Unit tests:
```
npm run test:unit
```

Deterministic demo E2E gate:
```
npm run test:e2e
```

Default local validation:
```
npm test
```

Lint:
```
npm run lint
```

Build:
```
npm run build
```
