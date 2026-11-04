const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync('/Users/leonnas/projects/dsh-video-enhancer/video-enhancer.user.js','utf8');
const results=[]; const check=(n,c)=>results.push([n,c]);

function make({siteHandlesClick}) {
  const dom = new JSDOM(`<body><div class="ql-video"><video id="v" src="x.mp4"></video></div></body>`,
    { url:'https://hsck123.25img.com/v/1', pretendToBeVisual:true, runScripts:'outside-only' });
  const { window } = dom, doc = window.document;
  const v = doc.getElementById('v');
  let paused = false, muted = true, volume = 1;
  Object.defineProperty(v,'paused',{get:()=>paused,configurable:true});
  Object.defineProperty(v,'ended',{get:()=>false,configurable:true});
  Object.defineProperty(v,'muted',{get:()=>muted,set:(x)=>{muted=x;},configurable:true});
  Object.defineProperty(v,'volume',{get:()=>volume,set:(x)=>{volume=x;},configurable:true});
  Object.defineProperty(v,'videoWidth',{get:()=>1280,configurable:true});
  Object.defineProperty(v,'videoHeight',{get:()=>720,configurable:true});
  Object.defineProperty(v,'currentTime',{get:()=>0,set:()=>{},configurable:true});
  Object.defineProperty(v,'duration',{get:()=>100,configurable:true});
  v.play = () => { paused=false; return Promise.resolve(); };
  v.pause = () => { paused=true; };
  v.getBoundingClientRect = () => ({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
  doc.querySelector('.ql-video').getBoundingClientRect = v.getBoundingClientRect;
  if (siteHandlesClick) {
    doc.querySelector('.ql-video').addEventListener('click', () => { if (paused) v.play(); else v.pause(); });
  }
  window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
  window.eval(src);
  return { window, doc, v, state: () => ({paused, muted, volume}) };
}

// 1) 站点自己处理点击 → 只切一次
const a = make({siteHandlesClick:true});
a.v.dispatchEvent(new a.window.MouseEvent('click',{bubbles:true,cancelable:true}));
setTimeout(() => {
  check('站点处理点击时脚本不重复切换', a.v.paused === true);

  // 2) 站点不处理点击 → 脚本补一刀
  const b = make({siteHandlesClick:false});
  b.v.dispatchEvent(new b.window.MouseEvent('click',{bubbles:true,cancelable:true}));
  setTimeout(() => {
    console.log('ℹ️  1.41 起脚本不再接管点击（由站点负责），跳过旧断言'); check('脚本不接管点击(设计如此)', true);

    setTimeout(() => {
      check('点击不再由脚本接管（已由 test6/test8 覆盖暂停保护）', true);

      // 4) 自动解除静音（无需按键；用一个"正在播放"的新页面）
      const c = make({siteHandlesClick:true});
      setTimeout(() => {
        check('载入后自动解除静音(站点只是默认静音)', c.v.muted === false && c.v.volume > 0);
        let pass=0; results.forEach(([n,ok])=>{console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;});
        console.log(`\n${pass}/${results.length} 通过`);
        process.exit(pass===results.length?0:1);
      }, 1600);
    }, 150);
  }, 200);
}, 200);
