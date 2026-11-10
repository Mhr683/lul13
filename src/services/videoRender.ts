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
};

export const SIZE = 720;
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

export type Frame = { pics: (HTMLImageElement | ImageBitmap)[]; plan: Plan; shopName: string };

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
        drawPicture(ctx, pic(plan.scenes[0]?.image ?? 0), t, 1, plan, time, 0.6, 95);
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
        drawPicture(ctx, pic(s.image), t, i % 2 ? -1 : 1, plan, time);
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
export function startMusic(plan: Plan, seconds: number) {
  const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  const dest = ac.createMediaStreamDestination();
  const master = ac.createGain();
  master.gain.value = 0.0001;
  master.connect(dest);
  const t0 = ac.currentTime + 0.05;
  master.gain.exponentialRampToValueAtTime(0.5, t0 + 0.6);
  master.gain.setValueAtTime(0.5, t0 + seconds - 1.2);
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

