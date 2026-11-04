// ==UserScript==
// @name         Long-page auto-positioning & autoplay ↔ Fast forward/rewind ｜ 长页面自动定位播放视频 ↔ 快进快退
// @name:en      Long-page auto-positioning & autoplay ↔ Fast forward/rewind
// @name:zh-CN   长页面自动定位播放视频 ↔ 快进快退
// @namespace    https://github.com/liming-github/Video-auto-locate-play
// @version      1.53.0
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
  var INSTANCE_ID = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
  var HOVER_DWELL_MS = 700;
  var SWITCH_GUARD_MS = 3000;

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
        // 穿透 open shadow root（很多播放器把 video 放进 Shadow DOM）
        var hosts = doc.querySelectorAll('*');
        for (var k = 0; k < hosts.length; k++) {
          var sr = hosts[k].shadowRoot;
          if (sr) {
            var inner = sr.querySelectorAll('video');
            for (var j = 0; j < inner.length; j++) out.push(inner[j]);
          }
        }
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

  var activeVid = null;

  function topMost(list) {
    return list.slice().sort(function (a, b) {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    })[0];
  }

  function setActive(v) { if (v && v !== activeVid) activeVid = v; }

  function pickVideo() {
    var list = vids();
    if (!list.length) return null;
    if (activeVid && list.indexOf(activeVid) >= 0) return activeVid;
    var playing = list.filter(function (v) { return !v.paused && !v.ended; });
    if (playing.length) return topMost(playing);
    return topMost(list);
  }


  // 点击完全交给站点播放器（脚本不介入）

  // 用户点击/触摸时，取消尚未触发的悬停播放（否则"点暂停后 700ms 又被播起来"）
  ['pointerdown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function () { try { clearTimeout(window.__vaHoverTimer); } catch (e) {} }, true);
  });

  // 记录最后一次真实用户输入时间（用于区分"站点自己恢复播放"与"用户点了播放"）
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function () { window.__vaLastInput = Date.now(); PauseShield.release(); }, true);
  });

  // 任何"非脚本发起"的暂停 = 用户意图：本页此后不再自动播放
  var selfPausing = false;
  // ============ 暂停保护层（PauseShield）============
  // 统一处理"用户点了暂停，但视频又被重新播放"的所有情况：
  //   1) 本站脚本自己的自动播放循环     → 用户暂停后整个自动播放停手
  //   2) 站点在 pointerdown 就切换，脚本 click 再补一刀 → 脚本完全不接管点击
  //   3) 站点播放器自己反复调用 play()   → 临时拦截该视频的 play()
  //   4) 站点在 1~2 秒后自动恢复播放     → 拦截同样覆盖（不限时间窗口）
  var PauseShield = {
    blocked: [],          // 被拦截 play 的视频
    userActed: false,     // 用户是否已表达"我要播放"
    protect: function (v) {
      try {
        if (!v || v.tagName !== 'VIDEO') return;
        if (!v.__vaOrigPlay) {
          v.__vaOrigPlay = v.play;
          v.play = function () { return Promise.resolve(); };
          PauseShield.blocked.push(v);
        }
        try { v.pause(); } catch (e) {}
        window.__vaUserPausedOnce = true;   // 本页停止自动播放
        window.__vaLastPauseAt = Date.now();
      } catch (e) {}
    },
    release: function () {
      try {
        PauseShield.blocked.forEach(function (v) {
          if (v.__vaOrigPlay) { v.play = v.__vaOrigPlay; delete v.__vaOrigPlay; }
        });
      } catch (e) {}
      PauseShield.blocked = [];
      // 注意：不在这里清除 __vaUserPausedOnce，否则一次点击就会让自动播放复活
    }
  };

  document.addEventListener('pause', function (e) {
    try {
      if (selfPausing) return;                 // 脚本自己暂停的，不算用户意图
      var t = e.target;
      if (t && t.tagName === 'VIDEO') {
        window.__vaUserPausedOnce = true;
        window.__vaLastPauseAt = Date.now();
        var cnt = 0;
        try { cnt = document.querySelectorAll('video').length; } catch (e) { cnt = 1; }
        if (cnt <= 1) PauseShield.protect(t);   // 多视频页面拦截会导致"点不回播放"
      }
    } catch (err) {}
  }, true);

  // （旧的 play 事件防复播逻辑已移除：单视频页面由 PauseShield 拦截，多视频页面靠定位/自动播放收敛）

  // 点击某个视频后：如果它开始播放，就暂停其它所有视频（点哪个播哪个，其余停）
  document.addEventListener('click', function (e) {
    try {
      var t = e.target;
      if (!t || !t.tagName) return;
      var v = (t.tagName === 'VIDEO') ? t : null;
      if (!v) {
        var box = t.closest && t.closest('.ql-video, .xgplayer, .dplayer, .video-js, .plyr, #player, [class*="video-wrap"], [class*="video-container"]');
        if (box) v = box.querySelector('video');
      }
      if (!v) return;
      setActive(v);
      setTimeout(function () {
        try {
          if (!v.paused) {
            selfPausing = true;
            vids().forEach(function (o) { if (o !== v && !o.paused) { try { o.pause(); } catch (err) {} } });
            selfPausing = false;
          }
        } catch (err) {}
      }, 150);
    } catch (err) {}
  }, true);


  // 逐个视频绑定交互（Shadow DOM / 同源 iframe 内的事件也能收到；document 级监听在 Shadow 里会被重定向到 host）
  function bindVideo(v) {
    try {
      if (!v) return;
      // 每个脚本实例各自绑定（顶层实例也要给同源 iframe 里的视频绑，才能跨 frame 互相暂停）
      if (v.dataset.vaBoundBy === INSTANCE_ID) return;
      v.dataset.vaBoundBy = INSTANCE_ID;
      v.addEventListener('mouseenter', function () {
        onHoverVideo(v);
      }, true);
      v.addEventListener('click', function () {
        setActive(v);
        setTimeout(function () {
          try {
            if (!v.paused) {
              selfPausing = true;
              vids().forEach(function (o) { if (o !== v && !o.paused) { try { o.pause(); } catch (e) {} } });
              selfPausing = false;
            }
          } catch (e) {}
        }, 150);
      }, true);
    } catch (e) {}
  }

  // 悬停处理（与 document 级 mouseover 共用同一套判断）
  function onHoverVideo(t) {
    try {
      if (!t || t.tagName !== 'VIDEO' || t === activeVid) return;
      if (Date.now() - (window.__vaLastPauseAt || 0) < SWITCH_GUARD_MS) return;
      if (userPausedRecently(t)) return;
      setActive(t);
      try { clearTimeout(window.__vaHoverTimer); } catch (e) {}
      window.__vaHoverTimer = setTimeout(function () {
        if (Date.now() - (window.__vaLastInput || 0) < 900) return;
        selfPausing = true;
        vids().forEach(function (o) { if (o !== t && !o.paused) { try { o.pause(); } catch (e) {} } });
        selfPausing = false;
        if (t.paused) {
          window.__vaLastPauseAt = 0; window.__vaLastInput = Date.now();
          PauseShield.release();
          try { t.play().catch(function () {}); } catch (e) {}
        }
      }, HOVER_DWELL_MS);
    } catch (e) {}
  }

  document.addEventListener('mouseover', function (e) {
    try {
      var t = e.target;
      if (!t || t.tagName !== 'VIDEO' || t === activeVid) return;
      if (e.relatedTarget && t.contains && t.contains(e.relatedTarget)) return;
      if (Date.now() - (window.__vaLastPauseAt || 0) < SWITCH_GUARD_MS) return;
      if (userPausedRecently(t)) return;
      var prev = activeVid;
      if (!prev) {
        var playing = vids().filter(function (o) { return o !== t && !o.paused; });
        if (playing.length) prev = playing[0];
      }
      setActive(t);
      try { clearTimeout(window.__vaHoverTimer); } catch (e) {}
      window.__vaHoverTimer = setTimeout(function () {
        // 用户刚刚有操作（点击/按键）就不播，避免"点了暂停又被悬停播起来"
        if (Date.now() - (window.__vaLastInput || 0) < 900) return;
        try {
          // 悬停到哪个视频，就把其它正在播的全部暂停（之前只暂停"上一个"，其它仍在播）
          selfPausing = true;
          vids().forEach(function (o) { if (o !== t && !o.paused) { try { o.pause(); } catch (e) {} } });
          selfPausing = false;
          if (t.paused) {
            window.__vaLastPauseAt = 0;
            window.__vaLastInput = Date.now();
            PauseShield.release();
            try { t.play().catch(function () {}); } catch (e) {}
          }
        } catch (e) {}
      }, 700);
      t.addEventListener('mouseleave', function () { clearTimeout(window.__vaHoverTimer); }, { once: true });
    } catch (err) {}
  }, true);

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
      if (window.__vaLocatedOnce) return;      // 已经自动定位过一次，不再打扰
      if (v.dataset.vaScrolled) return;
      var r = v.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var offscreen = (r.bottom < 80) || (r.top > vh - 80);
      if (SCROLL_IF_OFFSCREEN && !offscreen) { v.dataset.vaScrolled = '1'; window.__vaLocatedOnce = true; return; }
      v.dataset.vaScrolled = '1';
      v.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      window.__vaLocatedOnce = true;
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
    if (window.__vaUserPausedOnce) return;      // 用户暂停过 → 本页不再自动播放
    if (Date.now() - (window.__vaLastInput || 0) < 1500) return;   // 用户刚点过，先别自动播
    var list = vids();
    list.forEach(bindVideo);
    if (!list.length) return;
    var target = (activeVid && list.indexOf(activeVid) >= 0) ? activeVid : list.slice().sort(function (a, b) {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    })[0];
    if (!target) return;
    var w = target.clientWidth || target.videoWidth || 0;
    var h = target.clientHeight || target.videoHeight || 0;
    if (w < MIN_SIZE || h < MIN_SIZE) return;
    if (!target.paused && !target.ended) { target.dataset.vaTries = '0'; return; }
    var tries = parseInt(target.dataset.vaTries || '0', 10);
    if (tries >= 25) return;
    target.dataset.vaTries = String(tries + 1);
    tryPlay(target);
  }

  // 兜底定位：优先精确的播放器容器；容器高度为 0 也能用 offsetTop 滚过去
  function scrollToPlayerBox() {
    try {
      if (!AUTO_SCROLL) return;
      if (siteState() !== 'on') return;
      if (window.__vaBoxDone || window.__vaLocatedOnce) return;
      var vh = window.innerHeight || 800;
      var scrollY = window.scrollY || window.pageYOffset || 0;

      function visible(el) {
        var r = el.getBoundingClientRect();
        return r.bottom > 80 && r.top < vh - 80 && r.height > 40;
      }

      function goto(el) {
        // 优先 scrollIntoView：能同时处理 window 滚动与内部滚动容器
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch (e) {}
        // 校验：等两次动画帧，仍未进入视野则用绝对位置兜底
        var tries = window.__vaScrollTries || 0;
        setTimeout(function () {
          if (visible(el)) { window.__vaBoxDone = 1; toast('⬇️ 已定位到播放器'); return; }
          var rect = el.getBoundingClientRect();
          var top = rect.top + (window.scrollY || window.pageYOffset || 0);
          window.scrollTo({ top: Math.max(0, top - Math.round(vh * 0.3)), behavior: 'smooth' });
          setTimeout(function () {
            if (visible(el)) { window.__vaBoxDone = 1; toast('⬇️ 已定位到播放器'); }
          }, 700);
        }, 700);
        // 允许最多重试 6 次（页面懒加载时容器位置会变）
        window.__vaScrollTries = tries + 1;
        if (window.__vaScrollTries >= 6) window.__vaBoxDone = 1;
        return true;
      }

      // 1) 精确选择器（即使高度为 0，也用 offsetTop 定位）
      var exact = ['.ql-video', '.dplayer', '#dplayer', '.art-video-player', '.video-js', '.plyr',
                   '#player', '.player', '[class*="video-wrap"]', '[class*="video-wrapper"]',
                   '[class*="video-container"]', '[class*="video-box"]', 'iframe[src*="play"]', 'iframe'];
      for (var i = 0; i < exact.length; i++) {
        var el = null;
        try { el = document.querySelector(exact[i]); } catch (e) {}
        if (el && el.tagName !== 'VIDEO') { if (goto(el)) return; }
      }

      // 2) 通用兜底：面积最大、宽≥260 的块
      var best = null, bestArea = 0;
      var list;
      try { list = document.querySelectorAll('.article-content div, .post-content div, article div, main div'); } catch (e) { list = []; }
      for (var j = 0; j < list.length && j < 800; j++) {
        var d = list[j], rr = d.getBoundingClientRect();
        if (rr.width >= 260 && rr.height >= 150) {
          var a = rr.width * rr.height;
          if (a > bestArea) { bestArea = a; best = d; }
        }
      }
      if (best) goto(best);
    } catch (e) {}
  }

  var apTimer = setInterval(function(){ autoPlayAll(); scrollToPlayerBox(); }, 1500);
  window.addEventListener('load', function () { setTimeout(autoPlayAll, 300); });

  try {
    var mo = new MutationObserver(function () {
      if (!autoplayOn()) return;
      if (window.__vaUserPausedOnce) return;
      if (!document.querySelector('video')) return;
      autoPlayAll();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* ---------- 快捷键 ---------- */

  // 载入后主动尝试：若浏览器允许，直接把声音打开（不需要用户按键）
  var autoUnmuteTries = 0;
  function autoUnmuteAttempt() {
    if (autoUnmuteTries >= 6) return;
    autoUnmuteTries++;
    try {
      Array.prototype.slice.call(document.querySelectorAll('video')).forEach(function (v) {
        if (v.dataset.vaUserMuted === '1') return;
        if (v.paused) return;
        if (v.muted || (v.volume || 0) === 0) {
          v.muted = false;
          if ((v.volume || 0) === 0) v.volume = 0.6;
        }
      });
    } catch (e) {}
    setTimeout(autoUnmuteAttempt, 700);
  }

  // 按键/点击都是用户手势：立刻把"为自动播放而静音"的视频恢复声音
  var unmuteTries = 0;
  function tryUnmuteAll() {
    try {
      var changed = 0;
      Array.prototype.slice.call(document.querySelectorAll('video')).forEach(function (v) {
        if (v.dataset.vaUserMuted === '1') return;         // 用户自己按 M 静音的，不动
        if (v.muted || (v.volume || 0) === 0) {
          v.muted = false;
          if ((v.volume || 0) === 0) v.volume = 0.6;
          delete v.dataset.vaAutoMuted;
          changed++;
        }
      });
      if (changed) toastVol('🔊 已开启声音');
      startUnmuteGuard();
      return changed;
    } catch (e) { return 0; }
  }


  // 手势后开启一个 2 秒的"防静音"守护：有些站点会把我们的解静音立刻改回去
  var guardTimer = null;
  function startUnmuteGuard() {
    if (guardTimer) return;
    var until = Date.now() + 2000;
    guardTimer = setInterval(function () {
      if (Date.now() > until) { clearInterval(guardTimer); guardTimer = null; return; }
      try {
        Array.prototype.slice.call(document.querySelectorAll('video')).forEach(function (v) {
          if (v.dataset.vaUserMuted === '1') return;
          if (v.muted) v.muted = false;
          if ((v.volume || 0) === 0) v.volume = 0.6;
        });
      } catch (e) {}
    }, 120);
  }
  function markUserPaused(v) {
    try { v.dataset.vaUserPausedAt = String(Date.now()); } catch (e) {}
  }
  function userPausedRecently(v) {
    try {
      var t = parseInt(v.dataset.vaUserPausedAt || '0', 10);
      return t && (Date.now() - t < 60000);   // 1 分钟内不自动恢复
    } catch (e) { return false; }
  }

  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (isTextEditable(e.target) || isTextEditable(document.activeElement)) return;
    // 任意按键都先尝试恢复声音（浏览器把按键视为用户手势）
    try { tryUnmuteAll(); } catch (err) {}
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
      if (v.paused || v.ended) { delete v.dataset.vaUserPausedAt; window.__vaUserPausedOnce = false; window.__vaLastPauseAt = 0; try { clearInterval(window.__vaPauseGuard); } catch (e) {} PauseShield.release(); v.play().catch(function(){}); toast('▶️ 播放'); }
      else { v.pause(); markUserPaused(v); toast('⏸ 暂停'); }
      return;
    }

    if (isEsc) {
      var fsNow = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsNow) return;              // 不在全屏就不抢 ESC，交给页面
      stop(e);
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
      toast('已退出全屏');
      setTimeout(function () {
        try {
          var cur = pickVideo();
          if (cur) { setActive(cur); cur.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); }
        } catch (err) {}
      }, 260);
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

  setTimeout(autoUnmuteAttempt, 1200);

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
