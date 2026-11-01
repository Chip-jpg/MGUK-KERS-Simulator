# Simulator updates — v0.7.1

Use the existing dark/light quantity palette and strong foreground/background
contrast. Projector/presentation mode increases font size and line weight.

- Readouts reserve a fixed number area (14 characters) and separate unit column
  (5 rem). Fixed row height, tabular figures, fixed decimal count and `-,--`
  placeholder. Never change units with the instantaneous value. Scientific
  notation is allowed for overflow. Descriptions may wrap independently.
- Numeric scene sensors stay projected beside their physical components with
  fixed reserved dimensions. Changing digits never change size or placement;
  moving components and camera motion still move their attached labels.
- Fullscreen contains the complete simulator and scrolls vertically, preserving
  controls and chart access. F toggles fullscreen; P toggles larger presentation
  type. Renderer and uPlot use their existing ResizeObservers.
- Battery: labelled native progress bar, numeric percent, energy counters and
  explicit icon/text state; empty means no motor torque, restart at 5 %.
- Drive: independent large momentary throttle/brake buttons (mouse, touch,
  Space/Enter, W/S or arrows), gradual press/release, brake priority, always-visible state text and scenario/reset buttons.
- Telemetry: five linked scrolling charts (speed, signed acceleration in SI and
  g, signed MGU-K power, disc power, SoC), common seconds window. Use quantity
  colours and dashed redundancy. Values on differently scaled axes must not be
  superimposed without labelling.
- Transformer: logarithmic voltage axis (1–400 kV), separate unit plots for
  losses, percent and current, resistance/power views, comparison bars and
  labelled transport-chain reference values. Crosshair legends expose values.

Rendering has a fixed 200 FPS ceiling without a selector or persisted cap.
The optional FPS counter remains off by default. Drive controls use explicit
groups and consistent gaps; live reading labels and values occupy aligned columns.
