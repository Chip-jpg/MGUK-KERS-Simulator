/**
 * UI kit for simulators (see docs/ARCHITECTURE.md § "UI kit").
 * Sims import from here: `import { createSimLayout, createSlider, … } from '../../ui';`
 * The app shell must NOT import this barrel (it would pull uPlot into the
 * initial bundle); it imports the individual files it needs.
 */
export * from './colors';
export * from './chips';
export * from './controls';
export * from './dom';
export * from './formulaPanel';
export * from './math';
export * from './plot';
export * from './ringBuffer';
export * from './simLayout';
export * from './slider';
export * from './toolbar';
export { formatIT } from '../core/format';
export { createLoop, type Loop } from '../core/loop';
export { onThemeChange, currentTheme } from '../core/theme';
