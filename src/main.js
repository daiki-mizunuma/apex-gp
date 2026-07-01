/* =====================================================================
   APEX GP — MAIN (wiring + game loop + boot)
   ===================================================================== */
import { TOTAL_LAPS, NUM_CARS } from './config.js';
import { renderer, scene, camera, sun } from './scene.js';
import './environment.js';
import './scenery.js';
import { cars, placeGrid, syncMesh, locate } from './cars.js';
import { Audio } from './audio.js';
import { initInput, gamepadActions } from './input.js';
import { toggleCam, updateCamera, idleCamFrame } from './camera.js';
import { race, resetRace, tickRace, updateProgress, updatePlaces } from './race.js';
import { updatePlayer, updateAI, boundaries, respawn, checkStuck, carCollisions } from './physics.js';
import { elc, updateHUD, showToast, tickToast, toggleHelp } from './hud.js';
import { MBLUR } from './mblur.js';

/* ---------------- input wiring ---------------- */
function toggleMute(){
  Audio.setMuted(!Audio.isMuted());
  elc('audioBtn').textContent = Audio.isMuted()? '🔇 SOUND OFF' : '🔊 SOUND ON';
}
const actions={
  toggleCam, toggleMute, resetRace, toggleHelp,
  toggleBlur(){ const v=MBLUR.toggle(); showToast(v?'MOTION BLUR: ON':'MOTION BLUR: OFF', 900); },
  respawnPlayer(){ if(race.state==='running' && !cars[0].finished) respawn(cars[0]); },
  onPadConnected(){ try{ showToast('🎮 コントローラー接続', 1500); }catch(_){} },
  isIdle(){ return race.state==='idle'; }
};
initInput(actions);

/* ---------------- main loop ---------------- */
const clock=new THREE.Clock();
const tmp=new THREE.Vector3();

function animate(){
  requestAnimationFrame(animate);
  gamepadActions(actions);
  let dt=clock.getDelta(); if(dt>0.05) dt=0.05;

  tickRace(dt);

  // physics
  for(const c of cars){
    if(c.finished){ // coast to stop
      c.speed*=0.985; const fwd=tmp.set(Math.sin(c.heading),0,Math.cos(c.heading));
      c.pos.addScaledVector(fwd,c.speed*dt); locate(c);
    } else if(c.isPlayer){ updatePlayer(c,dt); }
    else { updateAI(c,dt); }
  }
  carCollisions();
  for(const c of cars){
    boundaries(c);
    checkStuck(c,dt);
    updateProgress(c); syncMesh(c);
  }
  const order=updatePlaces();

  // audio
  if(Audio.started){
    const p=cars[0];
    Audio.engine(Math.abs(p.speed), p.throttle||0, race.state!=='idle');
    Audio.screech(p.screech||0);
  }

  updateCamera(dt);
  // sun follows player for crisp shadows
  sun.position.set(cars[0].pos.x+220, 380, cars[0].pos.z+160);
  sun.target.position.copy(cars[0].pos);

  updateHUD(order, race.clockT);
  tickToast(dt);

  if(MBLUR.ok && MBLUR.on){ try{ MBLUR.render(Math.abs(cars[0].speed)); }catch(err){ MBLUR.toggle(); renderer.setRenderTarget(null); renderer.render(scene,camera); } }
  else { renderer.setRenderTarget(null); renderer.render(scene,camera); }
}

/* ---------------- boot ---------------- */
elc('audioBtn').addEventListener('click', toggleMute);
elc('startBtn').addEventListener('click', ()=>{
  Audio.init(); Audio.resume();
  elc('overlay').style.display='none';
  resetRace();
});
elc('againBtn').addEventListener('click', resetRace);

addEventListener('resize', ()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  MBLUR.resize();
});

elc('lapTot').textContent=TOTAL_LAPS;
elc('posTot').textContent=NUM_CARS;
placeGrid();
idleCamFrame();   // pre-start camera framing
animate();
