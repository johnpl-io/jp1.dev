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
let cols = 0, rows = 0, offset = 0;
let phase = new Float32Array(0);       // -1 marks cells outside the disk
let color = getComputedStyle(canvas).color;
let timer: number | undefined;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const W = innerWidth, H = innerHeight, tall = H > 1.3 * W;
  [CW, CH] = tall ? [6, 10] : [8, 13];
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cols = Math.ceil(W / CW);
  rows = Math.ceil(H / CH);
  phase = new Float32Array(cols * rows).fill(-1);

  // Disk centered on screen (below the text on phones), mapped to the upper
  // half-plane by tau = (1 - iz) / (z - i): center -> i, top -> infinity,
  // bottom -> 0. Same map as Lowry-Duda, "Visualizing Modular Forms".
  const R = 0.48 * Math.min(W, H), cx = W / 2, cy = tall ? H * 0.66 : H / 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const zx = (col * CW + CW / 2 - cx) / R, zy = (cy - row * CH - CH / 2) / R;
      if (zx * zx + zy * zy > 0.985) continue;
      const nr = 1 + zy, ni = -zx, dr = zx, di = zy - 1, d2 = dr * dr + di * di;
      const tx = (nr * dr + ni * di) / d2, ty = (ni * dr - nr * di) / d2;
      phase[row * cols + col] = deltaPhase(tx, ty);
    }
  }
  draw();
}

function draw(): void {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.fillStyle = color;
  ctx.font = `${CH - 1}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textBaseline = "top";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const p = phase[row * cols + col];
      if (p < 0) continue;
      const ch = RAMP[Math.floor(((p + offset) % 1) * RAMP.length)];
      if (ch !== " ") ctx.fillText(ch, col * CW, row * CH);
    }
  }
}

function start(): void {
  if (still || timer !== undefined) return;
  timer = setInterval(() => { offset = (offset + SPEED) % 1; draw(); }, 1000 / FPS);
}

function stop(): void {
  clearInterval(timer);
  timer = undefined;
}

resize();
start();

// Mobile browsers fire resize when the address bar slides; skip those.
let lastW = innerWidth, lastH = innerHeight;
addEventListener("resize", () => {
  if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 120) return;
  lastW = innerWidth; lastH = innerHeight;
  resize();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  color = getComputedStyle(canvas).color;
  draw();
});
document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
