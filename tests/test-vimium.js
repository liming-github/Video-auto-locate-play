const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'..','video-enhancer.user.js'),'utf8');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const results=[]; const check=(n,c)=>results.push([n,c]);

function make(withVimium) {
  const dom = new JSDOM(`<body>${withVimium?'<div class="vimiumUI"></div>':''}<video id="v" src="x.mp4"></video></body>`,
    { url:'https://x.com/v/1', pretendToBeVisual:true, runScripts:'outside-only' });
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
  v.play = () => { paused=false; return Promise.resolve(); };
  v.pause = () => { paused=true; };
  v.getBoundingClientRect = () => ({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
  try { window.localStorage.setItem('va_autoplay_' + 'x.com', '0'); } catch(e) {}
  window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
  window.eval(src);
  const key = (k,code)=>doc.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:k,code:code||k,bubbles:true,cancelable:true}));
  return { v, key, get paused(){return paused;} };
}

(async () => {
  // A) 无 Vimium：空格立刻生效（相对原状态翻转）
  const a = make(false); await sleep(50);
  const a0 = a.paused; a.key(' ','Space'); await sleep(80);
  check('无 Vimium：空格立即切换播放状态', a.paused === !a0);

  // B) 有 Vimium：单独空格 500ms 后生效
  const b = make(true); await sleep(50);
  const b0 = b.paused; b.key(' ','Space'); await sleep(800);
  check('有 Vimium：单独空格仍能切换', b.paused === !b0);

  // C) 有 Vimium：空格+字母 不触发播放
  const c = make(true); await sleep(50);
  const c0 = c.paused;
  c.key(' ','Space'); await sleep(120);
  c.key('y','KeyY'); await sleep(700);
  check('有 Vimium：空格+字母 不触发播放/暂停', c.paused === c0);

  let pass=0; results.forEach(([n,ok])=>{console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;});
  console.log(`\n${pass}/${results.length} 通过`);
  process.exit(pass===results.length?0:1);
})();
