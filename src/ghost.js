/* =====================================================================
   APEX GP — GHOST CAR (plays back a recorded lap as a translucent car,
   used both for the live "beat your best" overlay during a race and
   for the post-race cinematic replay in replay.js)
   ===================================================================== */
import * as THREE from 'three';
import { buildCar, locate, syncMesh } from './cars.js';
import { sampleAt } from './recorder.js';

function makeTranslucent(group){
  group.traverse(o=>{
    if(!o.isMesh) return;
    o.castShadow=false; o.receiveShadow=false;
    o.renderOrder=5;   // draw after opaque cars so the translucent panels blend correctly
    // buildCar shares its non-painted materials (tyres, wings, chrome...)
    // across every car, so clone before making them see-through — otherwise
    // all six race cars would turn translucent too
    const clone=m=>{ const c=m.clone(); c.transparent=true; c.opacity=0.30; c.depthWrite=false; return c; };
    o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
  });
}

const built=buildCar('#eef3ff', '#7ee0ff');
makeTranslucent(built.group);
built.group.visible=false;

/* car-shaped state object — deliberately shaped like the real car objects in
   cars.js so it can reuse locate()/syncMesh() (nearest-track lookup + ground
   height + mesh placement) instead of duplicating that logic. */
export const ghost={
  mesh:built.group, wheels:built.wheels,
  pos:new THREE.Vector3(), heading:0, seg:0, lateral:0, frac:0, groundY:0,
  visible:false
};

let framesRef=null;

export function setGhostFrames(frames){
  framesRef=(frames&&frames.length)?frames:null;
  if(!framesRef){ ghost.mesh.visible=false; ghost.visible=false; }
}
export function getGhostFrames(){ return framesRef; }
export function hasGhost(){ return !!framesRef; }

/* place the ghost mesh at time t within an arbitrary frame set (used directly
   by replay.js, which runs its own clock independent of the player's lap). */
export function placeGhostAtTime(frames, t){
  const s=sampleAt(frames, t);
  if(!s){ ghost.mesh.visible=false; ghost.visible=false; return false; }
  ghost.pos.set(s.x, 0, s.z);
  ghost.heading=s.heading;
  locate(ghost);
  syncMesh(ghost);
  const wsp=(s.speed||0)*0.18;
  const w=ghost.wheels;
  if(w.fl) w.fl.rotation.x+=wsp; if(w.fr) w.fr.rotation.x+=wsp;
  if(w.rl) w.rl.rotation.x+=wsp; if(w.rr) w.rr.rotation.x+=wsp;
  ghost.mesh.visible=true; ghost.visible=true;
  return true;
}

/* convenience wrapper for the live in-race overlay: follows the currently
   loaded best-lap recording, keyed to seconds-since-the-player's-lap-start. */
export function updateGhost(tSinceLapStart){
  if(!framesRef){ ghost.mesh.visible=false; ghost.visible=false; return false; }
  return placeGhostAtTime(framesRef, tSinceLapStart);
}

export function hideGhost(){ ghost.mesh.visible=false; ghost.visible=false; }
