import fs from 'node:fs';

const SCRIPT = fs.readFileSync('/Users/leonnas/projects/dsh-video-enhancer/video-enhancer.user.js', 'utf8');
const BASE = 'http://127.0.0.1:9222';

async function newTab(url) {
  const r = await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  return r.json();
}
function connect(wsUrl) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    ws.onopen = () => res({
      send: (method, params = {}) => new Promise((ok) => { const i = ++id; pending.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); }),
      close: () => ws.close(),
      raw: ws,
    });
    ws.onerror = rej;
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runScenario(name, url, steps) {
  const tab = await newTab('about:blank');
  const c = await connect(tab.webSocketDebuggerUrl);
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 2000, deviceScaleFactor: 1, mobile: false });
  await c.send('Runtime.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT });
  await c.send('Page.navigate', { url });
  await sleep(2500);
  const out = await steps(c);
  c.close();
  await fetch(`${BASE}/json/close/${tab.id}`);
  return out;
}

const evalJS = async (c, expr) => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

async function clickAt(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(60);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function moveTo(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}

const results = [];
const check = (n, ok) => { results.push([n, ok]); };

// 场景 A：单视频 + 站点反复自动恢复播放
await runScenario('A', 'http://127.0.0.1:8898/siteA.html', async (c) => {
  const before = await evalJS(c, 'document.getElementById("v").paused');
  await clickAt(c, 320, 180);            // 真实鼠标点击 → 暂停
  await sleep(1500);
  const after = await evalJS(c, 'document.getElementById("v").paused');
  check('A 单视频：点击后保持暂停（站点反复 play 无效）', before === false && after === true);

  await clickAt(c, 320, 180);            // 再点 → 恢复播放
  await sleep(400);
  const resumed = await evalJS(c, 'document.getElementById("v").paused');
  check('A 单视频：再次点击能恢复播放', resumed === false);
});

// 场景 B：多视频 + 站点"播放一个就暂停其它"
await runScenario('B', 'http://127.0.0.1:8898/siteB.html', async (c) => {
  const s0 = await evalJS(c, 'window.__state()');
  console.log("  B 初始:", JSON.stringify(s0)); check("B 多视频：初始只有第一个在播", JSON.stringify(s0) === JSON.stringify([false, true, true]));

  await moveTo(c, 100, 100);             // 先移出
  await sleep(200);
  await moveTo(c, 320, 1400);            // 悬停第二个（进入元素才会触发 mouseover）
  await sleep(1400);
  const s1 = await evalJS(c, 'window.__state()');
  check('B 多视频：悬停第二个 → 第二个播放、第一个暂停', s1[1] === false && s1[0] === true);
  check('B 多视频：第三个不受影响（仍暂停）', s1[2] === true);

  await clickAt(c, 320, 1400);           // 点击第二个 → 暂停
  await sleep(1200);
  const s2 = await evalJS(c, 'window.__state()');
  check('B 多视频：点击暂停第二个后保持暂停', s2[1] === true);

  await clickAt(c, 320, 1400);           // 再点 → 恢复
  await sleep(900);
  const s3 = await evalJS(c, 'window.__state()');
  console.log('  B 二次点击后:', JSON.stringify(s3));
  check('B 多视频：再次点击能恢复播放', s3[1] === false);
});

let pass = 0;
for (const [n, ok] of results) { console.log((ok ? '✅' : '❌') + ' ' + n); if (ok) pass++; }
console.log(`\n${pass}/${results.length} 通过（真实 Chrome + 真实鼠标事件）`);
process.exit(pass === results.length ? 0 : 1);
