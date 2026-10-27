// Canvas drawing for the tolerance gauge and the wear dial. Colours match style.css.
const C = {
  face: '#d8dacf',
  faceShade: '#bfc2b5',
  ink: '#1d201d',
  scrap: '#b8503c',
  green: '#3f8a4f',
  needle: '#1d201d',
  hub: '#36463b',
  lamp: '#e6a43a',
  warn: '#cf4a33',
};

const START = Math.PI * 1.12; // left end of the arc
const END = Math.PI * 1.88; // right end
const angleAt = (pos: number) => START + (END - START) * pos;

/** Sizes the canvas backing store to its CSS box. Returns the context and CSS size. */
export function fitCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export interface GaugeView {
  needle: number;
  bandCenter: number;
  bandWidth: number;
  /** Amber band on each side of green; 0 until it's unlocked. */
  amberWidth: number;
  /** Where the last press landed, and how long ago (s). */
  mark: { pos: number; result: 'good' | 'amber' | 'scrap'; age: number } | null;
  /** Dims the face while the press can't be used. */
  idle: boolean;
}

export function drawGauge(canvas: HTMLCanvasElement, v: GaugeView) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!ctx || w < 40 || h < 40) return; // not laid out yet
  ctx.clearRect(0, 0, w, h);
  // The arc's top sits r * 1.1 above the hub; leave room for the hub below.
  const r = Math.min(w * 0.44, (h - 8) / 1.22);
  const cx = w / 2;
  const cy = 4 + r * 1.1;
  const band = r * 0.17;

  // Dial face
  ctx.beginPath();
  ctx.arc(cx, cy, r + band * 0.55, START - 0.08, END + 0.08);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = C.face;
  ctx.fill();

  // Scrap zone across the whole arc, green band on top
  const arc = (from: number, to: number, color: string) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r - band / 2, angleAt(Math.max(0, from)), angleAt(Math.min(1, to)));
    ctx.strokeStyle = color;
    ctx.lineWidth = band;
    ctx.lineCap = 'butt';
    ctx.stroke();
  };
  arc(0, 1, C.scrap);
  if (v.amberWidth > 0) {
    const half = v.bandWidth / 2;
    arc(v.bandCenter - half - v.amberWidth, v.bandCenter - half, C.lamp);
    arc(v.bandCenter + half, v.bandCenter + half + v.amberWidth, C.lamp);
  }
  arc(v.bandCenter - v.bandWidth / 2, v.bandCenter + v.bandWidth / 2, C.green);

  // Ticks
  ctx.strokeStyle = C.ink;
  for (let i = 0; i <= 20; i++) {
    const a = angleAt(i / 20);
    const major = i % 5 === 0;
    const r0 = r - band - (major ? band * 0.55 : band * 0.3);
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * (r - band), cy + Math.sin(a) * (r - band));
    ctx.stroke();
  }

  ctx.fillStyle = C.ink;
  ctx.font = `800 ${Math.max(11, r * 0.09)}px "Big Shoulders Stencil Display", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('TOLERANZ', cx, cy - r * 0.38);

  // Where the last press landed, fading out
  if (v.mark && v.mark.age < 0.9) {
    const a = angleAt(v.mark.pos);
    const alpha = 1 - v.mark.age / 0.9;
    const r0 = r + band * 0.1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = v.mark.result === 'good' ? C.green : v.mark.result === 'amber' ? C.lamp : C.warn;
    ctx.translate(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    const s = band * 0.45;
    ctx.moveTo(0, 0);
    ctx.lineTo(-s, -s * 1.3);
    ctx.lineTo(s, -s * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Needle
  const a = angleAt(v.needle);
  ctx.strokeStyle = C.needle;
  ctx.lineWidth = Math.max(2, r * 0.025);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * r * 0.08, cy - Math.sin(a) * r * 0.08);
  ctx.lineTo(cx + Math.cos(a) * (r + band * 0.2), cy + Math.sin(a) * (r + band * 0.2));
  ctx.stroke();
  ctx.fillStyle = C.hub;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.07, 0, Math.PI * 2);
  ctx.fill();

  if (v.idle) {
    ctx.fillStyle = 'rgba(75,97,82,.6)'; // machine green, so only the face looks dimmed
    ctx.fillRect(0, 0, w, h);
  }
}

/** Small wear dial: 0–100, red above the narrowing point. */
export function drawWear(canvas: HTMLCanvasElement, wear: number, narrowAbove: number) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!ctx || w < 20 || h < 20) return; // not laid out yet
  ctx.clearRect(0, 0, w, h);
  const r = Math.min(w * 0.42, h * 0.8);
  const cx = w / 2;
  const cy = h * 0.5 + r * 0.42;
  const lw = r * 0.18;
  const ang = (p: number) => START + (END - START) * (p / 100);

  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, r, ang(0), ang(narrowAbove));
  ctx.strokeStyle = '#6b8473';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, ang(narrowAbove), ang(100));
  ctx.strokeStyle = C.warn;
  ctx.stroke();

  const a = ang(wear);
  ctx.strokeStyle = C.face;
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * (r + lw * 0.4), cy + Math.sin(a) * (r + lw * 0.4));
  ctx.stroke();
  ctx.fillStyle = C.face;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
}
