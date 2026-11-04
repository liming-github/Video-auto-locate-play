import fs from 'node:fs';
const SCRIPT = fs.readFileSync('/Users/leonnas/projects/dsh-video-enhancer/video-enhancer.user.js','utf8');
const BASE='http://127.0.0.1:9222';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function newTab(u){ const r=await fetch(`${BASE}/json/new?${encodeURIComponent(u)}`,{method:'PUT'}); return r.json(); }
function connect(w){return new Promise((res,rej)=>{const ws=new WebSocket(w);let id=0;const p=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
  ws.onopen=()=>res({send:(method,params={})=>new Promise(ok=>{const i=++id;p.set(i,ok);ws.send(JSON.stringify({id:i,method,params}));}),close:()=>ws.close()});
  ws.onerror=rej;});}
const ev=async(c,expr)=>(await c.send('Runtime.evaluate',{expression:expr,returnByValue:true})).result?.result?.value;
async function click(c,x,y){await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await sleep(60);await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});}
async function move(c,x,y){await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});}
const results=[]; const check=(n,ok)=>results.push([n,ok]);
async function scenario(url, fn){
  const tab=await newTab('about:blank'); const c=await connect(tab.webSocketDebuggerUrl);
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride',{width:800,height:2400,deviceScaleFactor:1,mobile:false});
  await c.send('Page.addScriptToEvaluateOnNewDocument',{source:SCRIPT});
  await c.send('Page.navigate',{url}); await sleep(2500);
  await fn(c); c.close(); await fetch(`${BASE}/json/close/${tab.id}`);
}

// E：同源 iframe 里的视频（每个 iframe 各一个）
await scenario('http://127.0.0.1:8898/siteE.html', async c=>{
  const st=await ev(c,'[...document.querySelectorAll("iframe")].map(f=>f.contentWindow.__state())');
  console.log('  E 初始:', JSON.stringify(st));
  check('E iframe：初始都在播', Array.isArray(st) && st.length===2);
  await move(c,100,50); await sleep(200); await move(c,320,600); await sleep(1600);
  const st2 = await ev(c,'[...document.querySelectorAll("iframe")].map(f=>f.contentWindow.__state())');
  console.log('  E 悬停第二个 iframe 后:', JSON.stringify(st2));
  check('E iframe：悬停第二个 → 它播放、第一个停', st2[1]===false && st2[0]===true);
});

// F：Shadow DOM 里的视频
await scenario('http://127.0.0.1:8898/siteF.html', async c=>{
  const st=await ev(c,'window.__state()');
  console.log('  F 初始:', JSON.stringify(st));
  await move(c,100,100); await sleep(200); await move(c,320,800); await sleep(1400);
  const st2=await ev(c,'window.__state()');
  console.log('  F 悬停第二个后:', JSON.stringify(st2));
  check('F ShadowDOM：悬停第二个 → 它播放、其它停', st2[1]===false && st2[0]===true);
});

// G：懒加载，点击封面才创建 video
await scenario('http://127.0.0.1:8898/siteG.html', async c=>{
  await click(c,320,400); await sleep(700);      // 点第一个封面创建视频
  await click(c,320,1200); await sleep(700);     // 点第二个封面
  const st=await ev(c,'window.__state()');
  console.log('  G 两次点击后:', JSON.stringify(st));
  check('G 懒加载：点击封面能创建并播放', st[0]===false && st[1]===false);
  await click(c,320,1200); await sleep(500);     // 暂停第二个
  const st2=await ev(c,'window.__state()');
  check('G 懒加载：点击能暂停', st2[1]===true);
});

let pass=0; for(const [n,ok] of results){console.log((ok?'✅':'❌')+' '+n); if(ok)pass++;}
console.log(`\n${pass}/${results.length} 通过`);
