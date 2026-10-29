// Phase portrait of the modular discriminant Delta on the Poincare disk, in ASCII.

const canvas = document.getElementById("bg") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const RAMP = " .,:;-=+*#%@";           // phase 0 -> 1
const FPS = 12, SPEED = 0.003;         // phase shift per frame
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = 2 * Math.PI;

// arg Delta(tau) / 2pi in [0, 1), Delta the weight-12 modular discriminant.
function deltaPhase(x: number, y: number): number {
  // Move tau into the fundamental domain, where |q| < 0.005 and a few product
  // terms are plenty. Delta(-1/tau) = tau^12 Delta(tau), so each inversion
  // subtracts 12 arg(tau) from the phase; translations leave it unchanged.
  let th = 0;
  for (let k = 0; k < 60; k++) {
    x -= Math.round(x);
    const r2 = x * x + y * y;
    if (r2 >= 1) break;
    th -= 12 * Math.atan2(y, x);
    x = -x / r2; y = y / r2;
  }
  // Delta = q prod (1 - q^n)^24, q = e^(2 pi i tau)
  const m = Math.exp(-TAU * y), qr = m * Math.cos(TAU * x), qi = m * Math.sin(TAU * x);
  th += TAU * x;
  let pr = 1, pi = 0;
  for (let n = 1; n <= 4; n++) {
    [pr, pi] = [pr * qr - pi * qi, pr * qi + pi * qr];
    th += 24 * Math.atan2(-pi, 1 - pr);
  }
  return ((th / TAU) % 1 + 1) % 1;
}

let CW = 8, CH = 13;                   // character cell size in CSS px
let cols = 0, rows = 0, offset = 0, dpr = 1;
let phase = new Float32Array(0);       // -1 marks cells outside the disk
let color = "", hiColor = "";
let timer: number | undefined;

// The full pattern is drawn offscreen whenever the drift advances; each frame
// copies it and redraws only the cells near the pointer, more strongly.
const base = document.createElement("canvas");
const bctx = base.getContext("2d")!;

// Pointer trail: cells the pointer passes over heat up, then cool off.
// Fingers get a wider trail than the mouse.
const TRAIL_R_MOUSE = 80, TRAIL_R_TOUCH = 110, TRAIL_ALPHA = 0.75, HALF_LIFE_MS = 400;
let trailR = TRAIL_R_MOUSE;

// Tap/click ripple: a hyperbolic circle centered on the tap, growing at constant
// hyperbolic speed. On screen it decelerates and thins toward the rim, which it
// never reaches. It heats cells as it passes, leaving a fading wake.
const RIPPLE_RHO_MAX = 4, RIPPLE_LIFE_S = 2.4;   // hyperbolic radius reached, lifetime
const RIPPLE_SIGMA0 = 0.06, RIPPLE_SIGMA1 = 0.14; // ring softness at start / added by the end
const RIPPLE_AMP = 0.85;
let ripples: { wx: number; wy: number; t: number }[] = [];

// Disk placement in CSS px, set by resize().
let diskX = 0, diskY = 0, diskR = 1;

let heat = new Float32Array(0);
let hot = new Uint8Array(0);           // 1 if the cell is in `active`
let active: number[] = [];
let lastX: number | null = null, lastY = 0, lastT = 0, raf = 0;

function readColors(): void {
  color = getComputedStyle(canvas).color;
  const [r, g, b] = color.match(/[\d.]+/g)!;
  hiColor = `rgb(${r} ${g} ${b})`;
}

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight, tall = H > 1.3 * W;
  [CW, CH] = tall ? [6, 10] : [8, 13];
  canvas.width = base.width = W * dpr;
  canvas.height = base.height = H * dpr;
  cols = Math.ceil(W / CW);
  rows = Math.ceil(H / CH);
  phase = new Float32Array(cols * rows).fill(-1);
  heat = new Float32Array(cols * rows);
  hot = new Uint8Array(cols * rows);
  active = [];

  // Disk centered on screen (below the text on phones), mapped to the upper
  // half-plane by tau = (1 - iz) / (z - i): center -> i, top -> infinity,
  // bottom -> 0. Same map as Lowry-Duda, "Visualizing Modular Forms".
  const R = 0.48 * Math.min(W, H), cx = W / 2;
  // On phones H is the toolbar-hidden height; keep the disk clear of the
  // bottom toolbar when it's showing.
  const cy = tall ? Math.min(H * 0.66, H - R - 110) : H / 2;
  diskX = cx; diskY = cy; diskR = R;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const zx = (col * CW + CW / 2 - cx) / R, zy = (cy - row * CH - CH / 2) / R;
      if (zx * zx + zy * zy > 0.985) continue;
      const nr = 1 + zy, ni = -zx, dr = zx, di = zy - 1, d2 = dr * dr + di * di;
      const tx = (nr * dr + ni * di) / d2, ty = (ni * dr - nr * di) / d2;
      phase[row * cols + col] = deltaPhase(tx, ty);
    }
  }
  drawBase();
}

function glyph(i: number): string {
  const p = phase[i];
  return p < 0 ? " " : RAMP[Math.floor(((p + offset) % 1) * RAMP.length)];
}

function setupText(c: CanvasRenderingContext2D): void {
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.font = `${CH - 1}px ui-monospace, Menlo, Consolas, monospace`;
  c.textBaseline = "top";
}

function drawBase(): void {
  setupText(bctx);
  bctx.clearRect(0, 0, base.width, base.height);
  bctx.fillStyle = color;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ch = glyph(row * cols + col);
      if (ch !== " ") bctx.fillText(ch, col * CW, row * CH);
    }
  }
  frame();
}

function frame(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0);
  if (!active.length) return;

  setupText(ctx);
  ctx.fillStyle = hiColor;
  for (const i of active) {
    const ch = glyph(i);
    if (ch === " ") continue;
    ctx.globalAlpha = heat[i] * TRAIL_ALPHA;
    ctx.fillText(ch, (i % cols) * CW, Math.floor(i / cols) * CH);
  }
  ctx.globalAlpha = 1;
}

function heatCell(i: number, h: number): void {
  if (h <= heat[i]) return;
  heat[i] = h;
  if (!hot[i]) { hot[i] = 1; active.push(i); }
}

// Visit the disk cells within distance `reach` of (x, y), passing each one's
// distance from (x, y).
function forCellsNear(x: number, y: number, reach: number, fn: (i: number, d: number) => void): void {
  const c0 = Math.max(0, Math.floor((x - reach) / CW)), c1 = Math.min(cols - 1, Math.ceil((x + reach) / CW));
  const r0 = Math.max(0, Math.floor((y - reach) / CH)), r1 = Math.min(rows - 1, Math.ceil((y + reach) / CH));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const i = row * cols + col;
      if (phase[i] < 0) continue;
      const dx = col * CW + CW / 2 - x, dy = row * CH + CH / 2 - y;
      fn(i, Math.sqrt(dx * dx + dy * dy));
    }
  }
}

// Heat the cells within trailR of (x, y), strongest at the center.
function deposit(x: number, y: number): void {
  forCellsNear(x, y, trailR, (i, d) => {
    const f = 1 - d / trailR;
    if (f > 0) heatCell(i, f * f);
  });
}

// Hyperbolic distance between z and w in the Poincare disk.
function hypDist(zx: number, zy: number, wx: number, wy: number): number {
  const nx = zx - wx, ny = zy - wy;
  const dr = 1 - (wx * zx + wy * zy), di = wx * zy - wy * zx;    // 1 - conj(w) z
  const t = Math.min(Math.sqrt((nx * nx + ny * ny) / (dr * dr + di * di)), 0.999999);
  return Math.log((1 + t) / (1 - t));                            // 2 artanh(t)
}

// Heat a soft band of cells around each ripple's current hyperbolic radius.
function advanceRipples(now: number): void {
  ripples = ripples.filter(rp => (now - rp.t) / 1000 < RIPPLE_LIFE_S);
  for (const { wx, wy, t } of ripples) {
    const p = (now - t) / 1000 / RIPPLE_LIFE_S;               // 0 -> 1 over its life
    const rho = RIPPLE_RHO_MAX * p;
    const sigma = RIPPLE_SIGMA0 + RIPPLE_SIGMA1 * p;
    const amp = RIPPLE_AMP * (1 - p) ** 1.5;                  // dims into the background
    if (amp < 0.03) continue;

    // The hyperbolic circle of radius rho_out around w is a Euclidean circle;
    // only cells inside its bounding box can be in the band.
    const r = Math.tanh((rho + 2.5 * sigma) / 2), w2 = wx * wx + wy * wy, k = 1 - r * r * w2;
    const ex = wx * (1 - r * r) / k, ey = wy * (1 - r * r) / k, er = r * (1 - w2) / k;
    const x = diskX + ex * diskR, y = diskY - ey * diskR;
    // Near the rim a fixed hyperbolic width shrinks below a character; keep
    // the band at least ~1.5 cells wide on screen (hyperbolic length element
    // is 2|dz| / (1 - |z|^2)).
    const minW = 1.5 * CH / diskR;
    forCellsNear(x, y, er * diskR + 3 * CH, (i) => {
      const zx = ((i % cols) * CW + CW / 2 - diskX) / diskR;
      const zy = (diskY - Math.floor(i / cols) * CH - CH / 2) / diskR;
      const s = Math.max(sigma, minW * 2 / (1 - zx * zx - zy * zy));
      const z = (hypDist(zx, zy, wx, wy) - rho) / s;
      if (z * z < 6) heatCell(i, amp * Math.exp(-0.5 * z * z));
    });
  }
}

// Cool every heated cell; stop the loop once the trail is gone.
function tick(now: number): void {
  raf = 0;
  const k = Math.pow(0.5, Math.min(now - lastT, 100) / HALF_LIFE_MS);
  lastT = now;
  for (let j = active.length - 1; j >= 0; j--) {
    const i = active[j];
    heat[i] *= k;
    if (heat[i] < 0.02) {
      heat[i] = 0; hot[i] = 0;
      active[j] = active[active.length - 1];
      active.pop();
    }
  }
  advanceRipples(now);
  frame();
  if (active.length || ripples.length) raf = requestAnimationFrame(tick);
}

function kick(): void {
  if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
}

function onPointer(e: PointerEvent): void {
  const x = e.clientX, y = e.clientY;
  trailR = e.pointerType === "mouse" ? TRAIL_R_MOUSE : TRAIL_R_TOUCH;
  if (e.type === "pointerdown" && !still) {
    // Taps outside the disk start from the nearest point just inside the rim.
    let wx = (x - diskX) / diskR, wy = (diskY - y) / diskR;
    const m = Math.hypot(wx, wy);
    if (m > 0.9) { wx *= 0.9 / m; wy *= 0.9 / m; }
    ripples.push({ wx, wy, t: performance.now() });
  }
  if (lastX === null) {
    deposit(x, y);
  } else {
    // Fill in fast moves so the trail doesn't break into dots.
    const dist = Math.hypot(x - lastX, y - lastY), steps = Math.max(1, Math.ceil(dist / (trailR / 3)));
    for (let k = 1; k <= steps; k++) deposit(lastX + (x - lastX) * k / steps, lastY + (y - lastY) * k / steps);
  }
  lastX = x; lastY = y;
  kick();
}

function onRelease(e: PointerEvent): void {
  if (e.type === "pointerup" && e.pointerType === "mouse") return;
  lastX = null;
}

function start(): void {
  if (still || timer !== undefined) return;
  timer = setInterval(() => { offset = (offset + SPEED) % 1; drawBase(); }, 1000 / FPS);
}

function stop(): void {
  clearInterval(timer);
  timer = undefined;
}

readColors();
resize();
start();

addEventListener("pointermove", onPointer, { passive: true });
addEventListener("pointerdown", onPointer, { passive: true });
addEventListener("pointerup", onRelease, { passive: true });
addEventListener("pointercancel", onRelease, { passive: true });
document.documentElement.addEventListener("pointerleave", onRelease);

// The canvas is sized to the largest viewport, so mobile toolbars sliding
// don't change it; rebuild only on real size changes (e.g. rotation).
let lastW = canvas.clientWidth, lastH = canvas.clientHeight;
addEventListener("resize", () => {
  if (canvas.clientWidth === lastW && canvas.clientHeight === lastH) return;
  lastW = canvas.clientWidth; lastH = canvas.clientHeight;
  resize();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  readColors();
  drawBase();
});
document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
