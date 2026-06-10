# MediaPipe Models

This directory contains MediaPipe model files that are hosted locally for faster loading.

## Licensing Notice

The MediaPipe runtime package and the model files downloaded into this directory are third-party materials and remain subject to the **Apache License 2.0**.

- MediaPipe tasks runtime: `@mediapipe/tasks-vision`
- BlazeFace model file: Apache-2.0
- Face Landmarker bundled model file: Apache-2.0

See `../../THIRD_PARTY_NOTICES.md` for the project-level notice summary.

## Quick Setup

Models are downloaded automatically after `npm install` via the `postinstall` hook.

To download them manually:

```bash
npm run download-models
```

## Required Models

### BlazeFace Short Range

Download the BlazeFace short-range model from MediaPipe:

```bash
# Download the model file
curl -L -o blaze_face_short_range.tflite \
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
```

Or manually download from:
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite

### Face Landmarker

Download the Face Landmarker bundled model from MediaPipe:

```bash
# Download the model file
curl -L -o face_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
```

Or manually download from:
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

## Model Details

### BlazeFace Short Range
- **Name**: BlazeFace short-range
- **Size**: ~200KB
- **Input**: 128×128 pixels
- **Optimized for**: Front-facing webcam at short range (<2m)
- **Output**: Face bounding boxes + 6 keypoints (eyes, nose, mouth, ear tragions)

### Face Landmarker
- **Name**: Face Landmarker (bundled)
- **Size**: ~21MB
- **Contains**: FaceDetector + FaceMesh-V2 + Blendshape models
- **Input**: 192×192 (detector), 256×256 (mesh)
- **Output**: 478 3D face landmarks + 52 blendshape scores
  - The library extracts **22 gaze-relevant blendshapes** (defined in the `FaceBlendshapes` interface in `lib/types.ts`). The remaining 30 blendshapes are not used for gaze prediction.

## WASM Runtime

The MediaPipe Face Landmarker requires WebAssembly (WASM) runtime files for CPU inference. These are shipped with `@mediapipe/tasks-vision` and automatically copied to `dist/wasm/` by Webpack during the build. No manual download is needed.

- **Location in source**: `node_modules/@mediapipe/tasks-vision/wasm`
- **Location after build**: `dist/wasm/`
- **Configured via**: `wasmPath` in `WebcamETLightConfig` (default: `/wasm`)

> **Note:** WASM files are only required when using CPU inference (`delegate: 'CPU'`). GPU mode (`delegate: 'GPU'`) uses WebGL shaders instead.

## Related Documentation

- [README.md](../../README.md) — API reference and technical architecture
- [Security Policy](../../SECURITY.md) — privacy-first design details
- [Third-Party Notices](../../THIRD_PARTY_NOTICES.md) — dependency and model attributions
