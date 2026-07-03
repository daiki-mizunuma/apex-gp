/* =====================================================================
   APEX GP — HUD (analog tach, lap/pos, standings, mini-map, toast,
   countdown, help panel, results screen DOM)
   ===================================================================== */
import { N, TOTAL_LAPS, TOP_SPEED } from './config.js';
import { SP } from './track.js';
import { cars, PALETTE } from './cars.js';
import { keys } from './input.js';
import { getGhostFrames } from './ghost.js';
import { frameTimeAtProgress } from './recorder.js';
// circular with race.js (it imports our DOM helpers) — safe: `race` is only
// dereferenced inside updateHUD, long after both module bodies have run
import { race } from './race.js';

export const elc=id=>document.getElementById(id);
const mapCanvas=document.getElementById('map');   // 450×450 backing, 225px CSS (drawMap scales from width)
const mapCtx=mapCanvas.getContext('2d');

/* ---- sector times panel (S1/S2/S3 vs ghost) — DOM built here so index.html stays untouched ---- */
const SEC_FLASH_S=2.5;
const secRows=(()=>{
  const box=document.createElement('div');
  box.id='sectorBox'; box.className='panel';
  const rows=[];
  for(let i=0;i<3;i++){
    const row=document.createElement('div'); row.className='sec-row';
    row.innerHTML=`<span class="sec-lbl">S${i+1}</span><span class="sec-t">--.-</span><span class="sec-d"></span>`;
    box.appendChild(row);
    rows.push({row, t:row.children[1], d:row.children[2]});
  }
  elc('hud').appendChild(box);
  return rows;
})();

/* ---- analog dials: speedometer (left) + tachometer (right), GT-style ---- */
const DW=200, DH=170, DCX=100, DCY=88, DR=78;
const IDLE_RPM=4000, REDLINE_RPM=12000, MAX_RPM=13000, MAX_KMH=300;

// pre-render a static dial face (rim, ticks, numerals, optional red arc);
// returns it with its value->angle map (270° clockwise sweep from lower-left)
function makeDial({max, redFrom, minor, major, label, caption}){
  const ang=v=>(135+270*v/max)*Math.PI/180;
  const c=document.createElement('canvas'); c.width=DW; c.height=DH;
  const x=c.getContext('2d');
  x.beginPath(); x.arc(DCX,DCY,DR,0,7); x.fillStyle='rgba(8,10,18,.88)'; x.fill();
  x.lineWidth=2; x.strokeStyle='rgba(255,255,255,.22)'; x.stroke();
  if(redFrom!=null){
    x.beginPath(); x.arc(DCX,DCY,DR-6,ang(redFrom),ang(max));
    x.lineWidth=9; x.strokeStyle='rgba(255,45,45,.8)'; x.stroke();
  }
  for(let v=minor;v<max;v+=minor){                       // minor ticks between numerals
    if(v%major===0) continue;
    const a=ang(v), ca=Math.cos(a), sa=Math.sin(a);
    x.beginPath(); x.moveTo(DCX+ca*(DR-3),DCY+sa*(DR-3)); x.lineTo(DCX+ca*(DR-9),DCY+sa*(DR-9));
    x.lineWidth=1; x.strokeStyle='rgba(255,255,255,.4)'; x.stroke();
  }
  x.font='bold 11px Trebuchet MS,Segoe UI,sans-serif'; x.textAlign='center'; x.textBaseline='middle';
  for(let v=0;v<=max;v+=major){                          // major ticks + numerals
    const a=ang(v), ca=Math.cos(a), sa=Math.sin(a), red=redFrom!=null&&v>=redFrom;
    x.beginPath(); x.moveTo(DCX+ca*(DR-3),DCY+sa*(DR-3)); x.lineTo(DCX+ca*(DR-14),DCY+sa*(DR-14));
    x.lineWidth=2; x.strokeStyle=red?'#ff5252':'rgba(255,255,255,.85)'; x.stroke();
    x.fillStyle=red?'#ff5252':'#dfe6f5';
    x.fillText(label(v), DCX+ca*(DR-25), DCY+sa*(DR-25));
  }
  x.font='8px Trebuchet MS,Segoe UI,sans-serif'; x.fillStyle='rgba(255,255,255,.5)';
  x.fillText(caption, DCX, DCY-24);
  return {face:c, ang};
}
function drawNeedle(ctx, ang, v){
  const a=ang(v), ca=Math.cos(a), sa=Math.sin(a);
  ctx.beginPath(); ctx.moveTo(DCX-ca*10,DCY-sa*10); ctx.lineTo(DCX+ca*(DR-16),DCY+sa*(DR-16));
  ctx.lineWidth=3; ctx.lineCap='round'; ctx.strokeStyle='#ff2d2d'; ctx.stroke();
  ctx.beginPath(); ctx.arc(DCX,DCY,5,0,7); ctx.fillStyle='#1a1e2c'; ctx.fill();
  ctx.lineWidth=1.5; ctx.strokeStyle='#ff2d2d'; ctx.stroke();
}

const speedoCtx=document.getElementById('speedo').getContext('2d');
const tachCtx=document.getElementById('tach').getContext('2d');
const speedo=makeDial({max:MAX_KMH, redFrom:null, minor:10, major:50, label:v=>v, caption:'km/h'});
const tach  =makeDial({max:MAX_RPM, redFrom:REDLINE_RPM, minor:500, major:1000, label:v=>v/1000, caption:'×1000 rpm'});
let dispKmh=0, dispRpm=IDLE_RPM;                         // smoothed needle positions

function drawDials(){
  const p=cars[0], sp=Math.abs(p.speed);
  // speedometer: digital km/h under the hub
  const kmh=sp*3.6;
  dispKmh+=(kmh-dispKmh)*0.35;
  speedoCtx.clearRect(0,0,DW,DH); speedoCtx.drawImage(speedo.face,0,0);
  drawNeedle(speedoCtx, speedo.ang, Math.min(MAX_KMH,dispKmh));
  speedoCtx.textAlign='center'; speedoCtx.textBaseline='alphabetic';
  speedoCtx.fillStyle='#fff'; speedoCtx.font='bold 24px Trebuchet MS,Segoe UI,sans-serif';
  speedoCtx.fillText(Math.round(kmh), DCX, DCY+48);
  speedoCtx.fillStyle='rgba(255,255,255,.6)'; speedoCtx.font='10px Trebuchet MS,Segoe UI,sans-serif';
  speedoCtx.fillText('km/h', DCX, DCY+62);
  // tachometer: rev model mirrors audio.js engine() — 7 gear bands, each
  // sweeping idle (4000 rpm) -> redline (12000 rpm) as speed climbs through
  const band=TOP_SPEED/7;
  const gearNum=Math.min(7, Math.floor(sp/band)+1);
  const local=Math.min(1, Math.max(0,(sp-(gearNum-1)*band)/band));
  let rpm=IDLE_RPM+local*(REDLINE_RPM-IDLE_RPM);
  if(sp<1) rpm+=Math.sin(performance.now()*0.005)*80;    // idling isn't perfectly steady
  dispRpm+=(rpm-dispRpm)*0.35;
  tachCtx.clearRect(0,0,DW,DH); tachCtx.drawImage(tach.face,0,0);
  drawNeedle(tachCtx, tach.ang, dispRpm);
  const gear=p.speed<0.5 ? (keys['KeyS']||keys['ArrowDown']?'R':'N') : gearNum;
  tachCtx.textAlign='center'; tachCtx.textBaseline='alphabetic';
  tachCtx.fillStyle='#ffd23c'; tachCtx.font='bold 30px Trebuchet MS,Segoe UI,sans-serif';
  tachCtx.fillText(gear, DCX, DCY+50);
}

export function fmtTime(s){
  if(!isFinite(s)||s<=0) return '0:00.00';
  const m=Math.floor(s/60), sec=s-m*60;
  return m+':'+sec.toFixed(2).padStart(5,'0');
}
export function fmtSec(s){ return (s!=null&&isFinite(s))?s.toFixed(2):'--.-'; }

function drawMap(){
  const W=mapCanvas.width, H=mapCanvas.height, k=W/300;  // k scales strokes/dots vs the original 300px design
  const ctx=mapCtx; ctx.clearRect(0,0,W,H);
  // fit track
  let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
  for(let i=0;i<N;i+=4){ const p=SP[i]; if(p.x<minx)minx=p.x; if(p.x>maxx)maxx=p.x; if(p.z<minz)minz=p.z; if(p.z>maxz)maxz=p.z; }
  const pad=20*k, w=W-pad*2;
  const sx=w/(maxx-minx), sz=w/(maxz-minz), s=Math.min(sx,sz);
  const ox=pad+(w-(maxx-minx)*s)/2, oz=pad+(w-(maxz-minz)*s)/2;
  const X=x=>ox+(x-minx)*s, Z=z=>oz+(z-minz)*s;
  ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=5*k; ctx.beginPath();
  for(let i=0;i<=N;i+=4){ const p=SP[i%N]; const px=X(p.x),pz=Z(p.z); i===0?ctx.moveTo(px,pz):ctx.lineTo(px,pz); }
  ctx.closePath(); ctx.stroke();
  // start line dot
  ctx.fillStyle='#fff'; ctx.fillRect(X(SP[0].x)-3*k,Z(SP[0].z)-3*k,6*k,6*k);
  // cars
  for(const c of cars){
    ctx.fillStyle=c.isPlayer?'#ffd23c':PALETTE[c.id].base;
    ctx.beginPath(); ctx.arc(X(c.pos.x),Z(c.pos.z), (c.isPlayer?5:4)*k, 0, 7); ctx.fill();
  }
}

export function updateHUD(order, clockT){
  const p=cars[0];
  drawDials();
  elc('lapNow').textContent=Math.min(TOTAL_LAPS, Math.max(1,p.lap));
  elc('posNow').textContent=p.place;
  elc('curTime').textContent=fmtTime(p.finished?p.lastLap:(p.lap>=1?clockT-p.lapStart:clockT));
  elc('bestTime').textContent=isFinite(p.bestLap)?fmtTime(p.bestLap):'--:--.--';

  // live delta vs. the ghost car's recorded pace at the same point on the lap
  const gd=elc('ghostDelta');
  const frames=getGhostFrames();
  if(frames && p.lap>=1 && !p.finished){
    const ghostT=frameTimeAtProgress(frames, p.frac);
    if(ghostT!=null){
      const delta=(clockT-p.lapStart)-ghostT;
      gd.textContent=(delta<=0?'-':'+')+Math.abs(delta).toFixed(2);
      gd.style.color=delta<=0?'#4dff88':'#ff5252';
      gd.style.display='inline';   // sits inline in the top-centre BEST chip
    } else gd.style.display='none';
  } else gd.style.display='none';

  // sector rows: current-lap times + ghost deltas; a just-finished sector keeps
  // its value/delta visible via `flash` (also drives the row highlight, clock-based)
  const sc=race.sectors;
  for(let i=0;i<3;i++){
    const e=secRows[i];
    const age=clockT-sc.flash.t;
    const fl=sc.flash.idx===i && age>=0 && age<SEC_FLASH_S;
    const t =sc.times[i]!=null?sc.times[i]:(fl?sc.flash.val:null);
    const d =sc.times[i]!=null?sc.deltas[i]:(fl?sc.flash.delta:null);
    e.t.textContent=fmtSec(t);
    if(d!=null){ e.d.textContent=(d<=0?'-':'+')+Math.abs(d).toFixed(2); e.d.className='sec-d '+(d<=0?'sec-fast':'sec-slow'); }
    else { e.d.textContent=''; e.d.className='sec-d'; }
    e.row.classList.toggle('sec-flash', fl);
  }

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

/* ---- drift score popup ---- */
export function showDriftPopup(points){
  const el=elc('driftPop');
  el.textContent='DRIFT +'+points;
  el.classList.remove('show');
  void el.offsetWidth;               // force reflow so the animation restarts on rapid re-triggers
  el.classList.add('show');
}

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
export function renderResults(final, hasReplay){
  const me=cars[0];
  const pl=final.indexOf(me)+1;
  elc('resTitle').textContent = pl===1?'🏆 WINNER!':'FINISH — P'+pl;
  elc('resFin').textContent = 'BEST LAP '+(isFinite(me.bestLap)?fmtTime(me.bestLap):'--');
  let t='<tr><th>POS</th><th>DRIVER</th><th>BEST LAP</th></tr>';
  final.forEach((c,i)=>{ t+=`<tr class="${c.isPlayer?'me':''}"><td>${i+1}</td><td>${c.name}</td><td>${isFinite(c.bestLap)?fmtTime(c.bestLap):'--'}</td></tr>`; });
  elc('resTable').innerHTML=t;
  elc('replayBtn').style.display=hasReplay?'':'none';
  elc('results').style.display='flex';
}
export function hideResults(){ elc('results').style.display='none'; }
