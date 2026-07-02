/* =====================================================================
   APEX GP — Renderer / Scene / Camera / Lights  (WebGPU, WebGL2 fallback)
   ===================================================================== */
import * as THREE from 'three';
import { currentWeather, sunOffset } from './weather.js';

/* per-weather look. 'sunny' must stay exactly the original daylight values. */
const PAL={
  sunny :{ sky:0xd8e6f0, fog:[420,1900], hemi:[0xcfe6ff,0x4a5a45,0.75*Math.PI], sun:[0xfff3df,1.05*Math.PI] },
  rain  :{ sky:0x9aa4ad, fog:[200,1100], hemi:[0xbfc9d4,0x3f463f,0.55*Math.PI], sun:[0xe8ecef,0.35*Math.PI] },
  sunset:{ sky:0xf4b183, fog:[420,1700], hemi:[0xffcf9e,0x4d4033,0.50*Math.PI], sun:[0xff8b3d,0.90*Math.PI] },
}[currentWeather().id];

/* ---------------- Renderer / Scene ---------------- */
const container = document.getElementById('game');
export const renderer = new THREE.WebGPURenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const SKY_HORIZON = new THREE.Color(PAL.sky);
scene.background = SKY_HORIZON.clone();
scene.fog = new THREE.Fog(SKY_HORIZON.getHex(), PAL.fog[0], PAL.fog[1]);

export const camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.5, 4000);
camera.position.set(0, 30, -40);

/* ---------------- Lights ----------------
   Modern three.js uses physically-based light units (the old "legacy lights"
   mode multiplied intensities by π internally), so the r128-era intensities
   are scaled by ~π here to preserve the original daylight look. */
const hemi = new THREE.HemisphereLight(PAL.hemi[0], PAL.hemi[1], PAL.hemi[2]);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(PAL.sun[0], PAL.sun[1]);
// initial position only (title screen); the game loop re-offsets the sun from
// the player each frame using weather.sunOffset
sun.position.set(sunOffset.x, sunOffset.y, sunOffset.z);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left=-450; sc.right=450; sc.top=450; sc.bottom=-450; sc.near=50; sc.far=1200;
sc.updateProjectionMatrix();   // without this the shadow camera keeps its tiny default box
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);
