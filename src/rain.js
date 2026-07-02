/* =====================================================================
   APEX GP — Rain streaks (only ever imported when weather === 'rain')
   ~600 line-segment drops inside a 60 m box that rides on the camera;
   each frame the drops move down + windward and wrap inside the box
   (classic infinite-rain trick). Screen darkening is done by the
   lighting in scene.js, not here.
   ===================================================================== */
import * as THREE from 'three';
import { scene, camera } from './scene.js';

const COUNT=600, BOX=60, HALF=BOX/2;
const FALL=58, WIND_X=9, WIND_Z=4;              // m/s
const VLEN=Math.hypot(WIND_X,FALL,WIND_Z);
const DX=WIND_X/VLEN, DY=-FALL/VLEN, DZ=WIND_Z/VLEN;   // unit motion direction

const drops=new Float32Array(COUNT*3);          // drop heads, box-local coords
const lens=new Float32Array(COUNT);
for(let i=0;i<COUNT;i++){
  drops[i*3  ]=(Math.random()-0.5)*BOX;
  drops[i*3+1]=(Math.random()-0.5)*BOX;
  drops[i*3+2]=(Math.random()-0.5)*BOX;
  lens[i]=0.7+Math.random()*0.9;                // streak length (m)
}
const pos=new Float32Array(COUNT*6);
const geo=new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
const mat=new THREE.LineBasicMaterial({ color:0xbdc7d2, transparent:true, opacity:0.42, fog:false, depthWrite:false });
const lines=new THREE.LineSegments(geo,mat);
lines.frustumCulled=false;                      // positions are box-local; bounds never valid
scene.add(lines);

export function updateRain(dt){
  const mx=WIND_X*dt, my=-FALL*dt, mz=WIND_Z*dt;
  for(let i=0;i<COUNT;i++){
    let x=drops[i*3]+mx, y=drops[i*3+1]+my, z=drops[i*3+2]+mz;
    if(y<-HALF) y+=BOX;
    if(x>HALF) x-=BOX; else if(x<-HALF) x+=BOX;
    if(z>HALF) z-=BOX; else if(z<-HALF) z+=BOX;
    drops[i*3]=x; drops[i*3+1]=y; drops[i*3+2]=z;
    const l=lens[i], k=i*6;
    pos[k  ]=x;      pos[k+1]=y;      pos[k+2]=z;
    pos[k+3]=x-DX*l; pos[k+4]=y-DY*l; pos[k+5]=z-DZ*l;   // tail trails the motion
  }
  geo.attributes.position.needsUpdate=true;
  lines.position.copy(camera.position);         // box rides with the camera
}
