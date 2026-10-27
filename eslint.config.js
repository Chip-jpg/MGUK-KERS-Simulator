// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Modules that must never be imported from `src/physics/**`.
 * Physics is pure TypeScript: no DOM, no rendering, no app layers.
 */
const PHYSICS_FORBIDDEN_IMPORTS = {
  paths: [
    { name: 'three', message: 'src/physics must be pure: no Three.js.' },
    { name: 'uplot', message: 'src/physics must be pure: no plotting.' },
    { name: 'katex', message: 'src/physics must be pure: no rendering.' },
    { name: 'marked', message: 'src/physics must be pure: no rendering.' },
  ],
  patterns: [
    { group: ['three/*', 'uplot/*', 'katex/*', 'marked/*'], message: 'src/physics must be pure.' },
    {
      group: [
        '**/core',
        '**/core/*',
        '**/ui',
        '**/ui/*',
        '**/sims',
        '**/sims/*',
        '**/theory',
        '**/theory/*',
        '**/quiz',
        '**/quiz/*',
      ],
      message: 'src/physics must not depend on app layers (core/ui/sims/theory/quiz).',
    },
  ],
};

const PHYSICS_FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'Date',
  'performance',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'setTimeout',
  'setInterval',
  'process',
].map((name) => ({
  name,
  message: `src/physics must be pure and deterministic: '${name}' is not allowed.`,
}));

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['*.config.{js,ts}', 'eslint.config.js', 'tests/**', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Physics purity rule (§4.1): no DOM, no Three/uPlot/KaTeX/marked, no clocks.
    files: ['src/physics/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': ['error', PHYSICS_FORBIDDEN_IMPORTS],
      'no-restricted-globals': ['error', ...PHYSICS_FORBIDDEN_GLOBALS],
    },
  },
  prettier,
);
