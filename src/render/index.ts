/**
 * Render foundation (D14, docs/ARCHITECTURE.md §10). Sims import from here:
 * `import { createStage, createFieldLines, … } from '../../render';`
 * The app shell must NOT import this barrel (Three.js would enter the initial
 * bundle); it imports `./quality` directly.
 */
export * from './quality';
export * from './stage';
export * from './materials';
export * from './fieldLines';
export * from './trace';
export * from './currentFlow';
export * from './heat';
export * from './energyRibbon';
export * from './labels';
export * from './stats';
export * from './viewButton';
export * from './geometry';
export * from './scale';
export { radialFade, studioBackgroundColor } from './textures';
