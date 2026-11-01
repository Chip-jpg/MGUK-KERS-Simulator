/**
 * UI kit for simulators (see docs/ARCHITECTURE.md § "UI kit").
 * Sims import from here: `import { createSimLayout, createSlider, … } from '../../ui';`
 * The app shell must NOT import this barrel (it would pull uPlot into the
 * initial bundle); it imports the individual files it needs.
 */
export * from './carTelemetryPlots';
export * from './colors';
export * from './controls';
export * from './dom';
export * from './formulaPanel';
export * from './fpsCounter';
export * from './fullscreen';
export * from './math';
export * from './plot';
export * from './plotScale';
export * from './ringBuffer';
export * from './simLayout';
export * from './slider';
export * from './toolbar';
export * from './valueReadout';
export { formatIT } from '../core/format';
export { createLoop, onLoopFrame, type Loop, type LoopOptions } from '../core/loop';
export { getFpsLimit, onFpsLimitChange, type FpsLimit } from '../core/settings';
export { onThemeChange, currentTheme } from '../core/theme';
