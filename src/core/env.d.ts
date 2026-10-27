/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * `'true'` only in the Playwright build: use `tests/fixtures/theory/*.md` when
   * `content/theory/` is empty (see src/theory/content.ts).
   */
  readonly VITE_THEORY_FIXTURES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
