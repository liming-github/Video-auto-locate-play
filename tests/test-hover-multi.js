const { JSDOM } = require('/tmp/vtest/node_modules/jsdom');
const fs = require('fs');
const src = fs.readFileSync('../video-enhancer.user.js','utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dom=new JSDOM(`<body>${[0,1,2].map(i=>`<video id="v${i}" src="x${i}.mp4"></video>`).join('')}</body>`,
 {url:'https://91porna.com/x',pretendToBeVisual:true,runScripts:'outside-only'});
const {window}=dom, doc=window.document;
const vs=[...doc.querySelectorAll('video')].map((v,i)=>{ let paused=true;
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
  v.getBoundingClientRect=()=>({top:i*800,bottom:i*800+600,left:0,right:800,width:800,height:600,x:0,y:i*800});
  return v; });
window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
window.eval(src);
(async()=>{
  const r=[]; const ck=(n,c)=>r.push([n,c]);
  vs[0].play(); await sleep(100);
  vs[1].dispatchEvent(new window.MouseEvent('mouseover',{bubbles:true,cancelable:true}));
  await sleep(900);
  ck('悬停第二个 → 第二个播放', vs[1].paused===false);
  ck('悬停第二个 → 第一个暂停', vs[0].paused===true);
  ck('第三个不受影响（仍暂停）', vs[2].paused===true);
  // 手动暂停第二个后，能再播放
  vs[1].pause(); await sleep(100);
  vs[1].play(); await sleep(200);
  ck('多视频页面：暂停后仍能播放', vs[1].paused===false);
  let pass=0; r.forEach(([n,ok])=>{console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;});
  console.log(`\n${pass}/${r.length} 通过`); process.exit(pass===r.length?0:1);
})();
