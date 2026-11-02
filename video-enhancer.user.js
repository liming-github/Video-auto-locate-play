// ==UserScript==
// @name         视频增强 · Video Enhancer
// @name:zh-CN   视频增强(左右快进/音量/自动播放/全屏/画中画)
// @namespace    https://github.com/USERNAME/dsh-video-enhancer
// @version      1.6.0
// @description  ←/→ 快退快进(10s) · ↑/↓ 音量 · 空格暂停 · 自动播放网页视频 · 回车/F 全屏 · ESC 退出并保持页面位置 · P 画中画 · M 静音 · 自动定位视频
// @description:en Arrow-key seek & volume, space pause, autoplay, Enter/F fullscreen with scroll restore, picture-in-picture, mute toggle
// @author       leon
// @license      MIT
// @homepageURL  https://github.com/USERNAME/dsh-video-enhancer
// @supportURL   https://github.com/USERNAME/dsh-video-enhancer/issues
// @updateURL    https://raw.githubusercontent.com/USERNAME/dsh-video-enhancer/main/video-enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/USERNAME/dsh-video-enhancer/main/video-enhancer.user.js
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ======== 可调参数 ======== */
  var STEP = 10;          // 快进/快退秒数
  var VOL_STEP = 0.1;     // 音量步长
  var SHOW_TOAST = true;  // 顶部提示
  var AUTOPLAY = true;    // 自动播放页面里的视频
  var AUTOPLAY_MUTED = true; // 被浏览器拦截时先静音播放
  var MIN_SIZE = 150;     // 小于这个尺寸的 video 视为广告/装饰，不自动播放
  var AUTO_SCROLL = true; // 自动滚动到视频位置（长页面免手动找）
  var RESTORE_SCROLL_ON_EXIT = true; // 退出全屏后回到视频所在位置（而不是页面顶部）
  var SCROLL_IF_OFFSCREEN = true; // 只在视频不在可视区时才滚
  /* ========================= */

  var toastEl = null, toastTimer = null;
  var AP_KEY = 'va_autoplay_' + location.hostname;

  function isEditable(el) {
    if (!el) return false;
    var t = (el.tagName || '').toUpperCase();
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true;
    if (el.isContentEditable) return true;
    if (t === 'BUTTON' || t === 'A') return true;
    return false;
  }

  function vids() {
    return Array.prototype.slice.call(document.querySelectorAll('video')).filter(function (v) {
      return v && v.duration && isFinite(v.duration) && v.duration > 1 && v.readyState > 0;
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

  function toast(text) {
    if (!SHOW_TOAST) return;
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
        (document.body || document.documentElement).appendChild(toastEl);
      }
      toastEl.textContent = text;
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

  function toggleFullscreen(v) {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
        toast('退出全屏');
        return;
      }
      var el = v;
      var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (!fn) {
        var wrap = v.closest('div,video') || v.parentElement;
        fn = wrap && (wrap.requestFullscreen || wrap.webkitRequestFullscreen);
        el = wrap;
      }
      if (!fn) { toast('这个播放器不支持全屏 API'); return; }
      if (el === v && v.controls === false) { v.controls = true; }
      var p = fn.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(function(){ toast('⛶ 全屏'); }).catch(function(){ toast('全屏被浏览器拦截，先点一下页面再按 F'); });
      else toast('⛶ 全屏');
    } catch (e) { toast('全屏失败'); }
  }

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
    try { var v = localStorage.getItem(AP_KEY); if (v === '0') return false; } catch (e) {}
    return true;
  }

  function tryPlay(v) {
    if (!v || v.ended) return;
    var p = v.play();
    if (p && p.then) { p.then(function(){ scrollToVideo(v); }).catch(function(){}); }
    if (p && p.catch) {
      p.catch(function () {
        if (!AUTOPLAY_MUTED) return;
        v.muted = true;
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
    var list = vids();
    list.forEach(function (v) {
      if (v.dataset.vaAutoDone) return;
      var w = v.clientWidth || v.videoWidth || 0;
      var h = v.clientHeight || v.videoHeight || 0;
      if (w < MIN_SIZE || h < MIN_SIZE) return;
      if (!v.paused) { v.dataset.vaAutoDone = '1'; return; }
      v.dataset.vaAutoDone = '1';
      tryPlay(v);
    });
  }

  var apTimer = setInterval(autoPlayAll, 1500);
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
    if (isEditable(e.target) || isEditable(document.activeElement)) return;

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

    if (isEnter || isFs) {
      stop(e);
      toggleFullscreen(v);
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
      if (!v.muted && v.volume === 0) v.volume = 0.5;
      toast(v.muted ? '🔇 已静音' : '🔊 已开声音');
      return;
    }

    if (isSeek) {
      stop(e);
      var back = (k === 'ArrowLeft');
      var d = v.duration || 0;
      var t = v.currentTime + (back ? -STEP : STEP);
      if (t < 0) t = 0;
      if (d && t > d - 0.2) t = Math.max(0, d - 0.2);
      try { v.currentTime = t; } catch (err) {}
      toast((back ? '⏪ -' : '⏩ +') + STEP + 's   ' + fmt(t) + ' / ' + fmt(d));
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
      toast((up ? '🔊 +' : '🔉 -') + Math.round(VOL_STEP * 100) + '%   ' + '█'.repeat(n) + '░'.repeat(10 - n) + '  ' + Math.round(vol * 100) + '%');
    }
  }

  function stop(e) {
    e.preventDefault(); e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  window.addEventListener('keydown', onKey, true);
  document.addEventListener('keydown', onKey, true);

  /* ---------- 站点开关：Shift+Alt+A 切换本站自动播放 ---------- */
  document.addEventListener('keydown', function (e) {
    if (!(e.shiftKey && e.altKey && (e.key === 'a' || e.key === 'A'))) return;
    var cur = autoplayOn();
    try { localStorage.setItem(AP_KEY, cur ? '0' : '1'); } catch (err) {}
    toast(cur ? '⏹ 本站已关闭自动播放（重载后生效）' : '▶️ 本站已开启自动播放（重载后生效）');
  }, true);
})();
