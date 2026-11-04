const { JSDOM } = require('/tmp/vtest/node_modules/jsdom');
const fs = require('fs');
const src = fs.readFileSync('../video-enhancer.user.js','utf8');
const dom = new JSDOM(`<body><video id="v" src="x.mp4"></video></body>`,{url:'https://x.com/v',pretendToBeVisual:true,runScripts:'outside-only'});
const { window } = dom, doc = window.document;
const v = doc.getElementById('v');
let paused=true, muted=false, volume=1;
Object.defineProperty(v,'paused',{get:()=>paused,configurable:true});
Object.defineProperty(v,'ended',{get:()=>false,configurable:true});
Object.defineProperty(v,'muted',{get:()=>muted,set:x=>{muted=x;},configurable:true});
Object.defineProperty(v,'volume',{get:()=>volume,set:x=>{volume=x;},configurable:true});
Object.defineProperty(v,'videoWidth',{get:()=>1280,configurable:true});
Object.defineProperty(v,'videoHeight',{get:()=>720,configurable:true});
Object.defineProperty(v,'currentTime',{get:()=>0,set:()=>{},configurable:true});
Object.defineProperty(v,'duration',{get:()=>100,configurable:true});
v.play=()=>{paused=false;return Promise.resolve();};
v.pause=()=>{paused=true;};
v.getBoundingClientRect=()=>({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=(n)=>console.log('MENU:',n); window.alert=()=>{};
window.eval(src);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const r=[]; const ck=(n,c)=>r.push([n,c]);
  // 站点点击处理器（脚本不应干扰）
  let site=0; doc.body.addEventListener('click',()=>{site++; if(paused){v.play();}else{v.pause();}});
  v.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})); await sleep(120);
  ck('点击由站点处理（脚本不吞事件、不重复切换）', site===1 && v.paused===false);
  // 空格
  const before=v.paused;
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));
  await sleep(120);
  ck('空格切换播放/暂停', v.paused===!before);
  let pass=0; r.forEach(([n,ok])=>{console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;});
  console.log(`\n${pass}/${r.length} 通过`); process.exit(pass===r.length?0:1);
})();
