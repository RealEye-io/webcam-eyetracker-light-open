# Third-Party Notices

This project includes or depends on third-party software and model artifacts that are licensed separately from the project itself.

## Runtime Dependencies

| Component | License | Notes |
| --- | --- | --- |
| `@mediapipe/tasks-vision` | Apache-2.0 | Face detection and face landmarking runtime |
| `ml-matrix` | MIT | Matrix utilities used by the regression implementation |

## Development and Build Dependencies

The direct development dependencies declared in `package.json` are permissively licensed (MIT or Apache-2.0 at the time of writing), including React, Webpack, TypeScript, Vitest, Playwright, ESLint, and related tooling.

## MediaPipe Model Files

The local model files in `public/models/` are downloaded from Google's MediaPipe model distribution endpoints and remain subject to the Apache License 2.0.

| File | Upstream Source |
| --- | --- |
| `public/models/blaze_face_short_range.tflite` | https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite |
| `public/models/face_landmarker.task` | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task |

## Attribution Reminder

When redistributing this project, preserve this notice file together with the applicable upstream license notices for Apache-2.0 and MIT components.
