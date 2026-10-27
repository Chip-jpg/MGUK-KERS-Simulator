# Decisions log

Architecture and process decisions. New entries are appended by the orchestrator
(agents propose them via change requests). Format: ID, date, decision, reason.

## D1 — Repository and app name (2026-10-27)

The project lives in the existing GitHub repository `Chip-jpg/MGUK-KERS-Simulator`.
Its **root plays the role of the `kers-lab/` folder** of the planned layout (there is
no nested `kers-lab/` directory). The app name stays **"KERS Lab"** (npm package
name `kers-lab`).

## D2 — Branching (2026-10-27)

Only the branch `claude/new-session-u560qi` is pushed to the remote. Per-task
`feat/<task-id>-<slug>` branches exist only locally (one git worktree per agent)
and are squash-merged by the orchestrator.

## D3 — Toolchain pins (2026-10-27)

Exact versions are pinned in `package.json` (no `^`), lockfile committed:

| Package                      | Version           | Note                                                                                                                                                                            |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vite                         | 5.4.21            | latest 5.x                                                                                                                                                                      |
| typescript                   | 5.9.3             | strict + `noUncheckedIndexedAccess`                                                                                                                                             |
| three / @types/three         | 0.169.0 / 0.169.0 | r169                                                                                                                                                                            |
| katex                        | 0.16.47           |                                                                                                                                                                                 |
| marked                       | 14.1.4            |                                                                                                                                                                                 |
| uplot                        | 1.6.32            |                                                                                                                                                                                 |
| vitest / @vitest/coverage-v8 | 2.1.9             | 2.x line is built on Vite 5 (same major as the app); Vitest 3 would also work but is not needed                                                                                 |
| @playwright/test             | 1.63.0            | matches the pre-installed Chromium build (`/opt/pw-browsers/chromium-1243`); set `PW_CHROMIUM_PATH` to use a specific executable, never run `playwright install` in the sandbox |
| eslint / typescript-eslint   | 9.39.5 / 8.72.1   | flat config, `eslint-config-prettier` 9                                                                                                                                         |
| prettier                     | 3.9.10            |                                                                                                                                                                                 |
| jsdom                        | 25.0.1            | dev only, per-file `// @vitest-environment jsdom`                                                                                                                               |

`npm audit` (2026-10-27) reports advisories in dev-only tooling of the Vite 5 /
Vitest 2 line (vite, esbuild dev server, vitest, tinypool). They do not ship in the
static production bundle; revisit when moving to Vite 6+ (stack change → needs
approval). The only runtime advisory is **katex 0.16.x, severity low**
(GHSA-238p-pmpm-9mq7: prototype pollution can bypass `trust` restrictions; fixed in
0.19, outside the pinned 0.16 line). Mitigation: KaTeX is only fed our own bundled
Markdown and the renderer must keep `trust: false` (the default).

## D4 — Simulator discovery via `import.meta.glob` (2026-10-27)

`src/core/registry.ts#loadSimModules` eagerly imports every `src/sims/*/index.ts`
and registers its default export. Sim agents therefore never edit a shared file to
add a simulator, which keeps file ownership disjoint. Lazy loading (code-splitting
Three.js per sim) can be introduced later by A3 without changing the `SimModule`
contract.

## D5 — Hash routing and in-page anchors (2026-10-27)

Routing is hash-based (`#/teoria/<id>`, `#/sim/<id>`, `#/interrogazione`, default
`#/teoria`) so GitHub Pages needs no rewrites. Consequence: in-page links must
**not** use `href="#something"` (that would change the route); use buttons +
`element.scrollIntoView()` / `focus()` instead (e.g. skip link, theory TOC).

## D6 — Type-level contract test for the physics API (2026-10-27)

`tests/physics/stubs.test.ts` uses `expectTypeOf(...).toEqualTypeOf<...>()`, so any
drift from the §4.2 signatures fails `npm run typecheck`. `Function.length` is not
used (TypeScript optional parameters still count towards it).

## D7 — Slide references not given by the spec (2026-10-27)

The §4.2 contract gives no slide number for `jouleLoss`, `lineLoss`,
`lorentzForce`, `kineticEnergyDelta`, `kersBrakingEvent`. The stubs use the closest
slide (16–17 energy balance, 20/22–23 transport) or state `@slide none` where the
deck has no matching slide (Lorentz force, kinetic energy). A1 confirms or corrects
these in `docs/PHYSICS.md`.
