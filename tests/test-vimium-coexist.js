const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync('/Users/leonnas/projects/dsh-video-enhancer/video-enhancer.user.js','utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[]; const check=(n,c)=>results.push([n,c]);

function make(withVimium){
  const dom=new JSDOM(`<body>${withVimium?'<div class="vimiumUI"></div>':''}<video id="v" src="x.mp4"></video></body>`,
    {url:'https://x.com/v',pretendToBeVisual:true,runScripts:'outside-only'});
  const {window}=dom, doc=window.document, v=doc.getElementById('v');
  let paused=true;
  Object.defineProperty(v,'paused',{get:()=>paused,configurable:true});
  Object.defineProperty(v,'ended',{get:()=>false,configurable:true});
  Object.defineProperty(v,'muted',{get:()=>false,set:()=>{},configurable:true});
  Object.defineProperty(v,'volume',{get:()=>0.5,set:()=>{},configurable:true});
  Object.defineProperty(v,'videoWidth',{get:()=>1280,configurable:true});
  Object.defineProperty(v,'videoHeight',{get:()=>720,configurable:true});
  Object.defineProperty(v,'currentTime',{get:()=>0,set:()=>{},configurable:true});
  Object.defineProperty(v,'duration',{get:()=>100,configurable:true});
  v.play=()=>{paused=false;return Promise.resolve();};
  v.pause=()=>{paused=true;};
  v.getBoundingClientRect=()=>({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
  window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
  window.eval(src);
  const key=k=>doc.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:k,code:k===' '?'Space':k,bubbles:true,cancelable:true}));
  return {window,doc,v,key,get paused(){return paused;}};
}
(async()=>{
  // 有 Vimium、鼠标不在视频上 → 空格交给 Vimium（脚本不接管）
  const a=make(true); await sleep(100);
  a.key(' '); await sleep(100);
  check('Vimium 在场且鼠标不在视频：空格不被脚本接管', a.paused===true);

  // 有 Vimium、鼠标移到视频上 → 脚本接管
  const b=make(true); await sleep(100);
  b.v.dispatchEvent(new b.window.MouseEvent('mouseover',{bubbles:true,cancelable:true}));
  await sleep(100);
  b.key(' '); await sleep(150);
  console.log('   dbg:', JSON.stringify(b.window.__vaKeyDbg));
  check('Vimium 在场且鼠标在视频：空格接管播放/暂停', b.paused===false);

  // 无 Vimium：始终接管
  const c=make(false); await sleep(100);
  c.key(' '); await sleep(150);
  check('无 Vimium：空格直接接管', c.paused===false);

  let pass=0; results.forEach(([n,ok])=>{console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;});
  console.log(`\n${pass}/${results.length} 通过`); process.exit(pass===results.length?0:1);
})();
