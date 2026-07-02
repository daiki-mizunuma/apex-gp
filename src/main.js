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
import { toggleCam, updateCamera, idleCamFrame, updateReplayCamera, resetReplayCamera } from './camera.js';
import { race, resetRace, tickRace, updateProgress, updatePlaces } from './race.js';
import { updatePlayer, updateAI, boundaries, respawn, checkStuck, carCollisions } from './physics.js';
import { elc, updateHUD, showToast, tickToast, toggleHelp, showDriftPopup } from './hud.js';
import { MBLUR } from './mblur.js';
import { recordSample } from './recorder.js';
import { updateGhost, hideGhost } from './ghost.js';
import { isPlaying as replayIsPlaying, startReplay, stopReplay, updateReplay } from './replay.js';
import { initSmoke, spawnSmoke, updateSmoke } from './fx.js';
import { setDifficulty, getDifficulty, diffState } from './difficulty.js';
import { loadDifficulty, saveDifficulty, loadRecord, loadTrack, saveTrack } from './storage.js';

initSmoke(scene);

/* ---------------- difficulty picker (start overlay) ---------------- */
setDifficulty(loadDifficulty() || 'NORMAL');
const diffBtns=[...document.querySelectorAll('.diff-btn')];
function refreshDiffButtons(){
  diffBtns.forEach(b=>b.classList.toggle('active', b.dataset.diff===diffState.key));
}
diffBtns.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    setDifficulty(btn.dataset.diff);
    saveDifficulty(btn.dataset.diff);
    refreshDiffButtons();
  });
});
refreshDiffButtons();

/* ---------------- BGM track picker (start overlay) ---------------- */
{
  const saved=loadTrack();
  if(saved!=null) Audio.setTrack(saved);
}
function refreshBgmName(){ elc('bgmName').textContent=Audio.getTrackName(); }
elc('bgmPrev').addEventListener('click', ()=>{ Audio.setTrack(Audio.getTrackIndex()-1); saveTrack(Audio.getTrackIndex()); refreshBgmName(); });
elc('bgmNext').addEventListener('click', ()=>{ Audio.nextTrack(); saveTrack(Audio.getTrackIndex()); refreshBgmName(); });
refreshBgmName();

/* ---------------- input wiring ---------------- */
function toggleMute(){
  Audio.setMuted(!Audio.isMuted());
  elc('audioBtn').textContent = Audio.isMuted()? '🔇 SOUND OFF' : '🔊 SOUND ON';
}
const actions={
  toggleCam, toggleMute, resetRace, toggleHelp,
  toggleBlur(){ const v=MBLUR.toggle(); showToast(v?'MOTION BLUR: ON':'MOTION BLUR: OFF', 900); },
  respawnPlayer(){ if(race.state==='running' && !cars[0].finished) respawn(cars[0]); },
  nextTrack(){ const name=Audio.nextTrack(); saveTrack(Audio.getTrackIndex()); refreshBgmName(); showToast('🎵 '+name, 1200); },
  onPadConnected(){ try{ showToast('🎮 コントローラー接続', 1500); }catch(_){} },
  isIdle(){ return race.state==='idle'; }
};
initInput(actions);

/* ---------------- replay playback wiring ---------------- */
function beginReplay(frames){
  elc('results').style.display='none';
  elc('replayBar').style.display='block';
  resetReplayCamera();
  const started=startReplay(frames, endReplay);
  if(!started){ endReplay(); return; }
  addEventListener('keydown', skipReplayOnce);
}
function skipReplayOnce(){
  stopReplay();     // always stop — an orphaned replay would keep hijacking the camera afterwards
  // if a keypress (e.g. R) already kicked off a fresh race this same tick,
  // just clean up the replay UI quietly instead of re-showing stale results
  if(race.state!=='finished'){ removeEventListener('keydown', skipReplayOnce); elc('replayBar').style.display='none'; return; }
  endReplay();
}
function endReplay(){
  removeEventListener('keydown', skipReplayOnce);
  elc('replayBar').style.display='none';
  elc('results').style.display='flex';
}
elc('replayBtn').addEventListener('click', ()=>{
  const frames=race.bestRecording || loadRecord().ghost;
  if(frames) beginReplay(frames);
});

/* ---------------- main loop ---------------- */
const clock=new THREE.Clock();
const tmp=new THREE.Vector3();
const smokeTmp=new THREE.Vector3();

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

  // record the player's current lap (fuels the ghost car + post-race replay)
  if(race.state==='running' && !cars[0].finished){
    const p=cars[0];
    recordSample(race.currentRecording, race.clockT-p.lapStart, p.frac, p.pos.x, p.pos.z, p.heading, p.speed);
  }

  // drift score popup (one-shot flag set by physics.js when a slide ends)
  if(cars[0].driftAward){ showDriftPopup(cars[0].driftAward); cars[0].driftAward=0; }

  // tyre smoke while drifting / sliding
  if(cars[0].screech>0.4){
    const n=Math.ceil(cars[0].screech*2);
    const w=cars[0].wheels;
    w.rl.getWorldPosition(smokeTmp); spawnSmoke(smokeTmp.x, smokeTmp.y, smokeTmp.z, n);
    w.rr.getWorldPosition(smokeTmp); spawnSmoke(smokeTmp.x, smokeTmp.y, smokeTmp.z, n);
  }
  updateSmoke(dt);

  // audio
  if(Audio.started){
    const p=cars[0];
    Audio.engine(Math.abs(p.speed), p.throttle||0, race.state!=='idle');
    Audio.screech(p.screech||0);
  }

  // ghost car: live "beat your best" overlay while racing, cinematic replay once finished
  if(replayIsPlaying()){
    updateReplay(dt);
    updateReplayCamera(dt);
  } else {
    if(race.state==='running') updateGhost(race.clockT-cars[0].lapStart);
    else hideGhost();
    updateCamera(dt);
  }

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
elc('diffLbl').textContent=getDifficulty().label;
placeGrid();
idleCamFrame();   // pre-start camera framing
animate();
