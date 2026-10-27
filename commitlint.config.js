// Conventional Commits for KERS Lab (see CONTRIBUTING.md).
// Scopes are free-form (e.g. `sim/faraday`, `physics`, `theory`, `ci`).
/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow long body/footer lines (co-author trailers, URLs).
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    // Subjects may start with acronyms or proper names (MGU-K, RL, Lenz, KaTeX).
    'subject-case': [0],
  },
};
