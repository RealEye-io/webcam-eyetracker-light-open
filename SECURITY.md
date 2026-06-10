# Security Policy

## Privacy-First Design

RealEye Webcam EyeTracker Light Open is designed with privacy as a core principle:

- **All processing is local** — face detection, landmark extraction, feature computation, and gaze prediction happen entirely in your browser.
- **No data exfiltration** — no video frames, model parameters, predictions, or telemetry are sent to any external server.
- **Opt-in camera access** — the demo app requests camera permissions only after an explicit user click (the "Start Camera" button). The library itself does not auto-start cameras.
- **No network dependencies** — MediaPipe models are hosted locally; no CDN or remote model loading.

For more details, see the [User Manual](USER_MANUAL.md#frequently-asked-questions) FAQ section.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not open a public issue** — security reports should be handled privately.
2. **Email** — contact the maintainers at [contact@realeye.io](mailto:contact@realeye.io).
3. **Include** — a description of the vulnerability, steps to reproduce, and any suggested mitigations.
4. **Response time** — we aim to acknowledge reports within 48 hours and provide a fix within 14 days for critical issues.

## Security Considerations

### Camera Permissions

The library requires camera access via the browser's `MediaStream` API. Browsers enforce permission prompts before any camera data is accessible. The demo app defers this prompt until the user explicitly clicks **Start Camera**.

### Content Security Policy

The demo app sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers to enable shared memory for MediaPipe WASM execution. These headers are required for GPU/CPU inference and do not relax security — they isolate the browsing context.

### Dependencies

The library depends on:

- `@mediapipe/tasks-vision` — Google's MediaPipe vision tasks (face detection, landmarks).
- `ml-matrix` — matrix math operations for ridge regression.

Both are well-maintained, widely-used packages. Keep dependencies up to date by running `npm outdated` and reviewing updates.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ Yes    |
| < 1.0   | ❌ No     |
