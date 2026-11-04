const { JSDOM } = require('/tmp/vtest/node_modules/jsdom');
const fs = require('fs');
const src = fs.readFileSync('../video-enhancer.user.js','utf8');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const results=[]; const check=(n,c)=>results.push([n,c]);

function make(url){
  const dom = new JSDOM(`<body><video id="v" src="x.mp4"></video></body>`,{url,pretendToBeVisual:true,runScripts:'outside-only'});
  const { window } = dom, doc = window.document;
  const v = doc.getElementById('v');
  let paused=true;
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
  v.getBoundingClientRect=()=>({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
  window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
  window.eval(src);
  return { window, doc, v };
}

(async()=>{
  // A) 站点自己恢复（无用户输入）→ 被压回暂停
  const a = make('https://hsck123.25img.com/v');
  a.v.play(); await sleep(50); a.v.pause();       // 用户暂停
  await sleep(200); a.v.play();                   // 站点 200ms 后自己恢复（无输入）
  await sleep(300);
  check('站点无输入自动恢复 → 压回暂停', a.v.paused === true);

  // B) 用户点播放 → 保持播放
  const b = make('https://hsck123.25img.com/v');
  b.v.play(); await sleep(50); b.v.pause(); await sleep(150);
  b.v.dispatchEvent(new b.window.MouseEvent('pointerdown',{bubbles:true}));
  b.v.play(); await sleep(300);
  check('用户点播放 → 保持播放（不误伤）', b.v.paused === false);

  let pass=0; results.forEach(([n,ok])=>{console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;});
  console.log(`\n${pass}/${results.length} 通过`); process.exit(pass===results.length?0:1);
})();
