const { JSDOM } = require('/tmp/vtest/node_modules/jsdom');
const fs = require('fs');
const src = fs.readFileSync('../video-enhancer.user.js','utf8');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const results=[]; const check=(n,c)=>results.push([n,c]);
const dom=new JSDOM(`<body><video id="v" src="x.mp4"></video></body>`,{url:'https://hsck123.25img.com/v',pretendToBeVisual:true,runScripts:'outside-only'});
const {window}=dom, doc=window.document, v=doc.getElementById('v'); let paused=true, playCalls=0;
Object.defineProperty(v,'paused',{get:()=>paused,configurable:true});
Object.defineProperty(v,'ended',{get:()=>false,configurable:true});
Object.defineProperty(v,'muted',{get:()=>false,set:()=>{},configurable:true});
Object.defineProperty(v,'volume',{get:()=>0.5,set:()=>{},configurable:true});
Object.defineProperty(v,'videoWidth',{get:()=>1280,configurable:true});
Object.defineProperty(v,'videoHeight',{get:()=>720,configurable:true});
Object.defineProperty(v,'currentTime',{get:()=>0,set:()=>{},configurable:true});
Object.defineProperty(v,'duration',{get:()=>100,configurable:true});
const realPlay=()=>{playCalls++;paused=false;v.dispatchEvent(new window.Event('play'));return Promise.resolve();};
v.play=realPlay;
v.pause=()=>{paused=true;v.dispatchEvent(new window.Event('pause'));};
v.getBoundingClientRect=()=>({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
window.eval(src);
(async()=>{
  v.play(); await sleep(50);
  v.pause();                                   // 用户暂停
  // 站点疯狂尝试恢复播放（每 150ms 一次，持续 2 秒）
  const iv = setInterval(()=>{ try { v.play(); } catch(e){} }, 150);
  await sleep(2000); clearInterval(iv);
  check('站点反复 play 时视频保持暂停（无闪烁）', v.paused === true);

  // 用户点播放
  v.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true}));
  await sleep(50);
  v.play(); await sleep(200);
  check('用户点播放后能正常播放', v.paused === false);
  let pass=0; results.forEach(([n,ok])=>{console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;});
  console.log(`\n${pass}/${results.length} 通过`); process.exit(pass===results.length?0:1);
})();
