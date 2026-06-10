# Demo Application

Interactive demo showcasing RealEye Webcam EyeTracker Light Open eye-tracker capabilities.

## Overview

This React-based web application demonstrates the RealEye Webcam EyeTracker Light Open library in action, providing an intuitive interface for calibration and real-time gaze tracking visualization.

## Main Features

- **Webcam Preview**: Real-time video feed with face detection visualization
- **17-Point Calibration Wizard**: Interactive calibration flow using the project default grid
- **Real-time Gaze Visualization**: Live gaze prediction overlay on screen
- **Gaze Trail Effect**: Animated trailing dots that visualize recent gaze movement
- **Technical Info Panel**: Collapsible panel showing webcam details, tracker configuration, and runtime metrics
- **Performance Metrics**: FPS counter, processing time, and sampling rate indicators
- **Click Accuracy Lines**: Visualize gaze vs. click distance with real-time error metrics
- **Background Color Controls**: Test tracking against different backgrounds (default, white, gray, black, random)
- **Webcam Selector**: Enumerate and switch between connected cameras with resolution presets
- **Session Stats**: Gaze prediction count and tracking duration counter
- **Calibration Quality Feedback**: Visual and numeric feedback during calibration process

## Technical Info Panel

The **Technical Info Panel** (`TrackerInfoPanel`) provides a collapsible view of three categories:

### Webcam
- **Resolution**: Native camera resolution from the video element
- **Frame Rate**: Camera FPS from MediaStream track settings
- **Device**: Selected camera device label

### Eye Tracker
- **State**: Current tracker state (Not Initialized, Ready, Calibrated, Error)
- **Inference**: GPU (WebGL) vs CPU (WASM)
- **Face Mode**: VIDEO (temporal tracking) vs IMAGE (frame-by-frame)
- **Detector**: Landmarker (478 points + iris) vs BlazeFace (6 keypoints)
- **Landmarks**: Whether geometric landmark features are enabled
- **Features**: Total feature vector dimensions sent to ridge regression
- **Calibration**: Number of calibration points (17-point grid)
- **Ridge λ**: Regularization parameter for ridge regression

### Runtime
- **Process Frame**: Average frame processing time (10s sliding window)
- **Sampling Rate**: Gaze prediction frequency during tracking (Hz)
- **Predictions**: Total gaze predictions since tracking started
- **Duration**: Time tracking has been active

## Non-Functional Requirements

- **Performance**: 30+ FPS on modern laptops with webcam access
- **Browser Compatibility**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Responsiveness**: Desktop-first design with mobile fallback. Mobile users see a compatibility warning banner. Touch-friendly controls and larger calibration targets on small screens.
- **Accessibility**: Keyboard navigation support for calibration flow

## Technology Stack

- **Framework**: React 18.2 with TypeScript 5.7
- **Build Tool**: Webpack 5 with hot module replacement
- **Eye-tracking Library**: RealEye Webcam EyeTracker Light Open (from `../../lib/`)
- **Face Detection**: MediaPipe Face Landmarker by default with BlazeFace fallback
- **Styling**: CSS modules with modern CSS features

## Architecture

### Component Structure

```
apps/demo_app/
├── index.html                    # HTML entry point
├── index.tsx                     # React app bootstrap
├── App.tsx                       # Main application component
├── components/
│   ├── CalibrationOverlay.tsx    # Calibration UI and flow control
│   ├── ClickAccuracyOverlay.tsx  # Click vs gaze accuracy lines
│   ├── FaceOverlay.tsx           # Face detection bounding box overlay
│   ├── GazeTrail.tsx             # Animated gaze trail effect
│   ├── GazeVisualization.tsx     # Real-time gaze point display
│   ├── Settings.tsx              # Inference device, mode, resolution settings
│   ├── TrackerInfoPanel.tsx      # Technical info panel (webcam, tracker, runtime)
│   ├── WebcamPreview.tsx         # Webcam video feed component
│   └── WebcamSelector.tsx        # Camera device selector
└── styles/
    └── main.css                  # Application styling
```

### Key Components

#### TrackerInfoPanel.tsx
- Collapsible panel with three info sections (Webcam, Eye Tracker, Runtime)
- Shows live metrics like processing time, sampling rate, prediction count
- Tooltip descriptions for each metric
- Responsive design with gradient header

#### GazeTrail.tsx
- Canvas-based animated trail following the gaze cursor
- Configurable trail length and dot size
- Smooth rendering with radial gradient glow effect
- Automatically clears when tracking stops

#### CalibrationOverlay.tsx
- Manages the default 17-point calibration sequence
- Displays calibration targets across corners, edges, center, and inner grid positions
- Captures webcam frames when user looks at each target
- Provides visual feedback and instructions

#### GazeVisualization.tsx
- Renders predicted gaze point as overlay dot
- Shows real-time tracking status
- Updates position at camera frame rate

#### WebcamPreview.tsx
- Accesses user's webcam via MediaStream API
- Displays video feed
- Optionally shows face detection bounding box
- Handles camera permissions and errors

### Application Flow

1. **Initialization**: Load tracker and MediaPipe models (no camera permission prompt yet)
2. **Explicit Camera Start**: User clicks **Start Camera** to begin webcam preview and trigger browser permission flow
3. **Calibration**: Guide user through the default 17-point calibration flow
4. **Tracking**: Continuously predict and visualize gaze position
5. **Re-calibration**: Allow user to recalibrate if accuracy degrades

## Running the Demo

```bash
# From project root
npm install
npm run dev
```

Opens at http://localhost:8089

### Development Mode

- Hot module replacement enabled
- Source maps for debugging
- React DevTools compatible

## Related Documentation

- [README.md](../../README.md) — API reference, technical architecture, and quick start
- [User Manual](../../USER_MANUAL.md) — step-by-step user guide for the demo app
- [Contributing Guide](../../CONTRIBUTING.md) — development setup and PR process
- [Security Policy](../../SECURITY.md) — privacy-first design and vulnerability reporting

## Integration with Library

The demo imports and uses the core library:

```typescript
import { WebcamETLight } from '../../lib';

const tracker = new WebcamETLight();
await tracker.initialize();

// Calibration
await tracker.calibrate(calibrationSamples);

// Prediction
const gaze = await tracker.predict(videoFrame);
```

## Testing

The deterministic demo browser suite lives in `../../tests/e2e/` and is the default Playwright gate:
- `demo.spec.ts` — smoke coverage and stable demo test API checks
- `camera-state.spec.ts` — virtual camera switching and face/no-face state coverage
- `camera-permissions.spec.ts` — denied and prompted permission handling
- `calibration-flow.spec.ts` — full 17-point calibration, tracking, and reset flows

In automated E2E mode the app boots through the RealCamera-based test installer and renders a dedicated deterministic harness so browser automation can validate the demo contract without depending on live webcam hardware.

## Future Enhancements

- Calibration quality scoring
- Export/import calibration data
- Multiple calibration profiles
- Accuracy validation mode

## Code Review Criteria

When reviewing changes in this app:

- Also follow the project-level criteria in [README.md](../../README.md).
- Review this demo as the primary integration surface for the `lib/` tracker, not as standalone sample UI.
- Preserve calibration flow, CSS-pixel gaze visualization, browser compatibility, and local-only processing guarantees together.

Required validation for review sign-off:

- Relevant library/demo tests for touched tracking or calibration behavior
- Demo smoke verification covering webcam startup, calibration, and live gaze rendering
- Documentation updates when user-visible flow, browser requirements, or integration expectations changed

High-risk regressions:

- demo behavior drifting from actual library contracts
- broken calibration state or inaccurate gaze visualization
- new network dependencies or privacy regressions in what should remain local processing
