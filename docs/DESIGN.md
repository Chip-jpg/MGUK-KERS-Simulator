# KERS Lab — Design spec (fix round 1, v0.7.0)

Owner: task **D1**. Scope: the visual contract for fixes F1–F10 of
[`FIX_ROUND_1.md`](./FIX_ROUND_1.md). Class names are frozen in §6.3 of that file; telemetry
colours in §6.4. Everything here is implemented with the tokens of
`src/styles/tokens.css` and the rules of `src/styles/components.css` / `src/styles/sim.css`.
Static mockups that load the real CSS are in [`design/`](../design/index.html) (append `#light`
to any mockup URL for the light theme).

Themes: **dark** (default) and **light**, chosen by `html[data-theme]`. There is no third theme
toggle. **Projector** = the light theme while the simulator is in fullscreen
(`.sim-layout--fullscreen`): larger readout and axis type, readout text ≥ 7:1 (AAA).

Contrast rules: every text pair ≥ 4,5:1 (AA), every non-text mark (bar fill, icon, marker,
outline) ≥ 3:1 (WCAG 1.4.11), projector readout text ≥ 7:1 (AAA). Nothing is conveyed by colour
alone: every state carries an icon and a word. Computed ratios are in §10.

## 1. New tokens

Declared in `src/styles/tokens.css`, in separate blocks after the palette blocks (the palette
blocks stay the 1:1 mirror of `src/ui/colors.ts`). `--q-heat` (dark `#ff9248`, light `#a8420a`)
is added by U1 together with `colors.ts`; D1 only documents it.

| Token                              | Value                           | Use                                          |
| ---------------------------------- | ------------------------------- | -------------------------------------------- |
| `--font-readout`                   | `var(--font-mono)`              | all live numbers (every glyph = 1ch)         |
| `--readout-font-size`              | `var(--fs-base)` (16 px)        | readout value size                           |
| `--readout-label-size`             | `var(--fs-xs)`                  | readout label                                |
| `--readout-line`                   | `1.5`                           | readout box height = 1,5 × font size         |
| `--readout-unit-chars`             | `5`                             | fixed unit column (`km/h`, `m/s²`)           |
| `--readout-label-min`              | `6rem`                          | min label column in `.readout-grid`          |
| `--readout-font-size-fs`           | `1.5rem` (24 px)                | fullscreen / projector readout               |
| `--readout-label-size-fs`          | `var(--fs-sm)`                  | fullscreen label                             |
| `--plot-axis-font-size`            | `12px`                          | uPlot axis font (read by `plot.ts`, see §11) |
| `--plot-axis-font-size-fs`         | `16px`                          | uPlot axis font in fullscreen                |
| `--fs-side-width`                  | `minmax(22rem, 30rem)`          | fullscreen side column                       |
| `--touch-min`                      | `44px`                          | minimum touch target                         |
| `--pedal-height` / `--pedal-width` | `10rem` / `4rem`                | pedal bar                                    |
| `--soc-bar-height`                 | `1.25rem`                       | SoC bar                                      |
| `--soc-low-threshold`              | `15%`                           | tick on the SoC bar                          |
| `--state-ok`                       | `var(--q-energy)`               | SoC fill, battery ok                         |
| `--state-low`                      | dark `#e3b341`, light `#7d5300` | SoC < 15 % (only new hex colour)             |
| `--state-empty`                    | `var(--color-danger)`           | SoC 0 %, "Batteria scarica"                  |
| `--mguk-deploy`                    | `var(--q-energy)`               | MGU-K deploy badge                           |
| `--mguk-harvest`                   | `var(--color-accent)`           | MGU-K harvest badge                          |
| `--mguk-idle`                      | `var(--color-text-muted)`       | MGU-K idle badge                             |
| `--pedal-throttle`                 | `var(--q-f)`                    | throttle fill (force → acceleration)         |
| `--pedal-brake`                    | `var(--color-danger)`           | brake fill                                   |

## 2. Fixed-grid readout (F4)

A readout is a box whose size depends only on its **specification** (label, unit, digits,
maxAbs), never on the current value. Required result: 0 px movement in
`e2e/readout-stability.spec.ts`.

```html
<div class="readout q-energy">
  <!-- .readout--na while value is null/NaN -->
  <span class="readout__label">Velocità</span>
  <span class="readout__value" style="--readout-chars: 5">312,4</span>
  <span class="readout__unit">km/h</span>
</div>
```

**Digit reserve rule** (computed once by `createValueReadout`, set as `--readout-chars`):

```
I     = integer digits of maxAbs rounded to `digits` decimals  (≥ 1)
chars = (signed ? 1 : 0)            sign "−" (U+2212)
      + I                            integer digits
      + floor((I − 1) / 3)           grouping dots "." (it-IT)
      + (digits > 0 ? 1 + digits : 0)  decimal comma + decimals
chars = max(chars, 4)               room for the placeholder "-,--"
```

Examples: v ≤ 400 km/h, 1 decimal → `400,0` = 5; a signed ≤ 60 m/s², 2 decimals → `−60,00` = 6;
I ≤ 9 999 A, 2 decimals → `9.999,99` = 8.

| Part       | Rule                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Box        | `height: 1em × --readout-line` (24 px; 36 px in fullscreen), `white-space: nowrap`, `overflow: hidden`                                                            |
| Value      | `width: calc(var(--readout-chars) * 1ch)`, `--font-readout` (monospace) + `font-variant-numeric: tabular-nums`, right-aligned, bold, colour `var(--q)` of the row |
| Unit       | own column, `--readout-unit-chars` × 1ch, muted, never part of the value text                                                                                     |
| Label      | left column, muted, ellipsis if too long (static text)                                                                                                            |
| Null / NaN | text `-,--`, class `.readout--na` (value muted, normal weight). Same box                                                                                          |
| Overflow   | never resizes; the text ends in "…" (`text-overflow: ellipsis`), which is a sizing bug to fix in maxAbs, not a state                                              |

**Grid.** `.readout-grid` = three columns _label · value · unit_; each `.readout` child spans
the row with `grid-template-columns: subgrid`, so values of different rows line up on their
right edge. Quantity colour as a 3 px left bar (`border-left: var(--q)`). A heading inside the
grid (`.readout-grid__title` or any non-readout child) spans all columns.

**Formula panel.** `.formula-row__number` uses the same box rule (`--readout-chars` set by
`formulaPanel.ts`); the unit goes in a sibling `.formula-row__unit` (static text), not in the
number text. `.formula-row__value` has a fixed minimum height so a KaTeX symbol never changes the
row height. Placeholder `-,--` instead of `—`.

**Plot legends.** uPlot `.u-value` cells get `min-width: 12ch` and the readout font, so the legend
never reflows while values change.

**HUD over the scene.** A HUD is a `.readout-grid` inside `layout.sceneOverlay`, pinned to a
fixed scene corner with `data-corner="tl|tr|bl|br"` (default `bl`; offsets `--space-3`;
surface at 92 % opacity). It is never positioned from its own content size. A number label that
follows a 3D object must anchor its **fixed** box (left or right edge at the projected point),
never `translate(-50%)` of a content-sized box. `tr` is reserved for the FPS counter.

Mockup: [`design/readouts.html`](../design/readouts.html).

## 3. Fullscreen (F5) and projector

Target: `layout.root` (`.sim-layout`). While active it carries `.sim-layout--fullscreen`;
`.sim-layout:fullscreen` is a fallback inside a forgiving `:is()`.

```
┌ toolbar (… Mostra formule · Esci da schermo intero (F)) ┐ ┌ side column (scrolls) ┐
│                                                          │ │ Parametri / pedali    │
│ scene: flex-grows to 100dvh − toolbar, sticky            │ │ Valori (readout-grid) │
│ HUD corners, FPS counter top-right                       │ │ Grafici (1 column)    │
│                                                          │ │ Modello semplificato  │
└──────────────────────────────────────────────────────────┘ └───────────────────────┘
```

- The root becomes `position: fixed; inset: 0` with `background: var(--color-bg)`: never the
  UA's black `::backdrop` (also themed: `::backdrop { background: var(--color-bg) }`).
- Grid `minmax(0,1fr) | --fs-side-width`; areas `main side / main plots / main note`. The root
  scrolls (`overflow-y: auto`); the main column is `position: sticky; top: 0` and exactly one
  viewport tall, so the scene stays put while controls, readouts and plots scroll beside it.
- Stage and scene flex-grow (`min-height: 16rem`); the Three.js stage resizes through its
  ResizeObserver. Plot grid becomes one column.
- Toolbar buttons are 44 px tall (`--touch-min`).
- Below 1100 px width: single column, scene 70dvh, then side, plots, note; the root scrolls.
- Type scale grows for everything inside: `--readout-font-size` → 24 px,
  `--readout-label-size` → 14 px, `--plot-axis-font-size` → 16 px, formula values → `--fs-lg`.
- **Projector (light + fullscreen)**: readout values, labels, units and formula numbers/units
  use `--color-text` (15,8:1 on surface, 14,8:1 on bg). The quantity colour stays as the 3 px
  left bar (non-text, ≥ 4,8:1). Dark fullscreen keeps quantity-coloured numbers (all ≥ 6,2:1).

**Fullscreen button** `.fs-button` (a `.btn btn--ghost` in the toolbar, after "Mostra formule"):
label "Schermo intero (F)" / "Esci da schermo intero (F)", `aria-pressed` mirrors the state and
fills it with the accent. Keys: `F` toggles, `Esc` exits (browser). Not `P`.

Mockup: [`design/fullscreen.html`](../design/fullscreen.html) (`#light` = projector).

## 4. Battery: SoC bar and state (F9)

```html
<div
  class="soc-bar soc-bar--low"
  role="meter"
  aria-label="Stato di carica"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow="9"
  style="--soc: 0.09"
>
  <span class="soc-bar__fill"></span>
  <!-- or style="width: 9%" -->
</div>
<span class="battery-state" data-state="low" role="status">Batteria quasi scarica</span>
```

| State   | Condition                                      | Bar                                     | Badge (icon + text)                            |
| ------- | ---------------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| `ok`    | SoC ≥ 15 % and not depleted                    | `--state-ok` (energy purple) solid      | ✓ "Batteria" + % (text at the caller's choice) |
| `low`   | 0 < SoC < 15 %                                 | `--state-low` amber + diagonal hatching | ⚠ "Batteria quasi scarica"                     |
| `empty` | `depleted` (SoC hit 0, until SoC ≥ restartSoc) | fill red, **dashed** red outline        | ✕ "**Batteria scarica**" (bold)                |

- Bar: full width, 1,25 rem tall, 1 px `--color-border-strong` outline on `--color-surface-2`
  track, tick at 15 % (`--soc-low-threshold`). Same size in every state (only colour, pattern
  and dash change). Fill width animates linearly over `--duration` (0 with reduced motion).
- Badge: `--color-text` on a 14 % tint of the state colour, 4 px left border and icon in the
  state colour. The icon comes from CSS (`::before`, text presentation), the Italian text from
  the DOM. Use `role="status"` so "Batteria scarica" is announced once when it appears.
- The SoC number next to the bar is a normal `.readout` (`q-energy`, 1 decimal, chars 5).

Mockup: [`design/battery.html`](../design/battery.html).

## 5. MGU-K state badge

`<span class="mguk-state" data-mode="deploy">Erogazione</span>`

| `data-mode` | Icon | Text (proposal)                 | Colour                               |
| ----------- | ---- | ------------------------------- | ------------------------------------ |
| `deploy`    | ▲    | "Erogazione" (battery → wheels) | `--mguk-deploy` = energy             |
| `harvest`   | ▼    | "Recupero" (wheels → battery)   | `--mguk-harvest` = accent            |
| `idle`      | ○    | "Inattivo"                      | `--mguk-idle` = muted, dashed border |

Pill, `min-width: 9.5rem` so the badge does not change size when the mode flips; text is
`--color-text` on a 14 % tint.

## 6. Pedals (drive-sim, F3)

```html
<div class="pedals" role="group" aria-label="Pedali">
  <div
    class="pedal pedal--brake"
    role="slider"
    tabindex="0"
    aria-label="Freno"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow="35"
    aria-valuetext="35 %"
    style="--pedal-value: 0.35"
    data-active="true"
  >
    <span class="pedal__label">Freno</span>
    <span class="pedal__value">35 %</span>
    <span class="pedal__keys"><kbd>↓</kbd> / <kbd>S</kbd></span>
  </div>
  <div class="pedal pedal--throttle" …>Gas … <kbd>↑</kbd> / <kbd>W</kbd></div>
</div>
```

- Brake left, throttle right (as in a car). Vertical analog bar 0–100 % filled from the bottom,
  drawn by CSS from `--pedal-value` (0–1) on `.pedal`; the component only updates that property
  and `aria-valuenow`.
- Size: whole pedal is the touch target, ≥ 64 × 200 px (`--pedal-width`, `--pedal-height`,
  never below `--touch-min`). `touch-action: none` (pointer events, no scroll while pressing).
- Colours: throttle `--q-f`, brake `--color-danger`, track `--color-surface-2`, outline
  `--color-border-strong`. Active (`data-active="true"` or `aria-pressed="true"`): border in the
  pedal colour. Focus: 3 px accent ring.
- Keyboard hints always visible under the bar: ↑/W gas, ↓/S freno (hold = 100 %, release = 0 %
  with the ramp chosen by S6).

Mockup: [`design/pedals.html`](../design/pedals.html).

## 7. Telemetry stack (F2)

`createCarTelemetryPlots` renders one `.telemetry` card spanning the plots grid
(`grid-column: 1 / -1`), with four `.telemetry__plot` rows separated by 1 px borders, in this
order and with a **shared x axis** (time [s], same window, synced cursor):

| #   | Plot                       | Series                        | Colour    | Line            |
| --- | -------------------------- | ----------------------------- | --------- | --------------- |
| 1   | v [km/h]                   | v                             | `neutral` | solid 2 px      |
| 2   | a [m/s²] (right axis in g) | a                             | `f`       | solid 2 px      |
| 3   | P [kW]                     | P MGU-K (+ deploy, − harvest) | `energy`  | solid 2 px      |
| 3   | P [kW]                     | P freni                       | `heat`    | dashed `[6, 4]` |
| 4   | SoC [%]                    | SoC                           | `energy`  | dotted `[2, 3]` |

- Only the bottom plot draws x tick labels and the "t [s]" label; the upper ones keep the grid.
- Titles: `--fs-xs`, bold, inside each row. Plot height ≈ 90 px each (≈ 70 px canvas); in
  fullscreen they sit in the side column at full column width.
- Events (`markEvent`): vertical dashed `--color-border-strong` line with a muted label.
- Plot 3 is the only one with two series: dash style differs, so it reads in greyscale too.

Mockup: [`design/telemetry.html`](../design/telemetry.html).

## 8. Transformer plots (F10, joule-transformer)

Layout (two columns ≥ 1100 px, stacked below; in fullscreen stacked in the side column):

- **Main plot** (left, 2fr): line loss fraction [%] vs transmission voltage V, **log x**
  100 V – 1 MV, loss curve in `heat`. Reference marks: dashed `--color-border-strong` lines at
  **380/220 V** and **10 kV**; shaded `--color-surface-2` bands for **20–132 kV** and
  **220–380 kV**; labels above in muted `--fs-xs`, values only (no slide numbers, D13).
  Operating point: accent filled circle r = 6 px with a 2 px `--color-bg` ring.
- **Linked plot** under it: current I [A] vs V, same x scale and domain, `q-i` line, same
  operating point marker on the same x; cursors synced.
- **Right column** (1fr): a `createSegmented` switch "Perdite vs R" / "Perdite vs P" above one
  plot (loss vs line resistance R, or vs transmitted power P; `heat` line, accent point);
  then a **low-vs-high voltage bar comparison** (two horizontal `heat` bars on the same scale,
  label · bar · readout value; a non-zero bar is never thinner than 2 px); caption
  "10× tensione → 100× meno perdite"; then the note as a `.callout`:
  **"Trasformatore ideale; nella realtà ci sono perdite nel nucleo."**

Mockup: [`design/transformer.html`](../design/transformer.html).

## 9. FPS counter (F7)

`.fps-counter`: monospace `--fs-xs`, fixed width 9ch (`"144 fps"` never reflows), solid
`--color-surface` background, 1 px `--color-border-strong` outline, `pointer-events: none`.
Inside the scene it is pinned top-right (`z-index` above canvas and labels). Hidden with the
`hidden` attribute; toggled by `` ` ``.

## 10. Contrast table (new pairs)

WCAG 2.x ratios, computed with `contrastRatio` of `src/ui/colors.ts`. "tint" = 14 % of the
state colour mixed into `--color-surface`.

| Pair                                                             | Kind / need    | Dark               | Light                     |
| ---------------------------------------------------------------- | -------------- | ------------------ | ------------------------- |
| `--state-low` on bg / surface / surface-2                        | text ≥ 4,5     | 9,71 / 8,89 / 7,83 | 6,34 / 6,75 / 5,79        |
| `--q-heat` on bg / surface / surface-2 (U1)                      | text ≥ 4,5     | 8,51 / 7,79 / 6,86 | 5,72 / 6,09 / 5,22        |
| badge text `--color-text` on ok (energy) tint                    | text ≥ 4,5     | 11,34              | 12,79                     |
| badge text on low tint                                           | text ≥ 4,5     | 11,17              | 12,83                     |
| badge text on empty (danger) tint                                | text ≥ 4,5     | 11,82              | 12,50                     |
| badge text on harvest (accent) tint                              | text ≥ 4,5     | 11,01              | 12,90                     |
| badge text on idle (muted) tint                                  | text ≥ 4,5     | 11,44              | 12,86                     |
| badge icon/border energy on its tint                             | non-text ≥ 3   | 6,01               | 5,23                      |
| badge icon/border low on its tint                                | non-text ≥ 3   | 6,78               | 5,48                      |
| badge icon/border danger on its tint                             | non-text ≥ 3   | 5,54               | 5,20                      |
| badge icon/border accent on its tint                             | non-text ≥ 3   | 7,20               | 4,68                      |
| badge icon/border muted on its tint                              | non-text ≥ 3   | 5,54               | 5,89                      |
| SoC fill energy on track surface-2                               | non-text ≥ 3   | 6,84               | 5,54                      |
| SoC fill low on surface-2                                        | non-text ≥ 3   | 7,83               | 5,79                      |
| SoC fill / outline danger on surface-2                           | non-text ≥ 3   | 6,04               | 5,64                      |
| 15 % tick border-strong on surface-2                             | non-text ≥ 3   | 3,32               | 3,20                      |
| pedal throttle `q-f` on surface-2                                | non-text ≥ 3   | 7,88               | 4,76                      |
| pedal brake danger on surface-2                                  | non-text ≥ 3   | 6,04               | 5,64                      |
| FPS / readout text on surface                                    | text ≥ 4,5     | 14,64              | 15,80                     |
| **Projector** readout `--color-text` on surface / bg / surface-2 | text ≥ 7 (AAA) | —                  | **15,80 / 14,84 / 13,55** |
| Projector quantity left bar (lowest: `q-f`) on surface           | non-text ≥ 3   | —                  | 5,55                      |
| Dark fullscreen quantity numbers on surface (lowest: `q-i`)      | text ≥ 4,5     | 6,23               | —                         |

The low-state hatching stripes (surface 45 % over amber; dark 3,16:1, light 2,17:1 against the
track) are texture, not the boundary: the solid amber parts carry the 5,79:1 edge.
`--color-text-muted` on light bg is 6,79:1, which is why projector readouts switch labels and
units to `--color-text`.

## 11. Notes and change requests

For **U1** (no frozen name changes):

1. `createValueReadout` sets `--readout-chars` with the §2 rule (including grouping dots and
   `max(…, 4)` for `-,--`); unit in `.readout__unit`, never inside the value text.
2. `formulaPanel.ts`: put the unit in a sibling `<span class="formula-row__unit">` (styled) and
   set `--readout-chars` on `.formula-row__number` from the item's `digits` and a max value;
   placeholder `-,--`.
3. `plot.ts`: read `--plot-axis-font-size` from `getComputedStyle(plot.element)` for the uPlot
   axis `font` at creation and again when the fullscreen controller fires `onChange`.
4. SoC bar: set `--soc` (0–1) on `.soc-bar` (or an inline `width` on the fill) and
   `aria-valuenow`; pedals: set `--pedal-value` (0–1) on `.pedal`.
5. `createCarTelemetryPlots`: x tick labels on the bottom plot only, synced cursor.
6. Fullscreen controller: toggle `.sim-layout--fullscreen` on `layout.root` even when the
   Fullscreen API is missing (CSS-only fullscreen works with the class alone).

For **sims** (S1–S6): HUD readouts go in `.readout-grid[data-corner]` inside
`layout.sceneOverlay`; existing `.kers-hud` / `.cd-hud` boxes should be replaced by them (or at
least use `.readout` children). Battery and MGU-K state use the §6.3 classes with the texts in
§4–§5. S4 builds §8 with `createSegmented`, `createPlot` (log x) and `.callout`; S6 builds §6.

## 12. Mockups

`design/index.html` lists them: `readouts.html`, `battery.html`, `pedals.html`,
`telemetry.html`, `transformer.html`, `fullscreen.html`. They are static (no build step) and
link `../src/styles/index.css`; open them through `npm run dev` at `/design/…`.
