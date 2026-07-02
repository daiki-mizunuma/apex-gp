/* =====================================================================
   APEX GP — Motion blur (speed-scaled full-frame accumulation via the
   WebGPU post-processing pipeline; toggle with B)
   ===================================================================== */
import * as THREE from 'three';
import { pass } from 'three/tsl';
import { accumBlur } from './accumblur.js';
import { TOP_SPEED } from './config.js';
import { renderer, scene, camera } from './scene.js';

export const MBLUR=(function(){
  let ok=false, on=true, post=null, blurPass=null;
  function init(){
    post=new THREE.PostProcessing(renderer);
    const scenePass=pass(scene, camera);
    blurPass=accumBlur(scenePass, 0);   // damp is driven per-frame from car speed
    post.outputNode=blurPass;
    ok=true;
  }
  function resize(){ /* PostProcessing tracks the renderer size automatically */ }
  // called every frame regardless of the toggle: with damp 0 the accumulation
  // buffer is refreshed with the current frame, so re-enabling blur can never
  // flash a stale ghost of an old frame
  function render(speed){
    blurPass.damp.value = on ? Math.min(0.74, (speed/TOP_SPEED)*0.85) : 0;
    post.render();
  }
  function disable(){ ok=false; }
  return { init, resize, render, disable, toggle(){on=!on; return on;}, get on(){return on;}, get ok(){return ok;} };
})();

try{ MBLUR.init(); }catch(e){ console.warn('motion blur unavailable', e); }
