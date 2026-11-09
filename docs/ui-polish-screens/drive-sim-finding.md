# Item 4: blank 3D canvas on drive-sim

**Verdict: not reproducible; no code bug found; no code change, no commit.**

## Code review

- `src/sims/shared/drive.ts:262` mounts the scene via async `import('./car/scene')`. It guards on `disposed`, wraps creation in try/catch (fallback text "Grafica 3D non disponibile") and calls `draw()` after mount.
- Labels are created inside `createCarSceneCore` (`car/scene.ts`, `createLabelLayer(stage, overlay)`). They cannot appear before the stage exists, so there is no labels-before-scene race.
- `src/render/stage.ts:562-568` sets the camera aspect from `max(1, clientWidth/Height)` at creation. A `ResizeObserver` (`:568`) re-sizes, updates the aspect and invalidates, so a zero-size host at mount self-heals.

## Playwright evidence (preview on :4173, Chromium headless)

- 6 cold loads at 1920x1080 and 1280x720: canvas 1150x494 / 510x358, WebGL context present, no page errors. Only the GL driver perf warning "GPU stall due to ReadPixels", caused by my own pixel probe.
- Screenshot `screens/drive-investigate.png`: car, track, labels, HUD and plots all render.
- The in-page pixel probe returned 0 non-black pixels. That is a probe artifact: `drawImage` on a WebGL canvas without `preserveDrawingBuffer` reads blank. Element screenshots (189 KB PNG) show the real content.
- Variants (element screenshots, early at 400-600 ms and late at +3 s, all the same size): default, route-delayed chunk (1.5 s), SwiftShader software GL. All rendered, no errors.
- WebGL disabled (`--disable-gpu --disable-webgl`): `THREE.WebGLRenderer: A WebGL context could not be created` is caught and the fallback message shows. The 2D HUD and plots stay up.

## Likely cause of Chip's report

Environment-specific. I did not reproduce it, so this is a hypothesis. Candidates: a headless screenshot taken before the first rAF or shader compile, a lost or throttled GL context in a background tab, or a GPU-less sandbox. Labels and the HUD are DOM/2D, so they show even when the canvas is blank. Other 3D scenes working at the same time does not rule this out, because the drive scene is heavier (post-processing, car meshes).

## Recommendation

No change before Nov 12. If it recurs, capture the console and `window` renderer info (`info()` from the sim's debug hook), plus `webglcontextlost` events, and the exact headless flags used. A possible later hardening is a `webglcontextlost` handler that shows the fallback message. It is not needed now.
