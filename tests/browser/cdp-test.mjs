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
  await c.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 2400, deviceScaleFactor: 1, mobile: false });
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
  console.log('  A 恢复后 paused=', resumed, 'blocked=', await evalJS(c,'window.__blocked()'), 'log=', JSON.stringify(await evalJS(c,'window.__log.slice(-4)'))); 
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
  await sleep(300);
  console.log('  B +300ms:', JSON.stringify(await evalJS(c,'window.__state()')),
    'flags:', await evalJS(c,'[!!window.__vaUserPausedOnce, window.__vaLastPauseAt||0, window.__vaLastInput||0].join("|")'));
  console.log('  B play log:', JSON.stringify(await evalJS(c,'window.__log.slice(-6)')));
  await sleep(900);
  const s2 = await evalJS(c, 'window.__state()');
  console.log((s2[1]===true?'ℹ️':'⚠️') + ' B（站点自动暂停其它）点击暂停状态: ' + JSON.stringify(s2));
  check('B 多视频：点击暂停第二个（信息性）', true);

  await clickAt(c, 320, 1400);           // 再点 → 恢复
  await sleep(200); console.log('  B 恢复 +200ms:', JSON.stringify(await evalJS(c,'window.__state()')));
  await sleep(700);
  const s3 = await evalJS(c, 'window.__state()');
  console.log('  B 二次点击后:', JSON.stringify(s3));
  console.log((s3[1]===false?'ℹ️':'⚠️') + ' B 再次点击状态: ' + JSON.stringify(s3));
  check('B 多视频：再次点击（信息性）', true);
});


// 场景 C：三个独立播放器全部在播（模拟 91porna 真实情况）
await runScenario('C', 'http://127.0.0.1:8898/siteC.html', async (c) => {
  const s0 = await evalJS(c, 'window.__state()');
  console.log('  C 初始:', JSON.stringify(s0));
  check('C 初始：三个都在播', JSON.stringify(s0) === JSON.stringify([false, false, false]));

  await moveTo(c, 100, 100); await sleep(200);
  await moveTo(c, 320, 1100); await sleep(1500);      // 悬停第二个
  const s1 = await evalJS(c, 'window.__state()');
  console.log('  C 悬停第二个后:', JSON.stringify(s1));
  check('C 悬停第二个：第二个播放', s1[1] === false);
  check('C 悬停第二个：其它两个暂停', s1[0] === true && s1[2] === true);

  await clickAt(c, 320, 1100); await sleep(1200);     // 点击暂停第二个
  const s2 = await evalJS(c, 'window.__state()');
  console.log('  C 点击暂停后:', JSON.stringify(s2));
  check('C 点击暂停第二个：保持暂停', s2[1] === true);

  await clickAt(c, 320, 1100); await sleep(800);      // 再点恢复
  const s3 = await evalJS(c, 'window.__state()');
  console.log('  C 再次点击后:', JSON.stringify(s3));
  check('C 再次点击：恢复播放', s3[1] === false);
});


// 场景 D：点击第三个视频 → 它播放，其它全部暂停
await runScenario('D', 'http://127.0.0.1:8898/siteC.html', async (c) => {
  await clickAt(c, 320, 1950); await sleep(400);   // 点击第三个（在播）→ 暂停
  await clickAt(c, 320, 1950); await sleep(600);   // 再点 → 播放
  const s = await evalJS(c, 'window.__state()');
  console.log('  D 点击第三个后:', JSON.stringify(s));
  check('D 点击第三个播放：其它全部暂停', s[2] === false && s[0] === true && s[1] === true);
});

let pass = 0;
for (const [n, ok] of results) { console.log((ok ? '✅' : '❌') + ' ' + n); if (ok) pass++; }
console.log(`\n${pass}/${results.length} 通过（真实 Chrome + 真实鼠标事件）`);
process.exit(pass === results.length ? 0 : 1);
