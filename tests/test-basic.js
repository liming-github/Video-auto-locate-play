const { JSDOM } = require('/tmp/vtest/node_modules/jsdom');
const fs = require('fs');
const src = fs.readFileSync('../video-enhancer.user.js','utf8');

const html = `<!doctype html><html><body>
  <div style="height:2000px"><video id="v1" src="a.mp4"></video></div>
  <div style="height:2000px"><video id="v2" src="b.mp4"></video></div>
  <input id="txt">
</body></html>`;

const dom = new JSDOM(html, { url: 'https://example.com/watch', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
const doc = window.document;

// --- 媒体元素桩 ---
function stub(v, top) {
  let paused = true;
  v.play = () => { if (!paused) return Promise.resolve(); paused = false; v.dispatchEvent(new window.Event('play')); return Promise.resolve(); };
  v.pause = () => { if (paused) return; paused = true; v.dispatchEvent(new window.Event('pause')); };
  Object.defineProperty(v, 'paused', { get: () => paused, configurable: true });
  Object.defineProperty(v, 'ended', { get: () => false, configurable: true });
  Object.defineProperty(v, 'volume', { get: () => 0.5, set: () => {}, configurable: true });
  Object.defineProperty(v, 'muted', { get: () => false, set: () => {}, configurable: true });
  Object.defineProperty(v, 'videoWidth', { get: () => 1280, configurable: true });
  Object.defineProperty(v, 'videoHeight', { get: () => 720, configurable: true });
  Object.defineProperty(v, 'currentTime', { get: () => 10, set: () => {}, configurable: true });
  Object.defineProperty(v, 'duration', { get: () => 100, configurable: true });
  v.getBoundingClientRect = () => ({ top, bottom: top + 400, left: 0, right: 800, width: 800, height: 400, x:0, y:top });
}
const v1 = doc.getElementById('v1'), v2 = doc.getElementById('v2');
stub(v1, 0); stub(v2, 2200);

// GM 桩
window.GM_getValue = () => ''; window.GM_setValue = () => {}; window.GM_registerMenuCommand = () => {};
window.alert = () => {};

window.eval(src);

const fire = (el, type, extra = {}) => {
  const ev = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...extra });
  el.dispatchEvent(ev);
};
const key = (k, code) => {
  const ev = new window.KeyboardEvent('keydown', { key: k, code: code || k, bubbles: true, cancelable: true });
  (doc.activeElement || doc.body).dispatchEvent(ev);
};

const results = [];
const check = (name, cond) => results.push([name, cond]);

// 1) 单击视频 -> 播放
fire(v1, 'click');
check('单击视频→播放', v1.paused === false);
// 2) 再单击 -> 暂停
fire(v1, 'click');
check('再次单击→暂停', v1.paused === true);
// 3) 空格 -> 播放
key(' ', 'Space');
check('空格→播放', v1.paused === false);
// 4) 空格 -> 暂停
key(' ', 'Space');
check('空格→暂停', v1.paused === true);
// 5) 悬停第二个视频 -> 播放它、暂停第一个
fire(v1, 'click'); // 让 v1 播放
fire(v2, 'mouseover');
check('悬停切换→v2播放', v2.paused === false);
check('悬停切换→v1暂停', v1.paused === true);
// 6) 空格作用于"当前"(v2)
key(' ', 'Space');
check('空格作用于当前视频(v2)', v2.paused === true);
// 7) 文本输入框里空格不拦截
doc.getElementById('txt').focus();
const before = v1.paused;
key(' ', 'Space');
check('输入框内空格不拦截', v1.paused === before);

let pass = 0;
for (const [n, ok] of results) { console.log((ok ? '✅' : '❌') + ' ' + n); if (ok) pass++; }
console.log(`\n${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
