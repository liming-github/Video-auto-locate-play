const { JSDOM } = require('/tmp/vtest/node_modules/jsdom');
const fs = require('fs');
const src = fs.readFileSync('../video-enhancer.user.js','utf8');
const dom = new JSDOM(`<body><video id="v" src="x.mp4"></video></body>`, { url:'https://x.com/v', pretendToBeVisual:true, runScripts:'outside-only' });
const { window } = dom, doc = window.document;
const v = doc.getElementById('v');
let paused = false, muted=false, volume=1;
Object.defineProperty(v,'paused',{get:()=>paused,configurable:true});
Object.defineProperty(v,'ended',{get:()=>false,configurable:true});
Object.defineProperty(v,'muted',{get:()=>muted,set:x=>{muted=x;},configurable:true});
Object.defineProperty(v,'volume',{get:()=>volume,set:x=>{volume=x;},configurable:true});
Object.defineProperty(v,'videoWidth',{get:()=>1280,configurable:true});
Object.defineProperty(v,'videoHeight',{get:()=>720,configurable:true});
Object.defineProperty(v,'currentTime',{get:()=>0,set:()=>{},configurable:true});
Object.defineProperty(v,'duration',{get:()=>100,configurable:true});
v.play = () => { paused=false; v.dispatchEvent(new window.Event('play')); return Promise.resolve(); };
v.pause = () => { paused=true; v.dispatchEvent(new window.Event('pause')); };
v.getBoundingClientRect = () => ({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
try { window.localStorage.setItem('va_autoplay_x.com','0'); } catch(e){}
window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
window.eval(src);
(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  // 模拟：鼠标移入视频（触发 700ms 定时器）→ 200ms 后点暂停
  v.dispatchEvent(new window.MouseEvent('mouseover',{bubbles:true,cancelable:true}));
  await sleep(200);
  v.pause();
  await sleep(900);   // 定时器本应在此触发
  const ok = v.paused === true;
  console.log((ok?'✅':'❌') + ' 悬停过程中点暂停，1 秒后仍保持暂停 (paused='+v.paused+')');
  process.exit(ok?0:1);
})();
