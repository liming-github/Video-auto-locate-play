const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'..','video-enhancer.user.js'),'utf8');
const dom = new JSDOM(`<body><video id="v" src="x.mp4"></video></body>`, { url:'https://x.com/v', pretendToBeVisual:true, runScripts:'outside-only' });
const { window } = dom, doc = window.document;
const v = doc.getElementById('v');
let paused = true, muted=false, volume=1;
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
window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
window.eval(src);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await sleep(600);            // 自动播放开始
  const wasPlaying = !v.paused;
  v.pause();                   // 用户点暂停
  await sleep(6000);           // 等 6 秒（越过 1.5s 轮询 + MutationObserver）
  const ok = v.paused === true;
  console.log((ok?'✅':'❌')+' 暂停后 6 秒仍保持暂停 (自动播放过='+wasPlaying+', 现在 paused='+v.paused+')');
  process.exit(ok?0:1);
})();
