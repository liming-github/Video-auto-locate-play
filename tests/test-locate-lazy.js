const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'video-enhancer.user.js'), 'utf8');

function setup(html, url) {
  const dom = new JSDOM(html, { url: url || 'https://91porna.com/heiliao-chigua/1', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom, doc = window.document;
  let scrolled = false;
  window.Element.prototype.scrollIntoView = function () { scrolled = true; };
  window.scrollTo = function () { scrolled = true; };
  window.GM_getValue = () => ''; window.GM_setValue = () => {}; window.GM_registerMenuCommand = () => {}; window.alert = () => {};
  window.eval(src);
  return { window, doc, isScrolled: () => scrolled };
}

const results = [];
const check = (n, ok) => results.push([n, ok]);

(async function run() {
  // 1) 强信号 .ql-video「空」容器（懒加载：尚无 <video>，只有 [data-playback-post] 占位）→ 也应定位
  {
    const { isScrolled } = setup(`<body>
      <div style="height:3000px"></div>
      <div class="ql-video bg-base1"><div data-playback-post="11861" data-cover=""></div></div>
      <div style="height:3000px"></div></body>`);
    await new Promise(r => setTimeout(r, 2200));
    check('空 .ql-video（懒加载，仅 [data-playback-post] 占位）也定位', isScrolled());
  }

  // 2) 弱信号 .player「空」容器 → 仍不定位（回归保护：不因强信号放宽而误滚）
  {
    const { isScrolled } = setup(`<body>
      <div style="height:3000px"></div>
      <div class="player" style="height:400px"></div>
      <div style="height:3000px"></div></body>`);
    await new Promise(r => setTimeout(r, 2200));
    check('空 .player（弱信号）不定位', !isScrolled());
  }

  // 3) 弱信号 .player 内部确有 <video> → 定位
  {
    const { doc, isScrolled } = setup(`<body>
      <div style="height:3000px"></div>
      <div class="player"><video src="x.mp4" width="640" height="360"></video></div>
      <div style="height:3000px"></div></body>`);
    const v = doc.querySelector('video');
    Object.defineProperty(v, 'videoWidth', { get: () => 1280, configurable: true });
    Object.defineProperty(v, 'videoHeight', { get: () => 720, configurable: true });
    await new Promise(r => setTimeout(r, 2200));
    check('.player 内部确有 <video> → 定位', isScrolled());
  }

  let pass = 0;
  for (const [n, ok] of results) { console.log((ok ? '✅' : '❌') + ' ' + n); if (ok) pass++; }
  console.log(`\n${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})();
