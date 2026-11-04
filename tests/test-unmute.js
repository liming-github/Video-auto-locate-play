const { JSDOM } = require('/tmp/vtest/node_modules/jsdom');
const fs = require('fs');
const src = fs.readFileSync('../video-enhancer.user.js','utf8');
const dom = new JSDOM(`<body><video id="v" src="x.mp4"></video></body>`,
  { url:'https://hsck123.25img.com/v/1', pretendToBeVisual:true, runScripts:'outside-only' });
const { window } = dom, doc = window.document;
const v = doc.getElementById('v');
let paused = false;          // 自动播放中
let muted = true;            // 静音
let volume = 1;
Object.defineProperty(v,'paused',{get:()=>paused,configurable:true});
Object.defineProperty(v,'ended',{get:()=>false,configurable:true});
Object.defineProperty(v,'muted',{get:()=>muted,set:(x)=>{muted=x; v.dispatchEvent(new window.Event('volumechange'));},configurable:true});
Object.defineProperty(v,'volume',{get:()=>volume,set:(x)=>{volume=x; v.dispatchEvent(new window.Event('volumechange'));},configurable:true});
Object.defineProperty(v,'videoWidth',{get:()=>1280,configurable:true});
Object.defineProperty(v,'videoHeight',{get:()=>720,configurable:true});
Object.defineProperty(v,'currentTime',{get:()=>0,set:()=>{},configurable:true});
Object.defineProperty(v,'duration',{get:()=>100,configurable:true});
v.play = () => { paused = false; return Promise.resolve(); };
v.pause = () => { paused = true; };
v.getBoundingClientRect = () => ({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
// 模拟站点：只要发现静音被解除就马上再静音（顽固站点）
let remute = 0; v.addEventListener('volumechange', () => { if (!muted && remute < 2) { remute++; setTimeout(()=>{ muted = true; }, 50); } });
window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
window.eval(src);

doc.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft',bubbles:true,cancelable:true}));
setTimeout(() => {
  const ok = (muted === false) && (volume >= 0.5);
  console.log((ok?'✅':'❌') + ' 按←后视频真正解除静音 (muted=' + muted + ', volume=' + volume.toFixed(2) + ')');
  process.exit(ok?0:1);
}, 900);
