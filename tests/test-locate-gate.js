const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'video-enhancer.user.js'), 'utf8');

function setup(html) {
  const dom = new JSDOM(html, { url: 'https://c.com/watch/1', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom, doc = window.document;
  let scrolled = false;
  window.Element.prototype.scrollIntoView = function () { scrolled = true; };
  window.scrollTo = function () { scrolled = true; };
  window.GM_getValue = () => ''; window.GM_setValue = () => {}; window.GM_registerMenuCommand = () => {}; window.alert = () => {};
  window.eval(src);
  return { window, doc, isScrolled: () => scrolled };
}

function stubVideo(v, w, h, opts) {
  opts = opts || {};
  Object.defineProperty(v, 'paused', { get: () => (opts.paused === undefined ? true : opts.paused), configurable: true });
  Object.defineProperty(v, 'ended', { get: () => false, configurable: true });
  Object.defineProperty(v, 'volume', { get: () => 0.5, set: () => {}, configurable: true });
  Object.defineProperty(v, 'muted', { get: () => false, set: () => {}, configurable: true });
  Object.defineProperty(v, 'videoWidth', { get: () => w, configurable: true });
  Object.defineProperty(v, 'videoHeight', { get: () => h, configurable: true });
  Object.defineProperty(v, 'readyState', { get: () => 0, configurable: true });
  Object.defineProperty(v, 'currentTime', { get: () => 0, set: () => {}, configurable: true });
  Object.defineProperty(v, 'duration', { get: () => 100, configurable: true });
  v.play = opts.play || (() => Promise.resolve());
  v.pause = () => {};
}

const results = [];
const check = (n, ok) => results.push([n, ok]);

(async function run() {
  // 1) 无视频页面：空 .player + about:blank iframe + article 块 → 一步都不滚
  {
    const { isScrolled } = setup(`<body>
      <div class="article-content"><div style="height:600px"></div><div style="height:600px"></div></div>
      <div class="player" style="height:400px"></div>
      <iframe src="about:blank" style="width:800px;height:400px"></iframe>
      <div style="height:5000px"></div></body>`);
    await new Promise(r => setTimeout(r, 2200));
    check('无视频页面（含空 .player / about:blank iframe / article 块）不滚动', !isScrolled());
  }

  // 2) 视频页面：裸 <video>（暂停 + play 被拒）→ 仍会定位（不依赖"播起来"）
  {
    const { doc, isScrolled } = setup(`<body><div style="height:3000px"></div>
      <video id="v" src="x.mp4" width="640" height="360"></video></body>`);
    stubVideo(doc.getElementById('v'), 1280, 720, { paused: true, play: () => Promise.reject(new Error('blocked')) });
    await new Promise(r => setTimeout(r, 2200));
    check('裸 video（暂停且 play 被拒）仍会定位', isScrolled());
  }

  // 3) 零尺寸 video 装在 .ql-video 容器里 → 定位容器
  {
    const { doc, isScrolled } = setup(`<body>
      <div class="ql-video"><video id="v" src="x.m3u8"></video></div>
      <div style="height:4000px"></div></body>`);
    stubVideo(doc.getElementById('v'), 0, 0, { paused: true });
    await new Promise(r => setTimeout(r, 2200));
    check('零尺寸 video 装在 .ql-video 容器 → 定位容器', isScrolled());
  }

  // 4) 跨域播放器：带视频信号的 iframe → 定位
  {
    const { isScrolled } = setup(`<body><div style="height:3000px"></div>
      <iframe src="https://player.vimeo.com/video/123" style="width:800px;height:400px"></iframe></body>`);
    await new Promise(r => setTimeout(r, 2200));
    check('视频信号 iframe（player.vimeo.com/video）→ 定位', isScrolled());
  }

  // 5) 广告 iframe（src 无视频信号）→ 不滚
  {
    const { isScrolled } = setup(`<body><div style="height:3000px"></div>
      <iframe src="https://ads.example.com/banner" style="width:800px;height:400px"></iframe></body>`);
    await new Promise(r => setTimeout(r, 2200));
    check('广告 iframe（无视频信号）不滚动', !isScrolled());
  }

  let pass = 0;
  for (const [n, ok] of results) { console.log((ok ? '✅' : '❌') + ' ' + n); if (ok) pass++; }
  console.log(`\n${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})();
