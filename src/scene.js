/* =====================================================================
   APEX GP — Renderer / Scene / Camera / Lights  (WebGPU, WebGL2 fallback)
   ===================================================================== */
import * as THREE from 'three';

/* ---------------- Renderer / Scene ---------------- */
const container = document.getElementById('game');
export const renderer = new THREE.WebGPURenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const SKY_HORIZON = new THREE.Color(0xd8e6f0);
scene.background = SKY_HORIZON.clone();
scene.fog = new THREE.Fog(SKY_HORIZON.getHex(), 420, 1900);

export const camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.5, 4000);
camera.position.set(0, 30, -40);

/* ---------------- Lights ----------------
   Modern three.js uses physically-based light units (the old "legacy lights"
   mode multiplied intensities by π internally), so the r128-era intensities
   are scaled by ~π here to preserve the original daylight look. */
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a45, 0.75*Math.PI);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff3df, 1.05*Math.PI);
sun.position.set(220, 380, 160);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left=-450; sc.right=450; sc.top=450; sc.bottom=-450; sc.near=50; sc.far=1200;
sc.updateProjectionMatrix();   // without this the shadow camera keeps its tiny default box
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);
