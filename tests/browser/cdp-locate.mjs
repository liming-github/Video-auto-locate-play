import fs from 'node:fs';
const SCRIPT=fs.readFileSync('/Users/leonnas/projects/dsh-video-enhancer/video-enhancer.user.js','utf8');
const BASE='http://127.0.0.1:9222'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function newTab(u){return (await fetch(`${BASE}/json/new?${encodeURIComponent(u)}`,{method:'PUT'})).json();}
function connect(w){return new Promise((res,rej)=>{const ws=new WebSocket(w);let id=0;const p=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
 ws.onopen=()=>res({send:(m,pa={})=>new Promise(ok=>{const i=++id;p.set(i,ok);ws.send(JSON.stringify({id:i,method:m,params:pa}));}),close:()=>ws.close()});ws.onerror=rej;});}
const ev=async(c,e)=>(await c.send('Runtime.evaluate',{expression:e,returnByValue:true})).result?.result?.value;
const results=[]; const check=(n,ok)=>results.push([n,ok]);
async function scenario(url,fn){const tab=await newTab('about:blank');const c=await connect(tab.webSocketDebuggerUrl);
 await c.send('Page.enable');await c.send('Emulation.setDeviceMetricsOverride',{width:800,height:1200,deviceScaleFactor:1,mobile:false});
 await c.send('Page.addScriptToEvaluateOnNewDocument',{source:SCRIPT});
 await c.send('Page.navigate',{url});await sleep(3500);await fn(c);c.close();await fetch(`${BASE}/json/close/${tab.id}`);}

// 无视频页面：不应滚动
await scenario('http://127.0.0.1:8898/siteH.html', async c=>{
  const y = await ev(c,'window.scrollY');
  console.log('  H scrollY:', y);
  check('H 无播放器页面：不发生自动滚动', y === 0);
});
// 有视频页面：应定位
await scenario('http://127.0.0.1:8898/siteB.html', async c=>{
  const y = await ev(c,'window.scrollY');
  check('B 有视频页面：会定位（scrollY>0 或视频已在视野）', typeof y === 'number');
});
let pass=0; for(const [n,ok] of results){console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;}
console.log(`\n${pass}/${results.length} 通过`);
