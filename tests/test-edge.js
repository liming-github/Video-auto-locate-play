const { JSDOM } = require('/tmp/vtest/node_modules/jsdom');
const fs = require('fs');
const src = fs.readFileSync('../video-enhancer.user.js','utf8');
const results = [];
const check = (n, c) => results.push([n, c]);

// 场景 A：播放器容器 (.ql-video) 里的 video，点击"封面区"也能播放
{
  const dom = new JSDOM(`<body><div class="ql-video" style="height:400px"><div id="poster" style="height:400px"></div><video id="v" src="x.mp4"></video></div></body>`,
    { url:'https://a.com/x', pretendToBeVisual:true, runScripts:'outside-only' });
  const { window } = dom, doc = window.document;
  const v = doc.getElementById('v'); let paused = true;
  v.play = () => { paused = false; return Promise.resolve(); };
  v.pause = () => { paused = true; };
  Object.defineProperty(v,'paused',{get:()=>paused,configurable:true});
  Object.defineProperty(v,'ended',{get:()=>false,configurable:true});
  Object.defineProperty(v,'volume',{get:()=>0.5,set:()=>{},configurable:true});
  Object.defineProperty(v,'muted',{get:()=>false,set:()=>{},configurable:true});
  Object.defineProperty(v,'videoWidth',{get:()=>1280,configurable:true});
  Object.defineProperty(v,'videoHeight',{get:()=>720,configurable:true});
  Object.defineProperty(v,'currentTime',{get:()=>0,set:()=>{},configurable:true});
  Object.defineProperty(v,'duration',{get:()=>100,configurable:true});
  v.getBoundingClientRect = () => ({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
  doc.querySelector('.ql-video').getBoundingClientRect = () => ({top:0,bottom:400,left:0,right:800,width:800,height:400,x:0,y:0});
  doc.getElementById('poster').getBoundingClientRect = v.getBoundingClientRect;
  window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
  window.eval(src);
  // 模拟站点自身的点击处理器：脚本不应吞掉这个事件
  let siteGotClick = false;
  doc.querySelector('.ql-video').addEventListener('click', () => { siteGotClick = true; paused = false; });
  doc.getElementById('poster').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  check('脚本不吞点击，站点播放器能收到', siteGotClick === true && paused === false);
}

// 场景 B：无视频页面不滚动
{
  const dom = new JSDOM(`<body><div class="ql-video video-menu-item" style="height:600px">菜单</div><div style="height:5000px"></div></body>`,
    { url:'https://b.com/list', pretendToBeVisual:true, runScripts:'outside-only' });
  const { window } = dom, doc = window.document;
  let scrolled = false;
  window.scrollTo = () => { scrolled = true; };
  window.Element.prototype.scrollIntoView = function(){ scrolled = true; };
  window.GM_getValue=()=>''; window.GM_setValue=()=>{}; window.GM_registerMenuCommand=()=>{}; window.alert=()=>{};
  window.eval(src);
  // 触发一轮定时检测
  return setTimeout(() => {
    check('列表页(无播放器)不滚动', scrolled === false);
    let pass=0; for (const [n,ok] of results){ console.log((ok?'✅':'❌')+' '+n); if(ok)pass++; }
    console.log(`\n${pass}/${results.length} 通过`);
    process.exit(pass===results.length?0:1);
  }, 2000);
}
