/**
 * Procedural canvases of the car scenes (no image files, no network): asphalt
 * tile with track markings, distance-board faces, wheel spin-blur disc.
 * Canvases are cached per page; GPU textures are created (and disposed) by the
 * scene that uses them.
 */

const cache = new Map<string, HTMLCanvasElement>();

function canvas(
  key: string,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  cache.set(key, c);
  return c;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Length of one asphalt tile along the track [m] and the track texture's width [m]. */
export const TRACK_TILE_M = 10;
export const TRACK_WIDTH_M = 14;
/** Half-width of the racing surface (inside the white edge lines) [m]. */
export const TRACK_HALF_M = 5;

/**
 * Asphalt tile: u along the track (one tile = {@link TRACK_TILE_M}), v across
 * ({@link TRACK_WIDTH_M}): grainy asphalt, white edge lines at ±5 m, darker
 * run-off beyond, and a short distance tick on each edge every 10 m.
 */
export function asphaltTile(dark: boolean): HTMLCanvasElement {
  const W = 512;
  const H = 512;
  return canvas(`asphalt-${dark ? 'd' : 'l'}`, W, H, (g) => {
    const r = rng(17);
    const base = dark ? [30, 33, 38] : [92, 97, 104];
    const runoff = dark ? [20, 22, 26] : [74, 79, 86];
    const img = g.createImageData(W, H);
    const perM = H / TRACK_WIDTH_M;
    for (let y = 0; y < H; y++) {
      const zm = Math.abs((y - H / 2) / perM);
      const col = zm > TRACK_HALF_M + 0.15 ? runoff : base;
      for (let x = 0; x < W; x++) {
        const n = (r() - 0.5) * (dark ? 18 : 22) + (r() < 0.04 ? (dark ? 14 : 18) : 0);
        const i = 4 * (y * W + x);
        img.data[i] = (col[0] as number) + n;
        img.data[i + 1] = (col[1] as number) + n;
        img.data[i + 2] = (col[2] as number) + n;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // racing line: slightly darker rubbered band
    g.fillStyle = dark ? 'rgba(0,0,0,0.18)' : 'rgba(30,30,35,0.12)';
    g.fillRect(0, H / 2 - 1.2 * perM, W, 2.4 * perM);
    // white edge lines
    g.fillStyle = dark ? 'rgba(200,205,212,0.6)' : 'rgba(235,238,242,0.8)';
    const lw = Math.max(3, 0.14 * perM);
    for (const s of [-1, 1]) {
      const y = H / 2 + s * TRACK_HALF_M * perM;
      g.fillRect(0, y - lw / 2, W, lw);
      // distance tick every tile (10 m), outside the line
      g.fillRect(W * 0.02, y + s * (lw / 2) - (s < 0 ? 0.6 * perM : 0), lw * 1.2, 0.6 * perM);
    }
  });
}

/**
 * Face of a distance board: big digits (distance to the end of the braking zone)
 * on a graphite panel with a thin accent band. Original design, no logos.
 */
export function boardFace(text: string): HTMLCanvasElement {
  const W = 256;
  const H = 320;
  return canvas(`board-${text}`, W, H, (g) => {
    g.fillStyle = '#1b2129';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#e9edf1';
    g.fillRect(10, 10, W - 20, H - 20);
    g.fillStyle = '#1b2129';
    g.fillRect(18, 18, W - 36, H - 36);
    g.fillStyle = '#2fbfb1';
    g.fillRect(18, 18, W - 36, 22);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${text.length > 2 ? 104 : 132}px system-ui, sans-serif`;
    g.fillText(text, W / 2, H / 2 + 6);
    g.font = '700 38px system-ui, sans-serif';
    g.fillStyle = '#b8c2cc';
    g.fillText('m', W / 2, H - 52);
  });
}

/** Spin-blur disc of a fast-turning rim: soft concentric streaks with alpha. */
export function spinBlur(): HTMLCanvasElement {
  const N = 256;
  return canvas('spin-blur', N, N, (g) => {
    const c = N / 2;
    const r = rng(5);
    for (let k = 0; k < 90; k++) {
      const rr = c * (0.22 + 0.76 * r());
      g.strokeStyle = `rgba(150,160,172,${0.05 + 0.12 * r()})`;
      g.lineWidth = 1 + 3 * r();
      g.beginPath();
      g.arc(c, c, rr, 0, Math.PI * 2);
      g.stroke();
    }
    const grad = g.createRadialGradient(c, c, c * 0.18, c, c, c);
    grad.addColorStop(0, 'rgba(60,66,74,0.75)');
    grad.addColorStop(0.3, 'rgba(60,66,74,0.18)');
    grad.addColorStop(0.92, 'rgba(60,66,74,0.22)');
    grad.addColorStop(1, 'rgba(60,66,74,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, N, N);
  });
}

/** Concentric machining marks of a carbon-carbon brake disc (albedo). */
export function discFace(): HTMLCanvasElement {
  const N = 256;
  return canvas('disc-face', N, N, (g) => {
    const c = N / 2;
    g.fillStyle = '#3a3836';
    g.fillRect(0, 0, N, N);
    const r = rng(9);
    for (let k = 0; k < 140; k++) {
      const rr = c * (0.55 + 0.45 * r());
      const v = 48 + Math.round(30 * r());
      g.strokeStyle = `rgba(${v},${v - 2},${v - 4},0.5)`;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(c, c, rr, 0, Math.PI * 2);
      g.stroke();
    }
  });
}
