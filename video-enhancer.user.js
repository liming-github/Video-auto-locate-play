// ==UserScript==
// @name         Long-page auto-positioning & autoplay ↔ Fast forward/rewind ｜ 长页面自动定位播放视频 ↔ 快进快退
// @name:en      Long-page auto-positioning & autoplay ↔ Fast forward/rewind
// @name:zh-CN   长页面自动定位播放视频 ↔ 快进快退
// @namespace    https://github.com/liming-github/Video-auto-locate-play
// @version      1.21.0
// @description  长页面自动定位视频并自动播放；←/→ 快进快退10秒（无需点进度条）· ↑/↓ 音量 · 空格暂停 · 回车/F 全屏 · ESC 退出并回到原位 · P 画中画 · M 静音。支持 iframe 播放器，不干扰输入框。
// @description:en Auto-scrolls to the video and autoplays it; arrow keys seek ±10s without focusing the progress bar, plus volume, pause, fullscreen with scroll restore, picture-in-picture and mute.
// @author       leon (liming-github)
// @license      MIT
// @homepageURL  https://github.com/liming-github/Video-auto-locate-play
// @supportURL   https://github.com/liming-github/Video-auto-locate-play/issues
// @match        *://*/*
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  /* ======== 可调参数 ======== */
  var STEP = 10;          // 快进/快退秒数
  var VOL_STEP = 0.1;     // 音量步长
  var SHOW_TOAST = false;  // 快进/快退等提示（默认关闭）
  var VOLUME_TOAST = true; // 音量提示（默认开启）
  var AUTOPLAY = true;    // 自动播放页面里的视频
  var AUTOPLAY_MUTED = true; // 被浏览器拦截时先静音播放
  var MIN_SIZE = 150;     // 小于这个尺寸的 video 视为广告/装饰，不自动播放
  var AUTO_SCROLL = true; // 自动滚动到视频位置（长页面免手动找）
  var RESTORE_SCROLL_ON_EXIT = true; // 退出全屏后回到视频所在位置（而不是页面顶部）
  var SCROLL_IF_OFFSCREEN = true; // 只在视频不在可视区时才滚
  /* ========================= */

  var toastEl = null, toastTimer = null;
  var AP_KEY = 'va_autoplay_' + location.hostname;
  var USER_EXEMPT_KEY = 'va_user_exempt_hosts';

  function gmGet(k) {
    try { if (typeof GM_getValue === 'function') return GM_getValue(k, ''); } catch (e) {}
    return '';
  }
  function gmSet(k, v) {
    try { if (typeof GM_setValue === 'function') { GM_setValue(k, v); return true; } } catch (e) {}
    return false;
  }
  function userExemptList() {
    var raw = gmGet(USER_EXEMPT_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw) || []; } catch (e) { return []; }
  }
  function saveUserExempt(list) {
    gmSet(USER_EXEMPT_KEY, JSON.stringify(list));
  }
  function isUserExempt(host) {
    return userExemptList().some(function (r) { return hostMatches(host, r); });
  }

  // 自带完善播放体验的站点：默认不做自动播放/自动定位（快捷键仍然可用）
  var EXEMPT_HOSTS = [
    'bilibili.com', 'b23.tv', 'youtube.com', 'youtu.be',
    'netflix.com', 'disneyplus.com', 'primevideo.com', 'hulu.com',
    'iqiyi.com', 'v.qq.com', 'youku.com', 'mgtv.com',
    'bilibili.tv', 'douyin.com', 'kuaishou.com', 'xiaohongshu.com',
    'spotify.com', 'music.apple.com', 'music.163.com', 'y.qq.com',
    'migu.cn', 'sohu.com', 'pptv.com', 'le.com',
    '1905.com', 'douban.com', 'weibo.com', 'zhihu.com',
    'ixigua.com', 'hbomax.com', 'max.com', 'paramountplus.com',
    'peacocktv.com', 'twitch.tv', 'vimeo.com', 'soundcloud.com',
    'tidal.com', 'deezer.com'
  ];

  function hostMatches(host, rule) {
    return host === rule || host.endsWith('.' + rule);
  }

  function hostExempt() {
    try {
      var h = location.hostname.toLowerCase();
      return EXEMPT_HOSTS.some(function (r) { return hostMatches(h, r); }) || isUserExempt(h);
    } catch (e) { return false; }
  }

  // 站点级覆盖：localStorage 存 '1'(强制开) / '0'(强制关)，无值则按默认（例外站点关，其它开）
  function siteState() {
    try {
      var v = localStorage.getItem(AP_KEY);
      if (v === '1') return 'on';
      if (v === '0') return 'off';
    } catch (e) {}
    return hostExempt() ? 'off' : 'on';
  }

  function isEditable(el) {
    if (!el) return false;
    var t = (el.tagName || '').toUpperCase();
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true;
    if (el.isContentEditable) return true;
    if (t === 'BUTTON' || t === 'A') return true;
    return false;
  }

  // 只有真正的文本输入区算"硬可编辑"（输入框/文本域/可编辑区）
  function isTextEditable(el) {
    if (!el) return false;
    var t = (el.tagName || '').toUpperCase();
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true;
    return !!el.isContentEditable;
  }

  // 找不到 <video> 时，尝试把一个"像播放器"的大 iframe 当作全屏目标
  function pickFrame() {
    try {
      var frames = Array.prototype.slice.call(document.querySelectorAll('iframe'));
      frames = frames.filter(function (f) {
        var r = f.getBoundingClientRect();
        return r.width >= 300 && r.height >= 180 && r.top < (window.innerHeight || 800) + 400;
      });
      if (!frames.length) return null;
      frames.sort(function (a, b) {
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return (rb.width * rb.height) - (ra.width * ra.height);
      });
      return frames[0];
    } catch (e) { return null; }
  }

  // 收集页面里所有可用 video（含同源 iframe 内部），不再强制要求 duration 有限
  function vids() {
    var out = [];
    function collect(doc) {
      if (!doc) return;
      try {
        var list = doc.querySelectorAll('video');
        for (var i = 0; i < list.length; i++) out.push(list[i]);
      } catch (e) {}
      try {
        var frames = doc.querySelectorAll('iframe');
        for (var j = 0; j < frames.length; j++) {
          try { if (frames[j].contentDocument) collect(frames[j].contentDocument); } catch (e) {}
        }
      } catch (e) {}
    }
    collect(document);
    return out.filter(function (v) {
      if (!v) return false;
      // 有尺寸即可（很多播放器 src 未就绪时 duration 为 NaN/Infinity）
      var w = v.videoWidth || v.clientWidth || 0;
      var h = v.videoHeight || v.clientHeight || 0;
      return w > 80 && h > 45;
    });
  }

  function pickVideo() {
    var list = vids();
    if (!list.length) return null;
    var playing = list.filter(function (v) { return !v.paused && !v.ended; });
    if (playing.length) return playing[0];
    list.sort(function (a, b) {
      return (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight);
    });
    return list[0];
  }

  function hudHost() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.body || document.documentElement;
  }

  function toastRaw(text, opts) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = [
          'position:fixed', 'left:50%', 'top:12%', 'transform:translateX(-50%)',
          'padding:8px 16px', 'border-radius:10px', 'background:rgba(0,0,0,.75)',
          'color:#fff', 'font:600 16px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
          'z-index:2147483647', 'pointer-events:none', 'opacity:0',
          'transition:opacity .15s', 'white-space:nowrap'
        ].join(';');
        hudHost().appendChild(toastEl);
      }
      try { var host = hudHost(); if (toastEl.parentNode !== host) host.appendChild(toastEl); } catch (e) {}
      if (opts && opts.type === 'volume') {
        var lv = Math.max(0, Math.min(1, opts.level || 0)), segs = 16, on = Math.round(lv * segs), bars = '';
        for (var i = 0; i < segs; i++) {
          bars += '<span style="display:inline-block;width:4px;height:' + (9 + i * 0.6) + 'px;margin-right:3px;border-radius:2px;background:' + (i < on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.25)') + '"></span>';
        }
        var ic = lv === 0 ? '🔇' : (lv < 0.4 ? '🔉' : '🔊');
        toastEl.innerHTML = '<span style="font-size:18px">' + ic + '</span><span style="display:inline-flex;align-items:flex-end;margin:0 8px">' + bars + '</span><span style="font-size:13px;opacity:.85">' + Math.round(lv*100) + '%</span>';
        toastEl.style.display = 'flex';
        toastEl.style.alignItems = 'center';
        toastEl.style.borderRadius = '16px';
        toastEl.style.background = 'rgba(28,28,30,.55)';
        toastEl.style.backdropFilter = 'blur(16px) saturate(160%)';
        toastEl.style.webkitBackdropFilter = 'blur(16px) saturate(160%)';
      } else {
        toastEl.textContent = text;
        toastEl.style.background = 'rgba(0,0,0,.75)';
        toastEl.style.borderRadius = '10px';
      }
      toastEl.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 900);
    } catch (e) {}
  }

  function scrollToVideo(v) {
    if (!AUTO_SCROLL || !v) return;
    try {
      if (v.dataset.vaScrolled) return;
      var r = v.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var offscreen = (r.bottom < 80) || (r.top > vh - 80);
      if (SCROLL_IF_OFFSCREEN && !offscreen) { v.dataset.vaScrolled = '1'; return; }
      v.dataset.vaScrolled = '1';
      v.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      toast('⬇️ 已定位到视频');
    } catch (e) {}
  }

  function toggleFullscreen(v, altEl) {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
        toast('退出全屏');
        return;
      }
      var el = v || altEl;
      if (!el) { toast('没有可全屏的播放器'); return; }
      var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (!fn) {
        var wrap = (el.closest && el.closest('div,video')) || el.parentElement;
        fn = wrap && (wrap.requestFullscreen || wrap.webkitRequestFullscreen);
        el = wrap;
      }
      if (!fn) { toast('这个播放器不支持全屏 API'); return; }
      if (v && el === v && v.controls === false) { v.controls = true; }
      var p = fn.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(function(){ toast('⛶ 全屏'); }).catch(function(){ toast('全屏被浏览器拦截，先点一下页面再按 F'); });
      else toast('⛶ 全屏');
    } catch (e) { toast('全屏失败'); }
  }

  function toast(text) { if (SHOW_TOAST) toastRaw(text); }
  function toastVol(text) { if (VOLUME_TOAST) toastRaw(text); }

  function fmt(s) {
    if (!isFinite(s)) return '--:--';
    s = Math.max(0, Math.floor(s));
    var m = Math.floor(s / 60), ss = s % 60, h = Math.floor(m / 60);
    m = m % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' : '') + p(m) + ':' + p(ss);
  }

  /* ---------- 全屏前后的滚动位置保护 ---------- */
  var savedScrollY = null;
  var savedVideo = null;

  function onFullscreenChange() {
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      // 进入全屏：记住当前滚动位置和视频
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      savedVideo = pickVideo();
      return;
    }
    // 退出全屏：还原位置
    if (!RESTORE_SCROLL_ON_EXIT) return;
    var y = savedScrollY, v = savedVideo;
    if (!v && !y) return;
    [0, 120, 400, 800].forEach(function (delay) {
      setTimeout(function () {
        try {
          if (v && v.isConnected) {
            var r = v.getBoundingClientRect();
            var vh = window.innerHeight || document.documentElement.clientHeight;
            var visible = r.bottom > 60 && r.top < vh - 60;
            if (!visible) {
              v.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
              toast('↩️ 已回到视频位置');
            }
          } else if (typeof y === 'number') {
            window.scrollTo(0, y);
          }
        } catch (e) {}
      }, delay);
    });
    savedScrollY = null;
    savedVideo = null;
  }

  document.addEventListener('fullscreenchange', onFullscreenChange, true);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange, true);

  /* ---------- 自动播放 ---------- */
  function autoplayOn() {
    if (!AUTOPLAY) return false;
    return siteState() === 'on';
  }

  // 浏览器禁止无手势有声播放：脚本先静音播起来，等用户第一次交互后自动恢复声音
  var unmuteArmed = false;
  function armUnmuteOnGesture() {
    if (unmuteArmed) return;
    unmuteArmed = true;
    function unlock() {
      var list = Array.prototype.slice.call(document.querySelectorAll('video'));
      var changed = 0;
      list.forEach(function (v) {
        if (v.dataset.vaAutoMuted === '1' && v.dataset.vaUserMuted !== '1') {
          v.muted = false;
          if (v.volume === 0) v.volume = 0.6;
          delete v.dataset.vaAutoMuted;
          changed++;
        }
      });
      if (changed) toastVol('🔊 已自动开启声音（按 M 可静音）');
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
      unmuteArmed = false;
    }
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('touchstart', unlock, true);
  }

  function tryPlay(v) {
    if (!v || v.ended) return;
    var p = v.play();
    if (p && p.then) { p.then(function(){ v.dataset.vaTries = '0'; scrollToVideo(v); }).catch(function(){}); }
    if (p && p.catch) {
      p.catch(function () {
        if (!AUTOPLAY_MUTED) return;
        v.muted = true;
        v.dataset.vaAutoMuted = '1';   // 记录：是脚本为绕过自动播放限制而静音的
        armUnmuteOnGesture();
        var p2 = v.play();
        if (p2 && p2.then) {
          p2.then(function () {
            toast('▶️ 自动播放（已静音）   按 M 开声音');
            scrollToVideo(v);
          }).catch(function () {});
        }
      });
    }
  }

  function autoPlayAll() {
    if (!autoplayOn()) return;
    vids().forEach(function (v) {
      var w = v.clientWidth || v.videoWidth || 0;
      var h = v.clientHeight || v.videoHeight || 0;
      if (w < MIN_SIZE || h < MIN_SIZE) return;
      if (!v.paused && !v.ended) { v.dataset.vaTries = '0'; return; }
      // 首次发现：滚动到播放器（即使还没播起来）
      scrollToVideo(v);
      var tries = parseInt(v.dataset.vaTries || '0', 10);
      if (tries >= 25) return;                     // 最多试 25 次（约 37 秒）
      v.dataset.vaTries = String(tries + 1);
      tryPlay(v);
    });
  }

  // 统一定位：在所有候选里挑「面积最大的真实播放器」，滚到视野中央并做一次纠偏
  function findPlayerTarget() {
    var cands = [];
    function push(el, force) {
      if (!el || el.tagName === 'BODY') return;
      var r = el.getBoundingClientRect();
      var w = r.width || el.clientWidth || 0, h = r.height || el.clientHeight || 0;
      var hasPlayer = false;
      try { hasPlayer = !!(el.querySelector && el.querySelector('video,iframe')) || el.tagName === 'IFRAME' || el.tagName === 'VIDEO'; } catch (e) {}
      if (!force && (w < 300 || h < 150) && !hasPlayer) return;
      if (w < 40 && h < 40 && !hasPlayer) return;
      cands.push({ el: el, area: Math.max(w * h, hasPlayer ? 300 * 150 : 0) });
    }
    // 1) 已知播放器容器
    ['.dplayer', '.ql-video', '.art-video-player', '.video-js', '.plyr', '#dplayer', '#player',
     '[class*="video-wrap"]', '[class*="video-wrapper"]', '[class*="video-container"]', '[class*="player"]'
    ].forEach(function (sel) {
      try { document.querySelectorAll(sel).forEach(push); } catch (e) {}
    });
    // 2) 任何足够大的 iframe（跨域播放器只能定位到 iframe 本身）
    try {
      document.querySelectorAll('iframe').forEach(function (f) {
        var r = f.getBoundingClientRect();
        if ((r.width || 0) >= 300 && (r.height || 0) >= 150) push(f);
      });
    } catch (e) {}
    // 3) 裸 <video>
    try { document.querySelectorAll('video').forEach(push); } catch (e) {}
    if (!cands.length) return null;
    cands.sort(function (a, b) { return b.area - a.area; });
    return cands[0].el;
  }

  function scrollToTarget(el) {
    if (!el) return false;
    var vh = window.innerHeight || 800;
    var r = el.getBoundingClientRect();
    var inView = r.bottom > 90 && r.top < vh - 90;
    if (inView) { window.__vaBoxDone = 1; return true; }
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch (e) {}
    // 纠偏：800ms 后若仍不在视野，用绝对位置再滚一次
    setTimeout(function () {
      try {
        var rr = el.getBoundingClientRect();
        if (!(rr.bottom > 90 && rr.top < vh - 90)) {
          var top = rr.top + (window.scrollY || window.pageYOffset || 0);
          window.scrollTo({ top: Math.max(0, top - Math.round(vh * 0.3)), behavior: 'smooth' });
        }
      } catch (e) {}
    }, 800);
    window.__vaBoxDone = 1;
    toast('⬇️ 已定位到播放器');
    return true;
  }

  function scrollToPlayerBox() {
    try {
      if (!AUTO_SCROLL) return;
      if (siteState() !== 'on') return;
      if (window.__vaBoxDone) return;
      var el = findPlayerTarget();
      if (!el) return;                  // 没有真实播放器 → 不动页面
      scrollToTarget(el);
    } catch (e) {}
  }

  var apTimer = setInterval(function(){ autoPlayAll(); scrollToPlayerBox(); }, 1500);
  window.addEventListener('load', function () { setTimeout(autoPlayAll, 300); });

  try {
    var mo = new MutationObserver(function () {
      if (!autoplayOn()) return;
      if (!document.querySelector('video')) return;
      autoPlayAll();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* ---------- 快捷键 ---------- */
  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (isTextEditable(e.target) || isTextEditable(document.activeElement)) return;
    var softEdit = isEditable(e.target) || isEditable(document.activeElement); // 含按钮/链接

    var k = e.key;
    var isSeek = (k === 'ArrowLeft' || k === 'ArrowRight');
    var isVol  = (k === 'ArrowUp'   || k === 'ArrowDown');
    var isSpace = (k === ' ' || k === 'Spacebar' || e.code === 'Space');
    var isPip  = (k === 'p' || k === 'P');
    var isFs   = (k === 'f' || k === 'F');
    var isLoc  = (k === 'v' || k === 'V');
    var isEnter= (k === 'Enter' || k === 'NumpadEnter');
    var isEsc  = (k === 'Escape' || k === 'Esc');
    var isMute = (k === 'm' || k === 'M');

    if (!isSeek && !isVol && !isSpace && !isPip && !isMute && !isFs && !isLoc && !isEnter && !isEsc) return;

    var v = pickVideo();
    var fr = v ? null : pickFrame();
    if (!v && !fr) return;

    // Enter：只要页面上有播放器就接管，避免被页面的链接/表单当成"打开/刷新"
    if (isEnter) {
      stop(e);
      toggleFullscreen(v, fr);
      return;
    }

    // 其余快捷键：焦点在按钮/链接上就让给页面；且必须真有 <video>
    if (softEdit) return;
    if (!v) return;

    if (isSpace) {
      stop(e);
      if (v.paused || v.ended) { v.play().catch(function(){}); toast('▶️ 播放'); }
      else { v.pause(); toast('⏸ 暂停'); }
      return;
    }

    if (isEsc) {
      var fsNow = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsNow) return;              // 不在全屏就不抢 ESC，交给页面
      stop(e);
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
      toast('已退出全屏');
      return;
    }

    if (isFs) {
      stop(e);
      toggleFullscreen(v, fr);
      return;
    }

    if (isLoc) {
      stop(e);
      v.dataset.vaScrolled = '';
      scrollToVideo(v);
      v.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      return;
    }

    if (isPip) {
      stop(e);
      try {
        if (document.pictureInPictureElement) { document.exitPictureInPicture(); toast('已退出画中画'); }
        else if (v.requestPictureInPicture) { v.requestPictureInPicture().then(function(){ toast('🪟 画中画已开启'); }).catch(function(){ toast('这个播放器不支持画中画'); }); }
      } catch (err) { toast('画中画不可用'); }
      return;
    }

    if (isMute) {
      stop(e);
      v.muted = !v.muted;
      v.dataset.vaUserMuted = v.muted ? '1' : '0';
      delete v.dataset.vaAutoMuted;
      if (!v.muted && v.volume === 0) v.volume = 0.5;
      toastRaw(v.muted ? '🔇 已静音' : '🔊 已开声音');
      return;
    }

    if (isSeek) {
      stop(e);
      var back = (k === 'ArrowLeft');
      var dur = v.duration;
      var finite = isFinite(dur) && dur > 0;
      var t = (v.currentTime || 0) + (back ? -STEP : STEP);
      if (t < 0) t = 0;
      if (finite && t > dur - 0.2) t = Math.max(0, dur - 0.2);
      try { v.currentTime = t; } catch (err) {}
      toast(finite
        ? ((back ? '⏪ -' : '⏩ +') + STEP + 's   ' + fmt(t) + ' / ' + fmt(dur))
        : ((back ? '⏪ -' : '⏩ +') + STEP + 's   ' + fmt(t)));
      return;
    }

    if (isVol) {
      stop(e);
      var up = (k === 'ArrowUp');
      var vol = (v.volume || 0) + (up ? VOL_STEP : -VOL_STEP);
      vol = Math.max(0, Math.min(1, Math.round(vol * 100) / 100));
      v.volume = vol;
      v.muted = (vol === 0);
      var n = Math.round(vol * 10);
      toastRaw('', { type: 'volume', level: vol });
    }
  }

  function stop(e) {
    e.preventDefault(); e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  // ===== 油猴菜单：明确的加入/移出 + 名单查看 + 逐条移除 =====
  try {
    if (typeof GM_registerMenuCommand === 'function') {
      var curHost = location.hostname.toLowerCase();
      var builtIn = EXEMPT_HOSTS.some(function (r) { return hostMatches(curHost, r); });
      var inCustom = isUserExempt(curHost);
      var isException = builtIn || inCustom;

      // ① 当前站点：内置例外只提示、不给加入；自定义可移出；其它可加入
      if (builtIn) {
        GM_registerMenuCommand('✅ 本站是默认例外（无需加入，也不允许加入）', function () {
          alert('✅ ' + curHost + ' 属于默认例外名单：\n\n脚本不会在这里自动播放或自动定位，'
              + '播放控制权交给网站本身。\n\n这是内置规则，无需也不能手动加入。\n'
              + '快捷键（←/→ 快进、↑/↓ 音量、空格、回车全屏）仍然可用。');
        });
      } else if (inCustom) {
        GM_registerMenuCommand('➖ 恢复本站「自动播放/定位」（当前：已加入例外）', function () {
          var list = userExemptList().filter(function (r) { return !hostMatches(curHost, r); });
          saveUserExempt(list);
          alert('已把 ' + curHost + ' 移出例外，恢复自动播放/定位。\n刷新页面生效');
        });
      } else {
        GM_registerMenuCommand('➕ 加入例外：让本站停止「自动播放/定位」', function () {
          var list = userExemptList();
          if (!list.some(function (r) { return hostMatches(curHost, r); })) list.push(curHost);
          saveUserExempt(list);
          alert('已把 ' + curHost + ' 加入例外：不再自动播放/定位。\n刷新页面生效');
        });
      }

      // ② 查看名单（内置 + 自定义）
      GM_registerMenuCommand('📋 查看例外名单', function () {
        var u = userExemptList();
        alert('【我添加的例外（可在菜单里逐条移除）】\n' + (u.length ? u.join('\n') : '（暂无）') +
              '\n\n注：B站、YouTube 等主流站是内置默认例外，不在此列表中，也无法添加或移除。');
      });

      // ③ 逐条移除（每条一个菜单项，带 ➖）
      userExemptList().slice(0, 20).forEach(function (host) {
        GM_registerMenuCommand('➖ 移除例外：' + host, function () {
          var list = userExemptList().filter(function (r) { return r !== host; });
          saveUserExempt(list);
          alert('已移除例外：' + host + '\n刷新页面后菜单会更新');
        });
      });
    }
  } catch (e) {}

  // 诊断：Shift+Alt+D 显示本页播放器检测结果（配合截图反馈）
  document.addEventListener('keydown', function (e) {
    if (!(e.shiftKey && e.altKey && (e.key === 'd' || e.key === 'D'))) return;
    try {
      var vs = document.querySelectorAll('video').length;
      var fs = document.querySelectorAll('iframe').length;
      var big = 0, list = [];
      document.querySelectorAll('video,iframe').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width >= 200 && r.height >= 100) big++;
        list.push(el.tagName + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + (el.src ? ' ' + String(el.src).slice(0, 40) : ''));
      });
      var t = findPlayerTarget();
      var info = '【诊断】\n<video>=' + vs + '  <iframe>=' + fs + '  可见播放器=' + big +
        '\n目标: ' + (t ? (t.tagName + '.' + (t.className || '').toString().slice(0, 40)) : '无') +
        '\n滚动状态: ' + (window.__vaBoxDone ? '已处理' : '未处理') +
        '\n列表:\n' + (list.slice(0, 6).join('\n') || '（无 video/iframe）');
      alert(info);
    } catch (err) {}
  }, true);

  window.addEventListener('keydown', onKey, true);
  document.addEventListener('keydown', onKey, true);

  /* ---------- 站点开关：Shift+Alt+A 切换本站自动播放 ---------- */
  document.addEventListener('keydown', function (e) {
    if (!(e.shiftKey && e.altKey && (e.key === 'a' || e.key === 'A'))) return;
    var cur = siteState();
    var next = cur === 'on' ? '0' : '1';
    try { localStorage.setItem(AP_KEY, next); } catch (err) {}
    toast(next === '0'
      ? '⏹ 本站已关闭「自动播放/自动定位」（快捷键仍可用）'
      : '▶️ 本站已开启「自动播放/自动定位」');
  }, true);
})();
