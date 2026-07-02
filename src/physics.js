/* =====================================================================
   APEX GP — PHYSICS & AI (player driving model, AI drivers, walls,
   respawn, car-to-car collisions)
   ===================================================================== */
import { N, OFFTRACK, WALL_LAT, TOP_SPEED, GRIP, GRIP_GRASS } from './config.js';
import { SP, FWD, RT, VMAX } from './track.js';
import { cars, locate } from './cars.js';
import { keys, readPad } from './input.js';
import { Audio } from './audio.js';
import { race } from './race.js';
import { showToast } from './hud.js';
import { getDifficulty } from './difficulty.js';

const tmp=new THREE.Vector3();

export function updatePlayer(c, dt){
  let throttle = (keys['KeyW']||keys['ArrowUp'])?1:0;
  let braking  = (keys['KeyS']||keys['ArrowDown'])?1:0;
  let steer    = ((keys['KeyA']||keys['ArrowLeft'])?1:0) - ((keys['KeyD']||keys['ArrowRight'])?1:0);
  let hand     = keys['Space']?1:0;
  const pad=readPad();
  if(pad){
    const b=pad.buttons, ax=pad.axes;
    const r2=b[7]?b[7].value:0, l2=b[6]?b[6].value:0;
    throttle=Math.max(throttle, r2, (b[0]&&b[0].pressed)?1:0);   // R2 or ✕
    braking =Math.max(braking,  l2, (b[2]&&b[2].pressed)?1:0);   // L2 or □
    let sx=ax[0]||0; if(Math.abs(sx)<0.12) sx=0;                 // left-stick deadzone
    const dl=(b[14]&&b[14].pressed)?1:0, dr=(b[15]&&b[15].pressed)?1:0;
    steer=Math.max(-1, Math.min(1, steer + (dl-dr) - sx));       // +left / -right
    if((b[5]&&b[5].pressed)||(b[1]&&b[1].pressed)) hand=1;       // R1 or ○ = handbrake
  }
  c.throttle=throttle;

  const onTrack = Math.abs(c.lateral||0) < OFFTRACK;
  const grip = onTrack? GRIP : GRIP_GRASS;

  // longitudinal
  let accel=0;
  if(race.state==='running'){
    if(throttle>0.02) accel += 14*throttle*(onTrack?1:0.4);
    if(braking>0.05){ if(c.speed>0.5) accel -= 26*braking; else accel -= 12*braking; } // brake / reverse
  }
  accel -= 0.02*c.speed;                 // rolling
  accel -= 0.0022*c.speed*Math.abs(c.speed); // air
  if(!onTrack && c.speed>20) accel -= 8;  // grass drag
  c.speed += accel*dt;
  const minS=-12;
  c.speed=Math.max(minS, Math.min(TOP_SPEED, c.speed));

  // steering with grip-limited yaw
  const dir=c.speed>=0?1:-1;
  const sp=Math.abs(c.speed);
  const speedFactor=Math.min(1, sp/3);
  // smoothed steering with speed-sensitive gain: quick turn-in at low speed, calm at top speed
  const rate=(Math.abs(steer)>Math.abs(c.steerVal||0))?8:14;   // fast return-to-centre
  c.steerVal=(c.steerVal||0)+(steer-(c.steerVal||0))*Math.min(1,dt*rate);
  const sgain=2.6-1.1*Math.min(1,sp/TOP_SPEED);
  let desiredYaw = c.steerVal * sgain * speedFactor * dir;
  if(hand) desiredYaw *= 1.5;            // handbrake = sharper but slidey
  const maxYaw = (grip+7) / Math.max(sp,4);   // sharper turn-in than pure grip
  const yaw = Math.max(-maxYaw, Math.min(maxYaw, desiredYaw));
  c.heading += yaw*dt;

  // understeer feedback / screech amount
  const overSpeed = Math.abs(desiredYaw)>maxYaw+0.02 && sp>20;
  let screech=0;
  if(!onTrack && sp>12) screech=Math.max(screech,0.7);
  if(overSpeed) screech=Math.max(screech, 0.6);
  if(hand && sp>15) screech=Math.max(screech, 0.5);
  if(braking && sp>22) screech=Math.max(screech, 0.4);   // brake squeal
  c.screech=screech;

  // drift detection & scoring: sustained cornering-at-the-limit or handbrake
  // slides (not plain braking, not off-track) count as a "drift". Points
  // accrue while sliding and are awarded as one lump sum when the drift ends.
  const drifting = race.state==='running' && onTrack && sp>18 && (overSpeed || (hand && sp>15));
  if(drifting){
    c.driftT=(c.driftT||0)+dt;
    c.driftScore=(c.driftScore||0) + sp*Math.abs(c.steerVal||0)*dt*2.2;
  } else if(c.driftT>0){
    if(c.driftT>0.45 && c.driftScore>4) c.driftAward=Math.round(c.driftScore);
    c.driftT=0; c.driftScore=0;
  }
  c.drifting=drifting;

  // integrate position
  const fwd=tmp.set(Math.sin(c.heading),0,Math.cos(c.heading));
  c.pos.addScaledVector(fwd, c.speed*dt);

  // wheels visual
  const sa=(c.steerVal||0)*0.5;
  c.wheels.fl.rotation.y=sa; c.wheels.fr.rotation.y=sa;

  // downshift firing: flame + "braap" when braking down through the rev bands
  const pgear=Math.min(7, Math.floor(sp/(TOP_SPEED/7))+1);
  if(pgear < (c.gearPrev||1) && braking && sp>14){ c.flameT=0.16; if(Audio.started) Audio.downfire(); }
  c.gearPrev=pgear;
  if(c.flame){
    if(c.flameT>0){ c.flameT-=dt; c.flame.visible=true;
      const fs=0.7+Math.random()*0.7; c.flame.scale.set(fs,fs,0.8+Math.random()); c.flame.material.opacity=0.5+Math.random()*0.5;
    } else c.flame.visible=false;
  }
}

export function updateAI(c, dt){
  // lookahead target on centreline
  const sp=Math.abs(c.speed);
  const laAmt=Math.round(6 + sp*0.5);
  const ti=((c.seg+laAmt)%N+N)%N;
  // racing-line lane bias (ease grid lane -> small bias)
  c.lane += ((c.aiBias) - c.lane)*Math.min(1,dt*0.5);
  const target=new THREE.Vector3().copy(SP[ti]).addScaledVector(RT[ti], c.lane);

  // steering toward target
  const to=Math.atan2(target.x-c.pos.x, target.z-c.pos.z);
  let dh=to - c.heading;
  while(dh>Math.PI) dh-=2*Math.PI; while(dh<-Math.PI) dh+=2*Math.PI;
  const maxYaw=GRIP/Math.max(sp,4);
  const yaw=Math.max(-maxYaw,Math.min(maxYaw, dh*2.2));
  c.heading += yaw*dt;

  // target speed from upcoming curvature
  let vlimit=TOP_SPEED;
  for(let d=4; d<laAmt+12; d++){ const i=((c.seg+d)%N); if(VMAX[i]<vlimit) vlimit=VMAX[i]; }
  let targetSpeed=Math.min(TOP_SPEED*c.skill, vlimit*0.94);

  // separation: slow if a car just ahead
  for(const o of cars){
    if(o===c) continue;
    const dx=o.pos.x-c.pos.x, dz=o.pos.z-c.pos.z;
    const dist=Math.hypot(dx,dz);
    if(dist<7){ const f=Math.sin(c.heading)*dx+Math.cos(c.heading)*dz; // ahead?
      if(f>0){ targetSpeed*=0.8; c.lane += (c.lane>0?0.4:-0.4); } }
  }

  // rubber-band: keep the field within striking distance of the player
  // (clamp range scales with the selected difficulty — see difficulty.js)
  if(!cars[0].finished){
    const d=getDifficulty();
    const gap=c.progress-cars[0].progress;             // laps ahead (+) / behind (−)
    targetSpeed *= Math.max(d.rubberMin, Math.min(d.rubberMax, 1-gap*0.30));
  }

  const aiOff = Math.abs(c.lateral||0) > OFFTRACK;     // off the asphalt onto grass
  if(aiOff) targetSpeed = Math.min(targetSpeed, 16);
  if(race.state!=='running') targetSpeed=0;
  let accel = (targetSpeed>sp+0.5)? 11 : (targetSpeed<sp-0.5? -22 : 0);
  if(aiOff) accel = Math.min(accel, 5);                // limited grip on grass
  accel -= 0.02*c.speed + 0.0022*c.speed*Math.abs(c.speed);
  if(aiOff && c.speed>16) accel -= 9;                  // heavy grass drag (same as player)
  c.speed += accel*dt;
  c.speed=Math.max(0,Math.min(TOP_SPEED,c.speed));
  const fwd=tmp.set(Math.sin(c.heading),0,Math.cos(c.heading));
  c.pos.addScaledVector(fwd, c.speed*dt);
  c.screech = (Math.abs(dh)>0.06 && sp>35)?0.3:0;
}

export function boundaries(c){
  const off=locate(c);
  const LIM=WALL_LAT-1.6;                       // keep the car body clear of the rail
  if(Math.abs(off)>LIM){
    const sign=Math.sign(off);
    const base=SP[c.seg], r=RT[c.seg];
    c.pos.set(base.x + r.x*sign*LIM, 0, base.z + r.z*sign*LIM);
    // slide along the wall: remove only the velocity component pushing into it
    const vx=Math.sin(c.heading)*c.speed, vz=Math.cos(c.heading)*c.speed;
    const vn=(vx*r.x+vz*r.z)*sign;              // >0 → moving into the wall
    if(vn>0){
      const spd=Math.max(Math.abs(c.speed),0.1);
      const frac=Math.min(1, vn/spd);           // 0 = glancing … 1 = head-on
      const nvx=vx-r.x*sign*vn, nvz=vz-r.z*sign*vn;
      let ns=Math.hypot(nvx,nvz)*(1-0.45*frac); // one-off impact scrub (sliding keeps frac≈0)
      if(ns>0.5) c.heading = c.speed>=0 ? Math.atan2(nvx,nvz) : Math.atan2(-nvx,-nvz);
      else ns=0;
      c.speed=(c.speed<0?-1:1)*ns;
      if(spd>10 && frac>0.25 && c.isPlayer) Audio.thud(Math.min(0.8,spd/60));
      if(spd>8) c.screech=Math.max(c.screech||0,0.5);
    }
  }
}

/* put a car back on the nearest piece of track, facing the right way */
export function respawn(c){
  const i=c.seg, base=SP[i];
  c.pos.set(base.x,0,base.z);
  c.heading=Math.atan2(FWD[i].x,FWD[i].z);
  c.speed=0; c.lane=0; c.steerVal=0; c.stuckT=0;
  c.frac=i/N; c.prevFrac=c.frac; c.lateral=0;
  if(c.isPlayer) showToast('コース復帰', 1000);
}

/* auto-recover cars that are stuck off the asphalt */
export function checkStuck(c, dt){
  if(race.state==='running' && !c.finished){
    if(Math.abs(c.lateral||0)>OFFTRACK && Math.abs(c.speed)<4) c.stuckT=(c.stuckT||0)+dt;
    else c.stuckT=0;
    if(c.stuckT>(c.isPlayer?2.5:4)) respawn(c);
  }
}

export function carCollisions(){
  for(let i=0;i<cars.length;i++){
    for(let j=i+1;j<cars.length;j++){
      const a=cars[i], b=cars[j];
      const dx=b.pos.x-a.pos.x, dz=b.pos.z-a.pos.z;
      const d=Math.hypot(dx,dz);
      if(d>0.001 && d<4.2){
        const push=(4.2-d)/2;
        const nx=dx/d, nz=dz/d;
        a.pos.x-=nx*push; a.pos.z-=nz*push;
        b.pos.x+=nx*push; b.pos.z+=nz*push;
        const rel=Math.abs(a.speed-b.speed);
        a.speed*=0.92; b.speed*=0.92;
        if((a.isPlayer||b.isPlayer) && rel>8) Audio.thud(Math.min(0.5,rel/40));
      }
    }
  }
}
