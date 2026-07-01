/* =====================================================================
   APEX GP — CAMERA (chase / mid / cockpit + idle orbit)
   ===================================================================== */
import { TOP_SPEED } from './config.js';
import { camera } from './scene.js';
import { cars } from './cars.js';
import { showToast } from './hud.js';

let camMode=1; // 0 chase, 1 mid (default), 2 cockpit
const camPos=new THREE.Vector3(0,30,-40);
const CAM_NAMES=['CHASE VIEW','MID VIEW','COCKPIT VIEW'];

export function toggleCam(){ camMode=(camMode+1)%3; showToast(CAM_NAMES[camMode], 700); }
export function setCamMode(m){ camMode=m; }

export function updateCamera(dt){
  const p=cars[0];
  const fwd=new THREE.Vector3(Math.sin(p.heading),0,Math.cos(p.heading));
  const gy=p.groundY||0;
  if(camMode===0){            // far chase
    const desired=new THREE.Vector3().copy(p.pos).addScaledVector(fwd,-12.5); desired.y=gy+5.2;
    camPos.lerp(desired, Math.min(1, dt*4.5));
    camera.position.copy(camPos);
    const look=new THREE.Vector3().copy(p.pos).addScaledVector(fwd,9); look.y=gy+1.6;
    camera.lookAt(look);
  } else if(camMode===1){     // mid: close near-chase / hood cam
    const desired=new THREE.Vector3().copy(p.pos).addScaledVector(fwd,-3.6); desired.y=gy+2.0;
    camPos.lerp(desired, Math.min(1, dt*7.5));
    camera.position.copy(camPos);
    const look=new THREE.Vector3().copy(p.pos).addScaledVector(fwd,14); look.y=gy+1.35;
    camera.lookAt(look);
  } else {                    // cockpit
    const head=new THREE.Vector3().copy(p.pos).addScaledVector(fwd,0.2); head.y=gy+1.55;
    camera.position.copy(head);
    const look=new THREE.Vector3().copy(p.pos).addScaledVector(fwd,30); look.y=gy+1.2;
    camera.lookAt(look);
  }
  // speed FOV kick
  const targetFov = 60 + (p.speed/TOP_SPEED)*16;
  camera.fov += (targetFov-camera.fov)*Math.min(1,dt*3);
  camera.updateProjectionMatrix();
}

/* pre-race orbiting view around the grid */
export function idleCamFrame(){
  const t=performance.now()*0.0002;
  camera.position.set(Math.cos(t)*60, 28, Math.sin(t)*60 + 20);
  camera.lookAt(cars[0].pos.x, 1, cars[0].pos.z);
}
