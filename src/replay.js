/* =====================================================================
   APEX GP — REPLAY (post-race cinematic playback of a recorded lap,
   driven by its own clock, reusing the ghost mesh from ghost.js)
   ===================================================================== */
import { placeGhostAtTime, ghost } from './ghost.js';

let playing=false, t=0, frames=null, onEndCb=null;

export function isPlaying(){ return playing; }

export function startReplay(recordedFrames, onEnd){
  if(!recordedFrames || !recordedFrames.length) return false;
  frames=recordedFrames; t=0; playing=true; onEndCb=onEnd||null;
  placeGhostAtTime(frames, 0);
  return true;
}

export function stopReplay(){
  playing=false; frames=null; onEndCb=null;
  ghost.mesh.visible=false; ghost.visible=false;
}

/* advance the replay clock; returns false and fires the onEnd callback once
   playback reaches the end of the recording (or immediately if not playing) */
export function updateReplay(dt){
  if(!playing) return false;
  t+=dt;
  const ok=placeGhostAtTime(frames, t);
  if(!ok){
    playing=false; frames=null;
    const cb=onEndCb; onEndCb=null;
    if(cb) cb();
    return false;
  }
  return true;
}
