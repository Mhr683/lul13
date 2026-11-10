// Draws the Shop Coach product video: the product's pictures animated into a 12-15 second ad with
// moving words, price, end card and music made in the browser (WebAudio). Used by AiVideoMaker.tsx,
// which records the canvas with MediaRecorder.

export type Plan = {
  style: 'PREMIUM' | 'BOLD_SALE' | 'FRESH' | 'PLAYFUL' | 'ELEGANT' | 'TECH';
  headline: string;
  tagline: string;
  scenes: { image: number; caption: string; sub: string }[];
  priceLine: string;
  badge: string;
  cta: string;
  colors: { background: string; accent: string; text: string };
  /** How the cut-out product moves (ROAD: drives on a road; TURNTABLE; FLOAT; SKY: flies; NONE) */
  motion?: 'ROAD' | 'TURNTABLE' | 'FLOAT' | 'SKY' | 'NONE';
  /** Which way the product's front points in the picture (a car drives that way) */
  facing?: 'LEFT' | 'RIGHT';
  /** What the voice-over says (empty: no voice) */
  voiceScript?: string;
};

export const SIZE = 720;

// ------------------------------------------------------------------ cutting the product out
type Pic = HTMLImageElement | ImageBitmap;

/**
 * Cuts the product out of a plain (white / one-colour) background: the background is filled in from
 * the edges, everything it does not reach is the product. Returns null for busy backgrounds (a room,
 * a street), where only the full picture can be shown.
 */
export function cutOut(img: Pic): HTMLCanvasElement | null {
  try {
    const iw = (img as any).width as number;
    const ih = (img as any).height as number;
    const k = Math.min(1, 640 / Math.max(iw, ih));
    const w = Math.max(8, Math.round(iw * k));
    const h = Math.max(8, Math.round(ih * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0, w, h);
    const im = ctx.getImageData(0, 0, w, h);
    const px = im.data;
    // the edge colour: most edge pixels must be close to it, or the background is not plain
    const edge: number[] = [];
    for (let x = 0; x < w; x += 2) edge.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y += 2) edge.push(y * w, y * w + w - 1);
    const rs = edge.map((i) => px[i * 4]).sort((a, b) => a - b);
    const gs = edge.map((i) => px[i * 4 + 1]).sort((a, b) => a - b);
    const bs = edge.map((i) => px[i * 4 + 2]).sort((a, b) => a - b);
    const mid = Math.floor(edge.length / 2);
    const bg = [rs[mid], gs[mid], bs[mid]];
    const far = (i: number, tol: number) => Math.abs(px[i * 4] - bg[0]) + Math.abs(px[i * 4 + 1] - bg[1]) + Math.abs(px[i * 4 + 2] - bg[2]) > tol;
    const plain = edge.filter((i) => !far(i, 60)).length / edge.length;
    if (plain < 0.85) return null;
    // flood fill from every edge pixel that matches the background
    const TOL = 70;
    const isBg = new Uint8Array(w * h);
    const stack: number[] = [];
    for (const i of edge) if (!far(i, TOL) && !isBg[i]) (isBg[i] = 1), stack.push(i);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const n of next) if (n >= 0 && !isBg[n] && !far(n, TOL)) (isBg[n] = 1), stack.push(n);
    }
    let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (isBg[i]) {
          px[i * 4 + 3] = 0;
          continue;
        }
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        // soft edge next to the background
        const nearBg = (x > 0 && isBg[i - 1]) || (x < w - 1 && isBg[i + 1]) || (y > 0 && isBg[i - w]) || (y < h - 1 && isBg[i + w]);
        if (nearBg) px[i * 4 + 3] = 150;
      }
    const share = count / (w * h);
    if (share < 0.04 || share > 0.97 || maxX < minX) return null;
    ctx.putImageData(im, 0, 0);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d')!.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  } catch {
    return null;
  }
}
export const FPS = 30;
const INTRO = 2.2;
const SCENE = 2.4;
const PRICE = 2.4;
const OUTRO = 2.2;
const FADE = 0.45;

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const serif = (s: Plan['style']) => s === 'PREMIUM' || s === 'ELEGANT';
const fontOf = (s: Plan['style'], weight: number, px: number) =>
  `${weight} ${px}px ${serif(s) ? 'Georgia, "Times New Roman", serif' : '"Segoe UI", Roboto, "Noto Sans", Arial, sans-serif'}`;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The picture: a blurred, darkened copy fills the frame, the full picture sits on top with a slow zoom */
function drawPicture(ctx: CanvasRenderingContext2D, img: HTMLImageElement | ImageBitmap, t: number, dir: number, plan: Plan, time: number, boxScale = 0.66, lift = 70) {
  const iw = (img as any).width;
  const ih = (img as any).height;
  const cover = Math.max(SIZE / iw, SIZE / ih) * 1.15;
  ctx.save();
  try {
    ctx.filter = 'blur(26px) brightness(0.55)';
  } catch {}
  ctx.drawImage(img, (SIZE - iw * cover) / 2, (SIZE - ih * cover) / 2, iw * cover, ih * cover);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = plan.colors.background;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.restore();
  // the moving pattern sits behind the product, never over it
  drawDecor(ctx, plan, time);
  const zoom = 1 + 0.1 * t;
  const fit = Math.min((SIZE * boxScale) / iw, (SIZE * boxScale) / ih) * zoom;
  const w = iw * fit;
  const h = ih * fit;
  const x = (SIZE - w) / 2 + dir * 18 * (t - 0.5);
  // lifted up so the words underneath do not cover the product
  const y = Math.max(16, (SIZE - h) / 2 - lift) + 10 * (0.5 - t);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, x, y, w, h, 18);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

function drawDecor(ctx: CanvasRenderingContext2D, plan: Plan, time: number) {
  ctx.save();
  if (plan.style === 'BOLD_SALE') {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = plan.colors.accent;
    for (let i = -4; i < 12; i++) {
      const x = ((i * 90 + time * 60) % (SIZE + 180)) - 180;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 40, 0);
      ctx.lineTo(x + 40 - SIZE, SIZE);
      ctx.lineTo(x - SIZE, SIZE);
      ctx.fill();
    }
  } else if (plan.style === 'TECH') {
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = plan.colors.accent;
    ctx.lineWidth = 1;
    const off = (time * 30) % 48;
    for (let x = -48 + off; x < SIZE; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, SIZE);
      ctx.stroke();
    }
    for (let y = -48 + off; y < SIZE; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE, y);
      ctx.stroke();
    }
  } else if (plan.style === 'PLAYFUL' || plan.style === 'FRESH') {
    for (let i = 0; i < 18; i++) {
      const seed = i * 97.13;
      const x = (Math.sin(seed) * 0.5 + 0.5) * SIZE;
      const y = SIZE - (((time * (30 + (i % 5) * 12) + seed * 7) % (SIZE + 40)) - 20);
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time * 3 + i);
      ctx.fillStyle = i % 2 ? plan.colors.accent : plan.colors.text;
      ctx.beginPath();
      ctx.arc(x, y, 3 + (i % 4) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // PREMIUM / ELEGANT: soft light sweep
    const x = ((time * 160) % (SIZE * 2.2)) - SIZE * 0.6;
    const g = ctx.createLinearGradient(x - 120, 0, x + 120, SIZE);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, plan: Plan, caption: string, sub: string, t: number) {
  const k = ease(t * 2.4);
  const y0 = SIZE - (sub ? 100 : 74) + (1 - k) * 60;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.font = fontOf(plan.style, 800, 46);
  const lines = wrap(ctx, caption, SIZE - 120, 2);
  const lineH = 52;
  const boxH = lines.length * lineH + (sub ? 44 : 18) + 18;
  const boxY = y0 - (lines.length - 1) * lineH;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  roundRect(ctx, 40, boxY - 46, SIZE - 80, boxH, 16);
  ctx.fill();
  ctx.fillStyle = plan.colors.accent;
  ctx.fillRect(40, boxY - 46, 10 + (SIZE - 90) * ease(t * 1.6) * 0.25, 6);
  ctx.fillStyle = plan.colors.text;
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, SIZE / 2, boxY + i * lineH));
  if (sub) {
    ctx.font = fontOf(plan.style, 500, 26);
    ctx.globalAlpha = k * 0.9;
    ctx.fillText(wrap(ctx, sub, SIZE - 140, 1)[0] || '', SIZE / 2, boxY + lines.length * lineH + 2);
  }
  ctx.restore();
}

function drawBadge(ctx: CanvasRenderingContext2D, plan: Plan, text: string, time: number, x: number, y: number, r = 70) {
  if (!text) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.2 + Math.sin(time * 4) * 0.05);
  const s = 1 + Math.sin(time * 6) * 0.04;
  ctx.scale(s, s);
  ctx.fillStyle = plan.colors.accent;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rr = i % 2 ? r * 0.86 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = plan.colors.background;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fontOf(plan.style, 900, text.length > 8 ? 22 : 28);
  wrap(ctx, text, r * 1.5, 2).forEach((l, i, all) => ctx.fillText(l, 0, (i - (all.length - 1) / 2) * 28));
  ctx.restore();
}

export type Frame = {
  pics: (HTMLImageElement | ImageBitmap)[];
  plan: Plan;
  shopName: string;
  /** The product cut out of each picture (null where the background is not plain) */
  cuts?: (HTMLCanvasElement | null)[];
};

// ------------------------------------------------------------------ the product moving
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};
const isDark = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114 < 110;
};
/** Draws the cut-out product with its bottom centre at (cx, bottom), fitted into maxW x maxH */
function placeCut(ctx: CanvasRenderingContext2D, cut: HTMLCanvasElement, cx: number, bottom: number, maxW: number, maxH: number, flip = false, rot = 0, sx = 1) {
  const k = Math.min(maxW / cut.width, maxH / cut.height);
  const w = cut.width * k;
  const h = cut.height * k;
  ctx.save();
  ctx.translate(cx, bottom - h / 2);
  ctx.rotate(rot);
  ctx.scale((flip ? -1 : 1) * sx, 1);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.drawImage(cut, -w / 2, -h / 2, w, h);
  ctx.restore();
  return { w, h };
}

function drawRoad(ctx: CanvasRenderingContext2D, plan: Plan, cut: HTMLCanvasElement, time: number) {
  // the scenery runs the opposite way to where the product points, so it looks like it drives forward
  const dir = plan.facing === 'LEFT' ? 1 : -1;
  const dusk = isDark(plan.colors.background);
  const sky = ctx.createLinearGradient(0, 0, 0, 420);
  sky.addColorStop(0, dusk ? '#1B2A4A' : '#7FB3E6');
  sky.addColorStop(1, dusk ? '#F2A365' : '#E9F2FB');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, 430);
  // far city (slow)
  ctx.fillStyle = dusk ? 'rgba(20,24,44,0.85)' : 'rgba(120,140,170,0.55)';
  const far = (time * 50 * dir) % 90;
  for (let i = -2; i < 12; i++) {
    const x = i * 90 + far;
    const hgt = 70 + hash(i + Math.floor((-time * 50 * dir) / 90)) * 120;
    ctx.fillRect(x, 420 - hgt, 70, hgt);
  }
  // road
  ctx.fillStyle = '#3B3D42';
  ctx.fillRect(0, 420, SIZE, 150);
  ctx.fillStyle = '#9A9DA3';
  ctx.fillRect(0, 420, SIZE, 6);
  ctx.fillStyle = '#2A2B2F';
  ctx.fillRect(0, 562, SIZE, 8);
  // lane marks (fast)
  ctx.fillStyle = '#F4F1E8';
  const lane = (time * 950 * dir) % 160;
  for (let x = -160 + lane; x < SIZE + 160; x += 160) ctx.fillRect(x, 500, 90, 8);
  // roadside poles (fastest, in front of the city)
  const pole = (time * 700 * dir) % 300;
  ctx.fillStyle = dusk ? '#0E1222' : '#5A6270';
  for (let x = -300 + pole; x < SIZE + 300; x += 300) {
    ctx.fillRect(x, 300, 8, 122);
    ctx.fillRect(x - 18, 300, 44, 6);
  }
  // speed streaks
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = 120 + hash(i) * 380;
    const len = 60 + hash(i + 9) * 120;
    const x = ((hash(i + 3) * SIZE + time * 1400 * dir) % (SIZE + 300) + SIZE + 300) % (SIZE + 300) - 150;
    ctx.globalAlpha = 0.25 + hash(i + 5) * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * (dir < 0 ? 1 : -1), y);
    ctx.stroke();
  }
  ctx.restore();
  // shadow, dust behind, and the product with a small road bounce
  const cx = SIZE / 2 + Math.sin(time * 1.1) * 18;
  const bottom = 548 + Math.sin(time * 24) * 1.6;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, 550, 230, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 16; i++) {
    const age = (time * 2.2 + hash(i)) % 1;
    // dust stays behind the product (the side opposite to where it points)
    const bx = cx + (plan.facing === 'LEFT' ? 1 : -1) * (180 + age * 220);
    ctx.globalAlpha = (1 - age) * 0.35;
    ctx.fillStyle = '#CFC6B8';
    ctx.beginPath();
    ctx.arc(bx + hash(i + 2) * 30, 540 - age * 40 - hash(i + 4) * 20, 6 + age * 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  placeCut(ctx, cut, cx, bottom, 470, 250);
}

function drawStage(ctx: CanvasRenderingContext2D, plan: Plan, cut: HTMLCanvasElement, time: number) {
  const g = ctx.createRadialGradient(SIZE / 2, 300, 40, SIZE / 2, 330, 520);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.25, plan.colors.accent);
  g.addColorStop(1, plan.colors.background);
  ctx.fillStyle = g;
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = plan.colors.background;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.restore();
  drawDecor(ctx, plan, time);
  if (plan.motion === 'TURNTABLE') {
    // lit stand with a turning ring of lights
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(SIZE / 2, 540, 250, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = plan.colors.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + time * 1.4;
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(a));
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(SIZE / 2 + Math.cos(a) * 240, 540 + Math.sin(a) * 42, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // turning: the product narrows and widens a little, as if it rotates on the stand
    const turn = 0.9 + 0.1 * Math.cos(time * 1.8);
    placeCut(ctx, cut, SIZE / 2, 536, 440, 400, false, Math.sin(time * 0.9) * 0.03, turn);
  } else {
    // FLOAT: bobbing up and down, the shadow grows and shrinks with it
    const lift = Math.sin(time * 2.1) * 16;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(SIZE / 2, 548, 150 - lift * 2.5, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 14; i++) {
      const y = SIZE - ((time * (40 + hash(i) * 60) + hash(i + 1) * SIZE) % (SIZE + 40));
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hash(i + 7) * SIZE, y, 4 + hash(i + 3) * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    placeCut(ctx, cut, SIZE / 2, 510 - 16 + lift, 440, 400, false, Math.sin(time * 1.3) * 0.05);
  }
}

function drawSky(ctx: CanvasRenderingContext2D, plan: Plan, cut: HTMLCanvasElement, time: number) {
  const dir = plan.facing === 'LEFT' ? 1 : -1;
  const sky = ctx.createLinearGradient(0, 0, 0, SIZE);
  sky.addColorStop(0, '#4D9BE6');
  sky.addColorStop(1, '#CFE6FA');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const cloud = (x: number, y: number, s: number, a: number) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x, y, 70 * s, 26 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 40 * s, y + 6 * s, 44 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 44 * s, y + 8 * s, 48 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const speed = 120 + hash(i) * 380;
    const s = 0.6 + hash(i + 1) * 1.1;
    const x = ((hash(i + 2) * SIZE + time * speed * dir) % (SIZE + 400) + SIZE + 400) % (SIZE + 400) - 200;
    cloud(x, 60 + hash(i + 3) * 520, s, 0.5 + hash(i + 4) * 0.4);
  }
  ctx.restore();
  const cx = SIZE / 2 + Math.sin(time * 0.8) * 50;
  const cy = 470 + Math.sin(time * 1.6) * 24;
  placeCut(ctx, cut, cx, cy, 460, 330, false, Math.sin(time * 1.6 + 0.6) * 0.06);
}

/** One scene with the product itself moving; false when it cannot (no cut-out / no motion) */
function drawMotion(ctx: CanvasRenderingContext2D, f: Frame, image: number, time: number) {
  const m = f.plan.motion;
  const cut = f.cuts?.[image];
  if (!cut || !m || m === 'NONE') return false;
  ctx.save();
  if (m === 'ROAD') drawRoad(ctx, f.plan, cut, time);
  else if (m === 'SKY') drawSky(ctx, f.plan, cut, time);
  else drawStage(ctx, f.plan, cut, time);
  ctx.restore();
  return true;
}

export function totalSeconds(plan: Plan) {
  return INTRO + plan.scenes.length * SCENE + PRICE + OUTRO;
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: Frame, time: number) {
  const { plan, pics } = f;
  ctx.fillStyle = plan.colors.background;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const pic = (i: number) => pics[Math.max(0, Math.min(pics.length - 1, i))];
  const segs: { len: number; draw: (t: number, local: number) => void }[] = [
    {
      len: INTRO,
      draw: (t, local) => {
        if (!drawMotion(ctx, f, plan.scenes[0]?.image ?? 0, time)) drawPicture(ctx, pic(plan.scenes[0]?.image ?? 0), t, 1, plan, time, 0.6, 95);
        const k = ease(local / 0.9);
        ctx.save();
        ctx.globalAlpha = k;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, SIZE - 210, SIZE, 210);
        ctx.fillStyle = plan.colors.accent;
        ctx.fillRect(SIZE / 2 - 60 * k, SIZE - 188, 120 * k, 5);
        ctx.fillStyle = plan.colors.text;
        ctx.textAlign = 'center';
        ctx.font = fontOf(plan.style, 800, 50);
        wrap(ctx, plan.headline, SIZE - 100, 2).forEach((l, i) => ctx.fillText(l, SIZE / 2, SIZE - 128 + i * 56 + (1 - k) * 40));
        ctx.font = fontOf(plan.style, 500, 24);
        ctx.globalAlpha = ease((local - 0.5) / 0.8);
        ctx.fillText(plan.tagline, SIZE / 2, SIZE - 26);
        ctx.restore();
      },
    },
    ...plan.scenes.map((s, i) => ({
      len: SCENE,
      draw: (t: number) => {
        // the product itself moves (cut out of a plain background); otherwise the picture zooms
        if (!drawMotion(ctx, f, s.image, time)) drawPicture(ctx, pic(s.image), t, i % 2 ? -1 : 1, plan, time);
        drawCaption(ctx, plan, s.caption, s.sub, t);
      },
    })),
    {
      len: PRICE,
      draw: (t, local) => {
        drawPicture(ctx, pic(0), t, 1, plan, time, 0.56, 95);
        const k = ease(local / 0.6);
        ctx.save();
        ctx.globalAlpha = k;
        ctx.fillStyle = plan.colors.background;
        roundRect(ctx, 60, SIZE - 190, SIZE - 120, 130, 22);
        ctx.fill();
        ctx.strokeStyle = plan.colors.accent;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = plan.colors.text;
        ctx.textAlign = 'center';
        ctx.font = fontOf(plan.style, 900, plan.priceLine.length > 18 ? 40 : 54);
        ctx.fillText(plan.priceLine.split('  (')[0], SIZE / 2, SIZE - 118 + (1 - k) * 30);
        if (plan.priceLine.includes('(was')) {
          ctx.font = fontOf(plan.style, 500, 24);
          ctx.globalAlpha = k * 0.75;
          const was = plan.priceLine.split('(was ')[1]?.replace(')', '') || '';
          const tw = ctx.measureText(`was ${was}`).width;
          ctx.fillText(`was ${was}`, SIZE / 2, SIZE - 80);
          ctx.fillRect(SIZE / 2 - tw / 2, SIZE - 88, tw, 2);
        }
        ctx.restore();
        if (plan.badge) drawBadge(ctx, plan, plan.badge, time, SIZE - 110, 110);
      },
    },
    {
      len: OUTRO,
      draw: (t, local) => {
        ctx.fillStyle = plan.colors.background;
        ctx.fillRect(0, 0, SIZE, SIZE);
        drawDecor(ctx, plan, time);
        const k = ease(local / 0.7);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.globalAlpha = k;
        ctx.fillStyle = plan.colors.accent;
        ctx.font = fontOf(plan.style, 600, 26);
        ctx.fillText(f.shopName ? f.shopName.toUpperCase() : 'ANOKHA SHOPPING HUB', SIZE / 2, SIZE / 2 - 110);
        ctx.fillStyle = plan.colors.text;
        ctx.font = fontOf(plan.style, 800, 44);
        wrap(ctx, plan.headline, SIZE - 120, 2).forEach((l, i) => ctx.fillText(l, SIZE / 2, SIZE / 2 - 40 + i * 50));
        const pulse = 1 + Math.sin(time * 5) * 0.035;
        ctx.translate(SIZE / 2, SIZE / 2 + 110);
        ctx.scale(pulse, pulse);
        ctx.font = fontOf(plan.style, 800, 28);
        const bw = Math.min(SIZE - 100, ctx.measureText(plan.cta).width + 70);
        ctx.fillStyle = plan.colors.accent;
        roundRect(ctx, -bw / 2, -38, bw, 64, 32);
        ctx.fill();
        ctx.fillStyle = plan.colors.background;
        ctx.fillText(plan.cta, 0, 6);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = ease((local - 0.6) / 0.6) * 0.8;
        ctx.fillStyle = plan.colors.text;
        ctx.textAlign = 'center';
        ctx.font = fontOf(plan.style, 500, 22);
        ctx.fillText('anokhashopinghub.shop', SIZE / 2, SIZE - 50);
        ctx.restore();
        void t;
      },
    },
  ];
  // find the segment and draw it; the first moments of each one fade over the end of the one before
  let start = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (time < start + s.len || i === segs.length - 1) {
      const local = time - start;
      if (i > 0 && local < FADE) {
        const prev = segs[i - 1];
        prev.draw(1, prev.len);
        ctx.save();
        ctx.globalAlpha = ease(local / FADE);
        s.draw(clamp01(local / s.len), local);
        ctx.restore();
      } else s.draw(clamp01(local / s.len), local);
      break;
    }
    start += s.len;
  }
}

// ------------------------------------------------------------------ music (made here, no files)
/** When the voice-over starts in the video (seconds) */
export const VOICE_START = 0.8;

/** Turns the voice-over file (WAV, or raw 16-bit PCM at 24 kHz) into sound the video can play */
export async function decodeVoice(bytes: ArrayBuffer, mime = 'audio/wav'): Promise<AudioBuffer | null> {
  const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  try {
    if (/L16|pcm/i.test(mime)) {
      const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
      const pcm = new Int16Array(bytes.slice(0, bytes.byteLength - (bytes.byteLength % 2)));
      const buf = ac.createBuffer(1, pcm.length, rate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
      return buf;
    }
    return await ac.decodeAudioData(bytes.slice(0));
  } catch {
    return null;
  } finally {
    ac.close().catch(() => {});
  }
}

/** The video's sound: music made here (optional) and the voice-over (optional, music goes quiet under it) */
export function startMusic(plan: Plan, seconds: number, opts: { music?: boolean; voice?: AudioBuffer | null } = {}) {
  const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  const music = opts.music !== false;
  if (!music && !opts.voice) return null;
  const ac = new AC();
  const dest = ac.createMediaStreamDestination();
  const t0 = ac.currentTime + 0.05;
  if (opts.voice) {
    const src = ac.createBufferSource();
    src.buffer = opts.voice;
    const vg = ac.createGain();
    vg.gain.value = 1.1;
    src.connect(vg).connect(dest);
    src.start(t0 + VOICE_START);
  }
  if (!music) return { ac, track: dest.stream.getAudioTracks()[0] };
  const master = ac.createGain();
  master.gain.value = 0.0001;
  master.connect(dest);
  // quieter music while the voice speaks
  const level = opts.voice ? 0.16 : 0.5;
  master.gain.exponentialRampToValueAtTime(level, t0 + 0.6);
  if (opts.voice) {
    const end = t0 + VOICE_START + opts.voice.duration;
    if (end + 0.6 < t0 + seconds - 1.2) {
      master.gain.setValueAtTime(level, end);
      master.gain.linearRampToValueAtTime(0.5, end + 0.6);
    }
  }
  master.gain.setValueAtTime(opts.voice && t0 + VOICE_START + opts.voice.duration + 0.6 >= t0 + seconds - 1.2 ? level : 0.5, t0 + seconds - 1.2);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  const bpm = plan.style === 'BOLD_SALE' || plan.style === 'PLAYFUL' ? 118 : plan.style === 'TECH' ? 110 : 92;
  const beat = 60 / bpm;
  // I - V - vi - IV in C (soft and happy)
  const chords = [
    [261.63, 329.63, 392.0],
    [196.0, 246.94, 293.66],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
  ];
  const note = (freq: number, at: number, len: number, type: OscillatorType, vol: number) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + len + 0.05);
  };
  const bars = Math.ceil(seconds / (beat * 4));
  for (let b = 0; b < bars; b++) {
    const chord = chords[b % 4];
    const at = t0 + b * beat * 4;
    for (const f of chord) note(f, at, beat * 4, 'triangle', 0.05);
    note(chord[0] / 2, at, beat * 4, 'sine', 0.12);
    for (let s = 0; s < 8; s++) note(chord[s % 3] * 2, at + s * beat * 0.5, beat * 0.45, 'sine', 0.05);
    if (plan.style !== 'ELEGANT') {
      for (let k = 0; k < 4; k++) {
        const kt = at + k * beat;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.setValueAtTime(130, kt);
        o.frequency.exponentialRampToValueAtTime(45, kt + 0.18);
        g.gain.setValueAtTime(0.35, kt);
        g.gain.exponentialRampToValueAtTime(0.0001, kt + 0.22);
        o.connect(g).connect(master);
        o.start(kt);
        o.stop(kt + 0.25);
      }
    }
  }
  return { ac, track: dest.stream.getAudioTracks()[0] };
}

export function pickMime() {
  const MR: any = (window as any).MediaRecorder;
  if (!MR) return '';
  for (const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MR.isTypeSupported?.(m)) return m;
  }
  return '';
}

