// Publishes hosting/index.html to the project's default Firebase Hosting site, using the server's
// service account from .env (FIREBASE_SERVICE_ACCOUNT_FILE). Firebase's Google sign-in popup and the
// password-reset / verify-email links run on <project>.firebaseapp.com and only work once that site
// has a release.
//   node scripts/deploy-hosting.mjs            check only
//   node scripts/deploy-hosting.mjs --deploy   publish
// Never prints keys or tokens.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import dns from 'node:dns';
import { createRequire } from 'node:module';

dns.setDefaultResultOrder('ipv4first');
const repo = process.cwd();
const deploy = process.argv.includes('--deploy');
const require = createRequire(path.join(repo, 'package.json'));
const { cert } = require('firebase-admin/app');

const cfg = JSON.parse(fs.readFileSync(path.join(repo, 'firebase-applet-config.json'), 'utf-8'));
const envLine = fs.readFileSync(path.join(repo, '.env'), 'utf-8').split(/\r?\n/).find((l) => l.startsWith('FIREBASE_SERVICE_ACCOUNT_FILE='));
if (!envLine) throw new Error('FIREBASE_SERVICE_ACCOUNT_FILE is not set in .env');
const keyFile = envLine.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const { access_token } = await cert(JSON.parse(fs.readFileSync(keyFile, 'utf-8'))).getAccessToken();
const API = 'https://firebasehosting.googleapis.com/v1beta1';
const call = async (method, url, body, extra = {}) => {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...extra },
    body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,
  });
  const text = await r.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch {}
  if (!r.ok) throw new Error(`${method} ${url.replace(API, '')} -> ${r.status} ${json?.error?.message || text.slice(0, 200)}`);
  return json;
};

const p = cfg.projectId;
const sites = await call('GET', `${API}/projects/${p}/sites`);
const list = (sites.sites || []).map((s) => s.name.split('/').pop());
console.log('sites:', list.join(', ') || 'none');
let site = list.includes(p) ? p : list[0];
if (site) {
  const rel = await call('GET', `${API}/sites/${site}/releases?pageSize=1`);
  console.log('latest release:', rel.releases?.[0]?.releaseTime || 'none');
}
if (!deploy) process.exit(0);

if (!site) {
  await call('POST', `${API}/projects/${p}/sites?siteId=${p}`, {});
  site = p;
  console.log('created site', site);
}
const gz = zlib.gzipSync(fs.readFileSync(path.join(repo, 'hosting', 'index.html')));
const hash = crypto.createHash('sha256').update(gz).digest('hex');
const version = await call('POST', `${API}/sites/${site}/versions`, { config: {} });
const pop = await call('POST', `${API}/${version.name}:populateFiles`, { files: { '/index.html': hash } });
if ((pop.uploadRequiredHashes || []).includes(hash)) {
  await call('POST', `${pop.uploadUrl}/${hash}`, gz, { 'Content-Type': 'application/octet-stream' });
}
await call('PATCH', `${API}/${version.name}?update_mask=status`, { status: 'FINALIZED' });
const release = await call('POST', `${API}/sites/${site}/releases?versionName=${encodeURIComponent(version.name)}`, {});
console.log('released:', release.releaseTime);
console.log(`check: https://${p}.firebaseapp.com/__/firebase/init.json should now open`);
process.exit(0);
