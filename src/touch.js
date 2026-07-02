/* =====================================================================
   APEX GP — TOUCH (on-screen controls for touch devices)
   Fully self-contained side-effect module: builds its own DOM + styles
   and synthesizes window KeyboardEvents (input.js reads e.code), so no
   other module needs to know touch exists. On non-touch devices this
   module does nothing (no DOM, no listeners).
   ===================================================================== */

const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window
  || new URLSearchParams(location.search).get('touch')==='1';   // ?touch=1 forces the controls on (desktop testing)

if(isTouch){

const CSS = `
#touchCtl { position:fixed; inset:0; z-index:30; pointer-events:none; opacity:1; transition:opacity .3s; }
#touchCtl .tbtn { pointer-events:auto; display:flex; align-items:center; justify-content:center;
  background:rgba(10,12,22,.5); border:1px solid rgba(255,255,255,.2); border-radius:50%; color:#fff;
  touch-action:none; user-select:none; -webkit-user-select:none; -webkit-tap-highlight-color:transparent;
  text-shadow:0 1px 3px #000; backdrop-filter:blur(4px); }
#touchCtl .tbtn.on { background:rgba(255,210,60,.35); border-color:rgba(255,255,255,.55); }
#tcSteer { position:absolute; left:12px; bottom:calc(20px + env(safe-area-inset-bottom,0px)); display:flex; gap:14px; }
#tcSteer .tbtn { width:80px; height:80px; font-size:30px; }
#tcPedals { position:absolute; right:12px; bottom:calc(20px + env(safe-area-inset-bottom,0px)); width:172px; height:172px; }
#tcGas { position:absolute; right:0; top:0; width:96px; height:96px; font-size:36px; }
#tcBrk { position:absolute; left:0; bottom:0; width:72px; height:72px; font-size:28px; }
#tcTop { position:absolute; top:150px; right:14px; display:flex; flex-direction:column; gap:10px; }
#tcTop .tbtn { width:44px; height:44px; font-size:20px; }
`;

/* ---- synthetic keyboard: zero game-code changes needed ---- */
const press   = code => dispatchEvent(new KeyboardEvent('keydown', {code, bubbles:true}));
const release = code => dispatchEvent(new KeyboardEvent('keyup',   {code, bubbles:true}));

const forceReleases = [];   // per hold-button: never leave a key stuck down

function mkBtn(id, label){
  const b = document.createElement('div');
  b.id = id; b.className = 'tbtn'; b.textContent = label;
  // suppress double-tap zoom + the synthetic click a touch would generate
  b.addEventListener('touchend', e => e.preventDefault(), {passive:false});
  return b;
}

/* hold-style button: multi-touch safe via per-pointer bookkeeping + capture */
function bindHold(btn, code){
  const ids = new Set();
  const down = e => {
    e.preventDefault();
    try{ btn.setPointerCapture(e.pointerId); }catch(_){}
    if(ids.size === 0){ press(code); btn.classList.add('on'); }
    ids.add(e.pointerId);
  };
  const up = e => {
    if(!ids.delete(e.pointerId)) return;
    if(ids.size === 0){ release(code); btn.classList.remove('on'); }
  };
  btn.addEventListener('pointerdown',   down);
  btn.addEventListener('pointerup',     up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave',  up);   // finger slid off the button
  forceReleases.push(() => { if(ids.size){ ids.clear(); release(code); btn.classList.remove('on'); } });
}

/* tap-style button: single keydown+keyup pulse */
function bindTap(btn, code){
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    press(code); release(code);
    btn.classList.add('on'); setTimeout(() => btn.classList.remove('on'), 150);
  });
}

/* ---- build overlay ---- */
const wrap  = document.createElement('div'); wrap.id  = 'touchCtl';
const steer = document.createElement('div'); steer.id = 'tcSteer';
const ped   = document.createElement('div'); ped.id   = 'tcPedals';
const top   = document.createElement('div'); top.id   = 'tcTop';
const left  = mkBtn('tcLeft','◀'),  right = mkBtn('tcRight','▶');
const gas   = mkBtn('tcGas','⬆'),   brk   = mkBtn('tcBrk','⬇');
const cam   = mkBtn('tcCam','📷'),  rsp   = mkBtn('tcRsp','↩');
const home  = mkBtn('tcHome','🏠');           // Escape: touch-only players need a way back to the title
steer.append(left, right); ped.append(gas, brk); top.append(cam, rsp, home);
wrap.append(steer, ped, top);

const st = document.createElement('style'); st.textContent = CSS;
document.head.appendChild(st);
document.body.appendChild(wrap);
document.body.classList.add('touch-ctl');   // style.css moves HUD bits out of the buttons' way

bindHold(left,  'KeyA');
bindHold(right, 'KeyD');
bindHold(gas,   'KeyW');
bindHold(brk,   'KeyS');
bindTap(cam,    'KeyC');
bindTap(rsp,    'KeyX');
bindTap(home,   'Escape');

/* block page scroll/zoom gestures that start on the controls */
wrap.addEventListener('touchmove',   e => e.preventDefault(), {passive:false});
wrap.addEventListener('contextmenu', e => e.preventDefault());

/* app loses focus / tab hidden => release everything */
const releaseAll = () => forceReleases.forEach(f => f());
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if(document.hidden) releaseAll(); });

/* dim controls while the title overlay is shown (main.js toggles inline style) */
const ov = document.getElementById('overlay');
if(ov){
  const sync = () => { wrap.style.opacity = getComputedStyle(ov).display === 'none' ? '1' : '0.55'; };
  new MutationObserver(sync).observe(ov, {attributes:true, attributeFilter:['style']});
  sync();
}

}
