/* =====================================================================
   APEX GP — HUD (speed/lap/pos, standings, mini-map, toast, countdown,
   help panel, results screen DOM)
   ===================================================================== */
import { N, TOTAL_LAPS, TOP_SPEED } from './config.js';
import { SP } from './track.js';
import { cars, PALETTE } from './cars.js';
import { keys } from './input.js';

export const elc=id=>document.getElementById(id);
const mapCtx=document.getElementById('map').getContext('2d');

export function fmtTime(s){
  if(!isFinite(s)||s<=0) return '0:00.00';
  const m=Math.floor(s/60), sec=s-m*60;
  return m+':'+sec.toFixed(2).padStart(5,'0');
}

function drawMap(){
  const ctx=mapCtx; ctx.clearRect(0,0,300,300);
  // fit track
  let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
  for(let i=0;i<N;i+=4){ const p=SP[i]; if(p.x<minx)minx=p.x; if(p.x>maxx)maxx=p.x; if(p.z<minz)minz=p.z; if(p.z>maxz)maxz=p.z; }
  const pad=20, w=300-pad*2;
  const sx=w/(maxx-minx), sz=w/(maxz-minz), s=Math.min(sx,sz);
  const ox=pad+(w-(maxx-minx)*s)/2, oz=pad+(w-(maxz-minz)*s)/2;
  const X=x=>ox+(x-minx)*s, Z=z=>oz+(z-minz)*s;
  ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=5; ctx.beginPath();
  for(let i=0;i<=N;i+=4){ const p=SP[i%N]; const px=X(p.x),pz=Z(p.z); i===0?ctx.moveTo(px,pz):ctx.lineTo(px,pz); }
  ctx.closePath(); ctx.stroke();
  // start line dot
  ctx.fillStyle='#fff'; ctx.fillRect(X(SP[0].x)-3,Z(SP[0].z)-3,6,6);
  // cars
  for(const c of cars){
    ctx.fillStyle=c.isPlayer?'#ffd23c':PALETTE[c.id].base;
    ctx.beginPath(); ctx.arc(X(c.pos.x),Z(c.pos.z), c.isPlayer?5:4, 0, 7); ctx.fill();
  }
}

export function updateHUD(order, clockT){
  const p=cars[0];
  elc('kmh').textContent=Math.max(0,Math.round(Math.abs(p.speed)*3.6));
  const gear = p.speed<0.5 ? (keys['KeyS']||keys['ArrowDown']?'R':'N')
             : Math.min(6, Math.floor(Math.abs(p.speed)/(TOP_SPEED/6))+1);
  elc('gear').textContent=gear;
  elc('lapNow').textContent=Math.min(TOTAL_LAPS, Math.max(1,p.lap));
  elc('posNow').textContent=p.place;
  elc('curTime').textContent=fmtTime(p.finished?p.lastLap:(p.lap>=1?clockT-p.lapStart:clockT));
  elc('bestTime').textContent=isFinite(p.bestLap)?fmtTime(p.bestLap):'--:--.--';

  let html='';
  order.forEach((c,i)=>{
    const lapInfo = c.finished?'FIN':('L'+Math.min(TOTAL_LAPS,Math.max(1,c.lap)));
    html+=`<div class="row ${c.isPlayer?'me':''}"><span>${i+1}. ${c.name}</span><span>${lapInfo}</span></div>`;
  });
  elc('standRows').innerHTML=html;
  drawMap();
}

/* ---- toast + countdown ---- */
let toastT=0;
export function showToast(txt,ms){ const t=elc('toast'); t.textContent=txt; t.style.opacity=1; toastT=ms/1000; }
export function tickToast(dt){ if(toastT>0){ toastT-=dt; if(toastT<=0) elc('toast').style.opacity=0; } }
export function showCount(txt){ const c=elc('count'); c.textContent=txt; c.style.opacity=1; c.style.transition='none';
  requestAnimationFrame(()=>{ c.style.transition='opacity .6s, transform .6s'; c.style.opacity=0; }); }

/* ---- help panel ---- */
let helpUserSet=false;
export function toggleHelp(){
  helpUserSet=true;
  const h=elc('help');
  h.style.opacity=(h.style.opacity==='0')?'':'0';
}
export function autoHideHelp(){
  setTimeout(()=>{ if(!helpUserSet) elc('help').style.opacity='0'; }, 8000);
}

/* ---- results screen ---- */
export function renderResults(final){
  const me=cars[0];
  const pl=final.indexOf(me)+1;
  elc('resTitle').textContent = pl===1?'🏆 WINNER!':'FINISH — P'+pl;
  elc('resFin').textContent = 'ベストラップ '+(isFinite(me.bestLap)?fmtTime(me.bestLap):'--');
  let t='<tr><th>POS</th><th>DRIVER</th><th>BEST LAP</th></tr>';
  final.forEach((c,i)=>{ t+=`<tr class="${c.isPlayer?'me':''}"><td>${i+1}</td><td>${c.name}</td><td>${isFinite(c.bestLap)?fmtTime(c.bestLap):'--'}</td></tr>`; });
  elc('resTable').innerHTML=t;
  elc('results').style.display='flex';
}
export function hideResults(){ elc('results').style.display='none'; }
