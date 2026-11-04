const { JSDOM } = require('/tmp/vtest/node_modules/jsdom');
const fs = require('fs');
const src = fs.readFileSync('../video-enhancer.user.js','utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dom=new JSDOM(`<body><video id="a" src="a.mp4"></video><video id="b" src="b.mp4"></video></body>`,{url:'https://91porna.com/x',pretendToBeVisual:true,runScripts:'outside-only'});
const {window}=dom, doc=window.document;
function stub(v,i){ let paused=true;
  Object.defineProperty(v,'paused',{get:()=>paused,configurable:true});
  Object.defineProperty(v,'ended',{get:()=>false,configurable:true});
  Object.defineProperty(v,'muted',{get:()=>false,set:()=>{},configurable:true});
  Object.defineProperty(v,'volume',{get:()=>0.5,set:()=>{},configurable:true});
  Object.defineProperty(v,'videoWidth',{get:()=>1280,configurable:true});
  Object.defineProperty(v,'videoHeight',{get:()=>720,configurable:true});
  Object.defineProperty(v,'currentTime',{get:()=>0,set:()=>{},configurable:true});
  Object.defineProperty(v,'duration',{get:()=>100,configurable:true});
  v.play=()=>{paused=false;v.dispatchEvent(new window.Event('play'));return Promise.resolve();};
  v.pause=()=>{paused=true;v.dispatchEvent(new window.Event('pause'));};
  v.getBoundingClientRect=()=>({top:i*600,bottom:i*600+500,left:0,right:800,width:800,height:500,x:0,y:i*600});
}
const a=doc.getElementById('a'), b=doc.getElementById('b');
stub(a,0); stub(b,1);
window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
window.eval(src);
(async()=>{
  a.play(); await sleep(50);
  b.play(); a.pause();            // 悬停到 b：a 暂停
  await sleep(100);
  b.pause();                      // 用户暂停 b
  await sleep(200);
  a.play();                       // 站点把视野外的 a 又播起来
  await sleep(600);
  const ok1 = a.paused === true;
  b.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true}));
  b.play(); await sleep(300);
  const ok2 = b.paused === false;
  console.log((ok1?'✅':'❌')+' 暂停 b 后，视野外的 a 被站点播起来会被压回');
  console.log((ok2?'✅':'❌')+' b 仍可正常点击播放');
  process.exit(ok1&&ok2?0:1);
})();
