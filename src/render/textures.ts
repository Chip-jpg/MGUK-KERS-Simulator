/**
 * Procedural texture sources (2D canvases), generated ONCE per page and shared:
 * every stage wraps them in its own `CanvasTexture` (GPU copies are disposed with
 * the stage, the canvases stay cached). No image files, no network (D14).
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

/** Deterministic PRNG (mulberry32) so textures are identical on every load. */
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

/** Writes a tangent-space normal map from a height function h(x, y) ∈ [0, 1]. */
function normalFromHeight(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  height: (x: number, y: number) => number,
  strength: number,
): void {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (height((x + 1) % w, y) - height((x - 1 + w) % w, y)) * strength;
      const dy = (height(x, (y + 1) % h) - height(x, (y - 1 + h) % h)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = 4 * (y * w + x);
      img.data[i] = Math.round((0.5 - 0.5 * dx * inv) * 255);
      img.data[i + 1] = Math.round((0.5 + 0.5 * dy * inv) * 255);
      img.data[i + 2] = Math.round((0.5 + 0.5 * inv) * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

/** Lamination stack: thin grooves between the sheets (stacked along v). 8 sheets per tile. */
export function laminationNormal(): HTMLCanvasElement {
  const W = 64;
  const H = 256;
  return canvas('lamination', W, H, (g) => {
    const period = H / 8;
    normalFromHeight(
      g,
      W,
      H,
      (_x, y) => {
        const f = (y % period) / period;
        return f < 0.08 ? 0.15 + f * 4 : 1 - 0.08 * Math.sin(f * Math.PI);
      },
      3,
    );
  });
}

/** Brushed metal: long fine streaks along u. */
export function brushedNormal(): HTMLCanvasElement {
  const W = 256;
  const H = 256;
  return canvas('brushed', W, H, (g) => {
    const r = rng(7);
    const rows = Array.from({ length: H }, () => r());
    normalFromHeight(
      g,
      W,
      H,
      (x, y) => (rows[y] as number) * 0.8 + 0.2 * Math.sin(x * 0.05 + y),
      1.2,
    );
  });
}

/** Carbon-fibre 2×2 twill: albedo (grey tows) — pair with {@link carbonNormal}. */
export function carbonAlbedo(): HTMLCanvasElement {
  const N = 256;
  return canvas('carbon-albedo', N, N, (g) => {
    const cell = N / 8;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const warp = (i + j) % 4 < 2;
        const grad = warp
          ? g.createLinearGradient(i * cell, 0, (i + 1) * cell, 0)
          : g.createLinearGradient(0, j * cell, 0, (j + 1) * cell);
        grad.addColorStop(0, '#0c0d0f');
        grad.addColorStop(0.5, warp ? '#3a3d42' : '#2a2c30');
        grad.addColorStop(1, '#0c0d0f');
        g.fillStyle = grad;
        g.fillRect(i * cell, j * cell, cell, cell);
      }
    }
  });
}

export function carbonNormal(): HTMLCanvasElement {
  const N = 128;
  return canvas('carbon-normal', N, N, (g) => {
    const cell = N / 8;
    normalFromHeight(
      g,
      N,
      N,
      (x, y) => {
        const i = Math.floor(x / cell);
        const j = Math.floor(y / cell);
        const warp = (i + j) % 4 < 2;
        const t = warp ? (x % cell) / cell : (y % cell) / cell;
        return Math.sin(t * Math.PI);
      },
      2,
    );
  });
}

/**
 * Neutral painted magnet face with an engraved letter ('N' or 'S'): returns the
 * albedo (letter slightly darker) — the same canvas drives a bump map where the
 * dark letter reads as an engraving.
 */
export function magnetFace(letter: 'N' | 'S', dark: boolean): HTMLCanvasElement {
  const N = 256;
  return canvas(`magnet-${letter}-${dark ? 'd' : 'l'}`, N, N, (g) => {
    const base = dark ? '#5d636b' : '#7b828a';
    g.fillStyle = base;
    g.fillRect(0, 0, N, N);
    const r = rng(letter === 'N' ? 11 : 13);
    for (let k = 0; k < 2500; k++) {
      g.fillStyle = `rgba(255,255,255,${(r() * 0.05).toFixed(3)})`;
      g.fillRect(r() * N, r() * N, 1.5, 1.5);
    }
    g.strokeStyle = 'rgba(20,22,26,0.5)';
    g.lineWidth = 6;
    g.strokeRect(14, 14, N - 28, N - 28);
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 2;
    g.strokeRect(19, 19, N - 38, N - 38);
    g.font = `700 ${Math.round(N * 0.55)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(30,32,36,0.55)';
    g.fillText(letter, N / 2, N / 2 + N * 0.03);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillText(letter, N / 2 - 2, N / 2 + N * 0.03 - 2);
  });
}

/** Studio backdrop: soft radial gradient (centre slightly lighter). */
export function studioBackdrop(dark: boolean): HTMLCanvasElement {
  const N = 512;
  return canvas(`backdrop-${dark ? 'd' : 'l'}`, N, N, (g) => {
    const grad = g.createRadialGradient(N * 0.5, N * 0.38, N * 0.05, N * 0.5, N * 0.5, N * 0.75);
    if (dark) {
      grad.addColorStop(0, '#2a3340');
      grad.addColorStop(0.55, '#151a22');
      grad.addColorStop(1, '#090b0f');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#e9edf2');
      grad.addColorStop(1, '#cfd6de');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, N, N);
  });
}

/** Studio floor: faint engineering grid fading out radially (albedo + alpha in one canvas). */
export function studioFloor(dark: boolean): HTMLCanvasElement {
  const N = 1024;
  return canvas(`floor-${dark ? 'd' : 'l'}`, N, N, (g) => {
    g.fillStyle = dark ? '#1a2029' : '#dfe4ea';
    g.fillRect(0, 0, N, N);
    g.strokeStyle = dark ? 'rgba(140,160,190,0.16)' : 'rgba(60,80,110,0.14)';
    g.lineWidth = 1;
    const step = N / 48;
    for (let k = 0; k <= 48; k++) {
      g.beginPath();
      g.moveTo(k * step, 0);
      g.lineTo(k * step, N);
      g.moveTo(0, k * step);
      g.lineTo(N, k * step);
      g.stroke();
    }
    g.strokeStyle = dark ? 'rgba(140,160,190,0.26)' : 'rgba(60,80,110,0.24)';
    for (let k = 0; k <= 48; k += 6) {
      g.beginPath();
      g.moveTo(k * step, 0);
      g.lineTo(k * step, N);
      g.moveTo(0, k * step);
      g.lineTo(N, k * step);
      g.stroke();
    }
  });
}

/**
 * Opaque floor for the `base` tier: the grid of {@link studioFloor} with the radial
 * fade baked in towards the backdrop colour (no alpha blending on software GL).
 */
export function studioFloorBaked(dark: boolean): HTMLCanvasElement {
  const N = 512;
  return canvas(`floor-baked-${dark ? 'd' : 'l'}`, N, N, (g) => {
    g.drawImage(studioFloor(dark), 0, 0, N, N);
    const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    const edge = dark ? '13,16,21' : '226,230,235';
    grad.addColorStop(0, `rgba(${edge},0)`);
    grad.addColorStop(0.45, `rgba(${edge},0.2)`);
    grad.addColorStop(1, `rgba(${edge},1)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, N, N);
  });
}

/** Background colour of the `base` tier (≈ the backdrop gradient's mid tone). */
export function studioBackgroundColor(dark: boolean): number {
  return dark ? 0x0d1015 : 0xe2e6eb;
}

/** Radial alpha (white centre → black rim) for the floor fade. */
export function radialFade(): HTMLCanvasElement {
  const N = 256;
  return canvas('radial-fade', N, N, (g) => {
    const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, '#d0d0d0');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, N, N);
  });
}

/** Flow stripes for energy ribbons (white chevrons on transparent). */
export function flowStripes(): HTMLCanvasElement {
  const W = 128;
  const H = 32;
  return canvas('flow-stripes', W, H, (g) => {
    g.clearRect(0, 0, W, H);
    for (let x = 0; x < W; x++) {
      const t = x / W;
      const a = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 6);
      g.fillStyle = `rgba(255,255,255,${(0.25 + 0.75 * a).toFixed(3)})`;
      g.fillRect(x, 0, 1, H);
    }
  });
}

/** Number of cached canvases (debug). */
export function cachedCanvasCount(): number {
  return cache.size;
}
