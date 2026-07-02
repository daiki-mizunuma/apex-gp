/* =====================================================================
   APEX GP — RACE STATE (countdown, laps, places, results)
   ===================================================================== */
import { TOTAL_LAPS } from './config.js';
import { cars, placeGrid } from './cars.js';
import { showCount, autoHideHelp, renderResults, hideResults, elc } from './hud.js';
import { setCamMode } from './camera.js';
import { newRecording } from './recorder.js';
import { loadRecord, saveBestLap } from './storage.js';
import { setGhostFrames } from './ghost.js';
import { getDifficulty } from './difficulty.js';

/* mutable race state shared across modules */
export const race = {
  state:'idle',          // idle, countdown, running, finished
  clockT:0,
  countVal:0, countTimer:0,
  finishOrder:[],
  currentRecording:newRecording(),  // player's in-progress lap recording
  bestRecording:null                // frames for the best lap set THIS session (for the Replay button)
};

export function startCountdown(){
  race.state='countdown'; race.countVal=3; race.countTimer=0; race.clockT=0;
  race.finishOrder=[];
  showCount('3');
}
export function resetRace(){
  placeGrid();
  cars.forEach(c=>{ c.lastLap=0; c.bestLap=Infinity; c.finished=false; c.place=c.id+1; c.lapStart=0; });

  // seed the player's best lap / ghost from persisted storage so both survive reloads
  const rec=loadRecord();
  cars[0].bestLap=(rec.bestLap!=null)?rec.bestLap:Infinity;
  setGhostFrames(rec.ghost);
  race.currentRecording=newRecording();
  race.bestRecording=null;

  elc('diffLbl').textContent=getDifficulty().label;
  hideResults();
  setCamMode(0);
  startCountdown();
}

/* countdown + race clock — called once per frame */
export function tickRace(dt){
  if(race.state==='countdown'){
    race.countTimer+=dt;
    if(race.countTimer>=1){ race.countTimer-=1; race.countVal--;
      if(race.countVal>0) showCount(String(race.countVal));
      else if(race.countVal===0) showCount('GO!');
      else { race.state='running'; autoHideHelp(); }
    }
  }
  if(race.state==='running'||race.state==='finished') race.clockT+=dt;
}

export function updateProgress(c){
  // lap crossing detection
  const f=c.frac;
  if(c.prevFrac>0.8 && f<0.2){ c.lap++; onLap(c); }
  else if(c.prevFrac<0.2 && f>0.8){ c.lap=Math.max(0,c.lap-1); } // went backwards
  c.prevFrac=f;
  c.progress=c.lap + f;
}
function onLap(c){
  // c.lap just incremented. lap 1 => start of race lap1 (no time yet)
  if(c.lap>=2){ // completed a full lap
    const lapTime=race.clockT - c.lapStart;
    c.lastLap=lapTime;
    if(lapTime<c.bestLap) c.bestLap=lapTime;
    if(c.isPlayer){
      const frames=race.currentRecording.frames;
      if(saveBestLap(lapTime, frames)){
        race.bestRecording=frames;
        setGhostFrames(frames);          // chase your own new best from here on
      }
    }
  }
  c.lapStart=race.clockT;
  if(c.isPlayer) race.currentRecording=newRecording();   // start recording the next lap fresh
  if(c.lap > TOTAL_LAPS && !c.finished){
    c.finished=true; c.finishTime=race.clockT; race.finishOrder.push(c);
    if(c.isPlayer) onPlayerFinish();
  }
}

export function updatePlaces(){
  const arr=cars.slice().sort((a,b)=>{
    if(a.finished&&b.finished) return a.finishTime-b.finishTime;
    if(a.finished) return -1; if(b.finished) return 1;
    return b.progress-a.progress;
  });
  arr.forEach((c,i)=> c.place=i+1);
  return arr;
}

/* ---- results ---- */
function onPlayerFinish(){
  race.state='finished';
  setTimeout(showResults, 600);
}
function showResults(){
  // ensure all AI get a finishing order by progress
  const final=cars.slice().sort((a,b)=>{
    if(a.finished&&b.finished) return a.finishTime-b.finishTime;
    if(a.finished) return -1; if(b.finished) return 1;
    return b.progress-a.progress;
  });
  const hasReplay=!!(race.bestRecording || loadRecord().ghost);
  renderResults(final, hasReplay);
}
