/* =====================================================================
   APEX GP — Weather selection (single source of truth)
   Selection is applied at page load: the title-screen picker calls
   saveWeather() then location.reload(), so modules simply read the
   state below at import time. Keep this module dependency-light —
   textures.js imports it, so it must never import textures.js back.
   ===================================================================== */
export const WEATHERS=[
  {id:'sunny',label:'☀️ 晴天'},
  {id:'rain',label:'🌧️ 雨'},
  {id:'sunset',label:'🌆 夕暮れ'},
];

const KEY='apexgp_weather';
let stored=null;
try{ stored=localStorage.getItem(KEY); }catch(_e){ /* storage may be blocked */ }
const id = WEATHERS.some(w=>w.id===stored) ? stored : 'sunny';

export function currentWeather(){ return WEATHERS.find(w=>w.id===id); }
export function saveWeather(v){
  if(!WEATHERS.some(w=>w.id===v)) return;
  try{ localStorage.setItem(KEY,v); }catch(_e){}
}

/* lateral (and, via physics.js, longitudinal) grip multiplier */
export const gripFactor = id==='rain' ? 0.62 : 1.0;

/* sun position offset relative to the player (main.js adds it per frame;
   scene.js uses it for the initial title-screen framing) */
export const sunOffset =
  id==='sunset' ? {x:420,y:120,z:60}    // low warm evening sun
                : {x:220,y:380,z:160};  // high daylight (rain keeps it — light is diffuse anyway)

/* per-frame hook. rain.js touches the scene + camera, so it is loaded
   lazily: the dynamic import breaks any static cycle (rain.js -> scene.js
   -> weather.js) and sunny/sunset never pay for it. */
let rain=null;
if(id==='rain') import('./rain.js').then(m=>{ rain=m; })
  .catch(e=>console.warn('rain effect unavailable (grip stays wet)', e));
export function updateWeather(dt){ if(rain) rain.updateRain(dt); }
