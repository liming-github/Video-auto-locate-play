import fs from 'node:fs';
const SCRIPT = fs.readFileSync('/Users/leonnas/projects/dsh-video-enhancer/video-enhancer.user.js', 'utf8');
const BASE = 'http://127.0.0.1:9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'https://91porna.com/heiliao-chigua/18917711861';

async function newTab(u) {
  const r = await fetch(`${BASE}/json/new?${encodeURIComponent(u)}`, { method: 'PUT' });
  return r.json();
}
function connect(w) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(w); let id = 0; const p = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
    ws.onopen = () => res({ send: (m, pa = {}) => new Promise(ok => { const i = ++id; p.set(i, ok); ws.send(JSON.stringify({ id: i, method: m, params: pa })); }), close: () => ws.close() });
    ws.onerror = rej;
  });
}
const ev = async (c, e) => (await c.send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

const tab = await newTab('about:blank');
const c = await connect(tab.webSocketDebuggerUrl);
await c.send('Page.enable');
await c.send('Runtime.enable');
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT });

const state = () => ev(c, `JSON.stringify({
  title: document.title.slice(0,40),
  url: location.href.slice(0,60),
  scrollY: Math.round(window.scrollY || 0),
  videos: document.querySelectorAll('video').length,
  qlVideo: document.querySelectorAll('.ql-video').length,
  qlMse: document.querySelectorAll('.ql-video-mse').length,
  xgplayer: document.querySelectorAll('.xgplayer,.xgplayer-player').length,
  locatedOnce: window.__vaLocatedOnce || 0,
  boxDone: window.__vaBoxDone || 0
})`);

await c.send('Page.navigate', { url: URL });
for (let i = 0; i < 7; i++) {
  await sleep(2500);
  console.log(`t=${(i + 1) * 2.5}s  `, await state());
}
console.log('--- final video/player detail ---');
console.log(await ev(c, `JSON.stringify(Array.from(document.querySelectorAll('video')).map(v=>({w:v.clientWidth||v.videoWidth,h:v.clientHeight||v.videoHeight,src:(v.src||v.currentSrc||'').slice(0,60)})))`));
c.close();
await fetch(`${BASE}/json/close/${tab.id}`);
