/* =====================================================================
   APEX GP — CARS (model building, state, grid placement, track locate)
   ===================================================================== */
import { N, NUM_CARS } from './config.js';
import { scene } from './scene.js';
import { liveryTex } from './textures.js';
import { SP, FWD, RT, trackLen } from './track.js';
import { getDifficulty } from './difficulty.js';

/* shared (non-coloured) car materials — reflect scene.environment */
const MAT = {
  carbon: new THREE.MeshStandardMaterial({ color:0x14161a, metalness:0.5,  roughness:0.42 }),
  tyre:   new THREE.MeshStandardMaterial({ color:0x0b0b0d, metalness:0.0,  roughness:0.8 }),
  rim:    new THREE.MeshStandardMaterial({ color:0x26292e, metalness:1.0,  roughness:0.28 }),
  spoke:  new THREE.MeshStandardMaterial({ color:0xc9ccd2, metalness:1.0,  roughness:0.22 }),
  disc:   new THREE.MeshStandardMaterial({ color:0x55585e, metalness:0.9,  roughness:0.45 }),
  chrome: new THREE.MeshStandardMaterial({ color:0xd0d3d8, metalness:1.0,  roughness:0.18 }),
  glass:  new THREE.MeshStandardMaterial({ color:0x0a0c10, metalness:0.4,  roughness:0.06 }),
  intake: new THREE.MeshStandardMaterial({ color:0x050506, metalness:0.2,  roughness:0.6 })
};
function strut(ax,ay,az,bx,by,bz,rad,mat){
  const a=new THREE.Vector3(ax,ay,az), b=new THREE.Vector3(bx,by,bz);
  const dir=new THREE.Vector3().subVectors(b,a), len=dir.length();
  const m=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad,len,6), mat);
  m.position.copy(a).addScaledVector(dir,0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  return m;
}
function makeWheel(r, width){
  const pivot=new THREE.Object3D();
  const tyre=new THREE.Mesh(new THREE.CylinderGeometry(r,r,width,28), MAT.tyre);
  tyre.rotation.z=Math.PI/2; tyre.castShadow=true; pivot.add(tyre);
  const rim=new THREE.Mesh(new THREE.CylinderGeometry(r*0.62,r*0.62,width*0.96,24), MAT.rim);
  rim.rotation.z=Math.PI/2; pivot.add(rim);
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(r*0.5,r*0.5,width*0.5,18), MAT.disc);
  disc.rotation.z=Math.PI/2; pivot.add(disc);
  for(let i=0;i<3;i++){                                   // 3 bars -> 6-spoke star
    const sp=new THREE.Mesh(new THREE.BoxGeometry(width*0.9, r*1.15, 0.05), MAT.spoke);
    sp.rotation.x=i*Math.PI/3; pivot.add(sp);
  }
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(r*0.16,r*0.16,width*1.04,10), MAT.chrome);
  hub.rotation.z=Math.PI/2; pivot.add(hub);
  return pivot;
}
export function buildCar(base, accent){
  const car=new THREE.Group();
  const paint   = new THREE.MeshStandardMaterial({ map:liveryTex(base,accent), metalness:0.55, roughness:0.26 });
  const accentM = new THREE.MeshStandardMaterial({ color:accent, metalness:0.55, roughness:0.3 });
  const add=(geo,mat,x,y,z,cast)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); if(cast) m.castShadow=true; car.add(m); return m; };

  // floor pan + rear diffuser
  add(new THREE.BoxGeometry(1.7,0.07,4.7), MAT.carbon, 0,0.17,0, true);
  const diff=add(new THREE.BoxGeometry(1.5,0.34,0.7), MAT.carbon, 0,0.3,-2.25, false); diff.rotation.x=-0.35;
  // survival cell / tub
  add(new THREE.BoxGeometry(0.92,0.5,2.5), paint, 0,0.5,0.1, true);
  // tapered nose (2 stages) + pointed tip
  add(new THREE.BoxGeometry(0.6,0.42,1.5), paint, 0,0.48,1.9, true);
  add(new THREE.BoxGeometry(0.34,0.3,1.1), paint, 0,0.42,2.75, true);
  const tip=add(new THREE.ConeGeometry(0.17,0.6,4), accentM, 0,0.4,3.45, false); tip.rotation.x=Math.PI/2; tip.rotation.y=Math.PI/4;
  // engine cover tapering to rear + airbox intake
  add(new THREE.BoxGeometry(0.7,0.5,1.7), paint, 0,0.62,-1.05, true);
  add(new THREE.BoxGeometry(0.4,0.34,1.3), paint, 0,0.56,-2.0, true);
  add(new THREE.BoxGeometry(0.42,0.4,0.5), paint, 0,1.08,-0.35, true);
  add(new THREE.BoxGeometry(0.26,0.24,0.12), MAT.intake, 0,1.1,-0.1, false);
  // shark fin
  add(new THREE.BoxGeometry(0.05,0.42,1.5), accentM, 0,1.2,-1.5, false);
  // sidepods + intakes + bargeboards
  for(const s of [-1,1]){
    add(new THREE.BoxGeometry(0.62,0.5,1.9), paint, s*0.86,0.5,-0.15, true);
    add(new THREE.BoxGeometry(0.5,0.4,0.12), MAT.intake, s*0.86,0.55,0.82, false);
    const bb=add(new THREE.BoxGeometry(0.05,0.34,0.9), MAT.carbon, s*0.95,0.42,0.95, false); bb.rotation.y=s*0.2;
  }
  // cockpit + helmet + visor + halo
  add(new THREE.BoxGeometry(0.66,0.3,1.0), MAT.glass, 0,0.86,0.5, false);
  add(new THREE.SphereGeometry(0.28,18,14), accentM, 0,1.02,0.55, true);
  add(new THREE.BoxGeometry(0.34,0.12,0.16), MAT.glass, 0,1.04,0.78, false);
  const halo=add(new THREE.TorusGeometry(0.4,0.05,8,18,Math.PI), MAT.carbon, 0,1.12,0.5, false);
  halo.rotation.x=Math.PI/2; halo.rotation.z=Math.PI;
  add(new THREE.BoxGeometry(0.05,0.2,0.05), MAT.carbon, 0,1.0,0.95, false);
  // front wing: 2 elements + endplates
  add(new THREE.BoxGeometry(2.1,0.05,0.55), MAT.carbon, 0,0.26,3.25, false);
  add(new THREE.BoxGeometry(2.1,0.05,0.32), accentM, 0,0.38,3.5, false);
  for(const s of [-1,1]) add(new THREE.BoxGeometry(0.04,0.36,0.85), MAT.carbon, s*1.03,0.32,3.4, false);
  // rear wing: main + flap + endplates + pylon + beam wing
  add(new THREE.BoxGeometry(1.95,0.06,0.5), MAT.carbon, 0,1.32,-2.5, false);
  add(new THREE.BoxGeometry(1.95,0.05,0.3), accentM, 0,1.52,-2.55, false);
  for(const s of [-1,1]) add(new THREE.BoxGeometry(0.05,0.6,0.7), MAT.carbon, s*0.97,1.4,-2.5, false);
  add(new THREE.BoxGeometry(0.1,0.5,0.18), MAT.carbon, 0,1.05,-2.45, false);
  add(new THREE.BoxGeometry(1.4,0.06,0.3), MAT.carbon, 0,0.92,-2.35, false);

  // wheels
  const wheels={};
  const fx=1.0, rx=1.04, fz=2.3, rz=-1.85, fr=0.52, rr=0.6, fw=0.42, rw=0.6;
  wheels.fl=makeWheel(fr,fw); wheels.fl.position.set(-fx,fr,fz);
  wheels.fr=makeWheel(fr,fw); wheels.fr.position.set( fx,fr,fz);
  wheels.rl=makeWheel(rr,rw); wheels.rl.position.set(-rx,rr,rz);
  wheels.rr=makeWheel(rr,rw); wheels.rr.position.set( rx,rr,rz);
  car.add(wheels.fl,wheels.fr,wheels.rl,wheels.rr);
  // suspension wishbones
  for(const s of [-1,1]){
    car.add(strut(s*0.45,0.55,fz, s*fx,fr+0.05,fz, 0.035, MAT.chrome));
    car.add(strut(s*0.42,0.3,fz,  s*fx,fr-0.08,fz, 0.035, MAT.chrome));
    car.add(strut(s*0.42,0.58,rz, s*rx,rr+0.05,rz, 0.04,  MAT.chrome));
    car.add(strut(s*0.4,0.3,rz,   s*rx,rr-0.08,rz, 0.04,  MAT.chrome));
  }

  scene.add(car);
  return { group:car, wheels };
}

export const PALETTE=[
  {base:'#e10600',acc:'#ffd23c',name:'YOU'},   // player (index 0)
  {base:'#0a3cff',acc:'#dfe7ff',name:'BUL'},
  {base:'#00a36c',acc:'#caffea',name:'AMG'},
  {base:'#ff7a00',acc:'#2a2a2a',name:'MCL'},
  {base:'#19c3d8',acc:'#0a2a30',name:'AQU'},
  {base:'#9b3cff',acc:'#f0e0ff',name:'VIO'},
];

/* car state objects */
export const cars=[];
for(let i=0;i<NUM_CARS;i++){
  const p=PALETTE[i];
  const built=buildCar(p.base, p.acc);
  cars.push({
    id:i, isPlayer:i===0, name:p.name, mesh:built.group, wheels:built.wheels,
    pos:new THREE.Vector3(), heading:0, speed:0,
    seg:0, frac:0, prevFrac:0, lap:0, progress:0,
    lapStart:0, lastLap:0, bestLap:Infinity, finished:false, finishTime:0, place:i+1,
    lane: 0, aiBias:(Math.random()*2-1)*2, skill: i===0?1: (0.74+Math.random()*0.10),
    slip:0
  });
}

/* exhaust backfire flame for the player car (hidden until a downshift) */
{
  const fl=new THREE.Mesh(new THREE.ConeGeometry(0.34,1.3,10),
           new THREE.MeshBasicMaterial({color:0xffa024, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false, fog:false}));
  fl.rotation.x=-Math.PI/2; fl.position.set(0,0.55,-2.75); fl.visible=false;
  cars[0].mesh.add(fl); cars[0].flame=fl; cars[0].flameT=0; cars[0].gearPrev=1;
}

/* place grid behind start line */
export function placeGrid(){
  const spacing=trackLen/N;
  const d=getDifficulty();
  // order: AIs in front, player last
  const order=[1,2,3,4,5,0];
  order.forEach((carIdx, slot)=>{
    const c=cars[carIdx];
    const back = 10 + slot*9;                  // metres behind line
    const idx = (N - Math.round(back/spacing) % N + N) % N;
    const side = (slot%2===0)? 1 : -1;
    const base=SP[idx], r=RT[idx];
    c.pos.copy(base).addScaledVector(r, side*3.2);
    c.heading=Math.atan2(FWD[idx].x, FWD[idx].z);
    c.seg=idx; c.frac=idx/N; c.prevFrac=c.frac;
    c.speed=0; c.lap=0; c.progress=c.frac; c.finished=false; c.bestLap=Infinity;
    c.lane = side*3.2; c.slip=0; c.stuckT=0; c.steerVal=0;
    c.driftT=0; c.driftScore=0; c.driftAward=0; c.drifting=false;
    if(!c.isPlayer) c.skill = d.skillMin + Math.random()*(d.skillMax-d.skillMin);
    syncMesh(c);
  });
}
export function syncMesh(c){
  const gy = SP[c.seg] ? SP[c.seg].y : 0;
  c.groundY = gy;
  c.mesh.position.set(c.pos.x, gy, c.pos.z);
  c.mesh.rotation.y = c.heading;
}

/* nearest centreline sample (local search + global fallback) */
export function locate(c){
  let best=1e18, bi=c.seg;
  for(let d=-6; d<=26; d++){
    const i=((c.seg+d)%N+N)%N;
    const dx=c.pos.x-SP[i].x, dz=c.pos.z-SP[i].z;
    const dist=dx*dx+dz*dz;
    if(dist<best){ best=dist; bi=i; }
  }
  if(best>1600){                       // >40 m — the car escaped the local corridor, re-find globally
    for(let i=0;i<N;i+=2){
      const dx=c.pos.x-SP[i].x, dz=c.pos.z-SP[i].z, d2=dx*dx+dz*dz;
      if(d2<best){ best=d2; bi=i; }
    }
  }
  c.seg=bi;
  const r=RT[bi];
  const off=(c.pos.x-SP[bi].x)*r.x + (c.pos.z-SP[bi].z)*r.z;
  c.lateral=off;
  c.frac=bi/N;
  return off;
}
