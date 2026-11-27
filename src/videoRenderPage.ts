// The hidden recording window of the store's daily social video (server/dailyVideo.ts opens
// /video-render.html in a headless Chrome/Edge on the store's computer). It draws the same video as
// Seller Center's "Make my video" (services/videoRender.ts) and sends the recording back to the server.
import { SIZE, VOICE_START, cutOut, decodeVoice, recordVideo, totalSeconds, type Plan } from './services/videoRender';

const q = new URLSearchParams(location.search);
const api = `/api/daily-video/render/${encodeURIComponent(q.get('job') || '')}?k=${encodeURIComponent(q.get('k') || '')}`;

async function run() {
  const r = await fetch(api);
  if (!r.ok) throw new Error(`job ${r.status}`);
  const input: { plan: Plan; shopName: string; pictures: string[]; voice?: string; voiceMime?: string } = await r.json();
  const pics = await Promise.all(input.pictures.map(async (u) => createImageBitmap(await (await fetch(u)).blob())));
  // the Urdu voice-over (if the server could make one): the video lasts at least as long as the voice
  let voice: AudioBuffer | null = null;
  if (input.voice) {
    const bytes = Uint8Array.from(atob(input.voice), (c) => c.charCodeAt(0));
    voice = await decodeVoice(bytes.buffer, input.voiceMime).catch(() => null);
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  document.body.appendChild(canvas);
  const { blob } = await recordVideo({
    canvas,
    frame: { pics, plan: input.plan, shopName: input.shopName, cuts: pics.map((p) => cutOut(p)) },
    seconds: Math.max(totalSeconds(input.plan), voice ? VOICE_START + voice.duration + 1.2 : 0),
    music: true,
    voice,
  });
  const up = await fetch(api, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } });
  if (!up.ok) throw new Error(`upload ${up.status}`);
}

run().catch((err) => {
  fetch(`${api}&error=${encodeURIComponent(String(err?.message || err))}`, { method: 'POST' }).catch(() => {});
});
