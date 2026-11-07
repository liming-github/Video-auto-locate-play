const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'..','video-enhancer.user.js'),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[]; const check=(n,c)=>results.push([n,c]);
function make(n){
  const html = Array.from({length:n},(_,i)=>`<video id="v${i}" src="x${i}.mp4"></video>`).join('');
  const dom=new JSDOM(`<body>${html}</body>`,{url:'https://91porna.com/x',pretendToBeVisual:true,runScripts:'outside-only'});
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
    v.getBoundingClientRect=()=>({top:i*300,bottom:i*300+280,left:0,right:800,width:800,height:280,x:0,y:i*300});
    return v; });
  window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
  window.eval(src);
  return {window,doc,vs};
}
(async()=>{
  // 单视频：站点自动恢复会被拦截
  const a=make(1); a.vs[0].play(); await sleep(50); a.vs[0].pause(); await sleep(200);
  a.vs[0].play(); await sleep(300);
  check('单视频页面：站点自动恢复被压回', a.vs[0].paused===true);

  // 多视频：暂停后 play 不被替换，用户仍能播放
  const b=make(3); const origPlay = b.vs[1].play;
  b.vs[1].play(); await sleep(50); b.vs[1].pause(); await sleep(100);
  check('多视频页面：不拦截 play（可正常恢复播放）', b.vs[1].play === origPlay);
  b.vs[1].dispatchEvent(new b.window.MouseEvent('pointerdown',{bubbles:true}));
  b.vs[1].play(); await sleep(200);
  check('多视频页面：点击后能正常播放', b.vs[1].paused===false);

  let pass=0; results.forEach(([n,ok])=>{console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;});
  console.log(`\n${pass}/${results.length} 通过`); process.exit(pass===results.length?0:1);
})();
