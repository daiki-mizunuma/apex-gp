/* =====================================================================
   APEX GP — INPUT (keyboard state + gamepad)
   Key/pad bindings are wired up by main.js via an `actions` object,
   so this module stays free of gameplay dependencies.
   ===================================================================== */

export const keys={};

export function initInput(actions){
  addEventListener('keydown', e=>{
    keys[e.code]=true;
    if(e.code==='KeyC') actions.toggleCam();
    if(e.code==='KeyM') actions.toggleMute();
    if(e.code==='KeyR') actions.resetRace();
    if(e.code==='KeyB') actions.toggleBlur();
    if(e.code==='KeyH') actions.toggleHelp();
    if(e.code==='KeyX') actions.respawnPlayer();
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e=>{ keys[e.code]=false; });
  addEventListener('gamepadconnected', actions.onPadConnected);
}

/* ---- Gamepad: PlayStation DualSense / DualShock (Chrome standard mapping) ---- */
export function readPad(){
  if(!navigator.getGamepads) return null;
  const pads=navigator.getGamepads();
  for(let i=0;i<pads.length;i++){ if(pads[i]) return pads[i]; }
  return null;
}
let padPrev=[];
export function gamepadActions(actions){
  if(actions.isIdle()) return;              // ignore until race started (audio needs a click/key)
  const pad=readPad(); if(!pad) return;
  const b=pad.buttons;
  const edge=i=>(b[i]&&b[i].pressed)&&!padPrev[i];
  if(edge(3)) actions.toggleCam();     // Triangle = camera
  if(edge(9)) actions.resetRace();     // OPTIONS  = restart
  if(edge(8)) actions.toggleMute();    // SHARE    = mute
  padPrev=b.map(x=>!!x.pressed);
}
