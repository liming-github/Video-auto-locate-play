const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'..','video-enhancer.user.js'),'utf8');
const dom = new JSDOM(`<body>
  <div class="ql-video"><video id="v" src="x.m3u8"></video></div>
  <div style="height:4000px"></div></body>`,
  { url:'https://c.com/watch/1', pretendToBeVisual:true, runScripts:'outside-only' });
const { window } = dom, doc = window.document;
let scrolled = false;
window.Element.prototype.scrollIntoView = function(){ scrolled = true; };
window.scrollTo = () => { scrolled = true; };
const v = doc.getElementById('v');
Object.defineProperty(v,'paused',{get:()=>true,configurable:true});
Object.defineProperty(v,'ended',{get:()=>false,configurable:true});
Object.defineProperty(v,'volume',{get:()=>0.5,set:()=>{},configurable:true});
Object.defineProperty(v,'muted',{get:()=>false,set:()=>{},configurable:true});
Object.defineProperty(v,'videoWidth',{get:()=>0,configurable:true});
Object.defineProperty(v,'videoHeight',{get:()=>0,configurable:true});
Object.defineProperty(v,'readyState',{get:()=>0,configurable:true});
Object.defineProperty(v,'currentTime',{get:()=>0,set:()=>{},configurable:true});
Object.defineProperty(v,'duration',{get:()=>NaN,configurable:true});
v.play = () => Promise.resolve();
v.pause = () => {};
window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
window.eval(src);
setTimeout(() => {
  console.log((scrolled?'✅':'❌') + ' 零尺寸播放器容器也会定位');
  process.exit(scrolled?0:1);
}, 2000);
