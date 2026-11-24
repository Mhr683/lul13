// The hidden recording window of the store's daily social video (server/dailyVideo.ts opens
// /video-render.html in a headless Chrome/Edge on the store's computer). It draws the same video as
// Seller Center's "Make my video" (services/videoRender.ts) and sends the recording back to the server.
import { SIZE, cutOut, recordVideo, totalSeconds, type Plan } from './services/videoRender';

const q = new URLSearchParams(location.search);
const api = `/api/daily-video/render/${encodeURIComponent(q.get('job') || '')}?k=${encodeURIComponent(q.get('k') || '')}`;

async function run() {
  const r = await fetch(api);
  if (!r.ok) throw new Error(`job ${r.status}`);
  const input: { plan: Plan; shopName: string; pictures: string[] } = await r.json();
  const pics = await Promise.all(input.pictures.map(async (u) => createImageBitmap(await (await fetch(u)).blob())));
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  document.body.appendChild(canvas);
  const { blob } = await recordVideo({
    canvas,
    frame: { pics, plan: input.plan, shopName: input.shopName, cuts: pics.map((p) => cutOut(p)) },
    seconds: totalSeconds(input.plan),
    music: true,
  });
  const up = await fetch(api, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } });
  if (!up.ok) throw new Error(`upload ${up.status}`);
}

run().catch((err) => {
  fetch(`${api}&error=${encodeURIComponent(String(err?.message || err))}`, { method: 'POST' }).catch(() => {});
});
