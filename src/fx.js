/* =====================================================================
   APEX GP — Tyre-smoke particle effect (pooled billboard sprites)
   =====================================================================
   Sprites (not raw Points) are used because each puff needs its own
   independently-animated scale/opacity/tint and Three.js sprites already
   auto-billboard to face the camera with zero per-frame math on our end.
   A fixed pool of pre-allocated sprites is reused round-robin instead of
   creating/destroying objects per spawn, so the hot path (spawnSmoke /
   updateSmoke, called every frame while drifting) does no allocation and
   never touches the scene graph — only cheap property mutation.
   ===================================================================== */
import * as THREE from 'three';

const POOL_SIZE = 48;

let pool = null;        // THREE.Sprite[] — pre-built, added to scene once
let cursor = 0;         // round-robin index of the next sprite to (re)use

// Builds the single shared soft circular "puff" texture used by every
// sprite in the pool (one canvas + one CanvasTexture, many materials).
function buildSmokeTexture(){
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.0, 'rgba(230,230,230,0.9)');
  g.addColorStop(0.4, 'rgba(230,230,230,0.55)');
  g.addColorStop(1.0, 'rgba(230,230,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function initSmoke(scene){
  const tex = buildSmokeTexture();
  pool = new Array(POOL_SIZE);
  for(let i=0;i<POOL_SIZE;i++){
    // Each sprite gets its own material (independent opacity animation),
    // but all materials share the one texture above.
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      color: 0xcccccc
    });
    mat.color.setScalar(0.75 + Math.random()*0.2);   // subtle per-puff tint variation
    const spr = new THREE.Sprite(mat);
    spr.scale.setScalar(0.01);
    spr.visible = false;
    spr.userData.vx = 0; spr.userData.vy = 0; spr.userData.vz = 0;
    spr.userData.age = 0; spr.userData.life = 1;
    spr.userData.baseScale = 0.5; spr.userData.baseOpacity = 0;
    // Added to the scene graph once up front — toggling visibility/opacity
    // per frame is far cheaper than add/remove churn on the scene graph.
    scene.add(spr);
    pool[i] = spr;
  }
  cursor = 0;
}

export function spawnSmoke(x, y, z, count){
  if(!pool) return;   // no-op if initSmoke() hasn't run yet
  for(let n=0;n<count;n++){
    const spr = pool[cursor];
    cursor = (cursor + 1) % POOL_SIZE;   // round-robin; recycles fading puffs when the pool is saturated

    spr.position.set(
      x + (Math.random()-0.5) * 0.5,
      y,
      z + (Math.random()-0.5) * 0.5
    );

    const scale = 0.4 + Math.random()*0.3;
    spr.scale.setScalar(scale);
    spr.userData.baseScale = scale;

    const mat = spr.material;
    const opacity = 0.35 + Math.random()*0.2;
    mat.opacity = opacity;
    spr.userData.baseOpacity = opacity;

    // gentle upward/outward drift
    spr.userData.vx = (Math.random()-0.5) * 0.6;
    spr.userData.vy = 0.4 + Math.random()*0.4;
    spr.userData.vz = (Math.random()-0.5) * 0.6;

    spr.userData.age = 0;
    spr.userData.life = 0.6 + Math.random()*0.4;

    spr.visible = true;
  }
}

export function updateSmoke(dt){
  if(!pool) return;   // no-op if initSmoke() hasn't run yet
  for(let i=0;i<POOL_SIZE;i++){
    const spr = pool[i];
    const u = spr.userData;
    if(u.age >= u.life){
      // Expired: stay invisible/silent until spawnSmoke() recycles it.
      if(spr.material.opacity !== 0) spr.material.opacity = 0;
      continue;
    }

    u.age += dt;
    const t = Math.min(1, u.age / u.life);   // 0 -> 1 across the puff's lifetime

    // constant-velocity drift, mutated in place (no new Vector3 allocations)
    spr.position.x += u.vx * dt;
    spr.position.y += u.vy * dt;
    spr.position.z += u.vz * dt;

    // smoke expands as it ages, growing to ~1.5x-2.5x its spawn scale by end of life
    spr.scale.setScalar(u.baseScale * (1 + t * 1.5));

    // linear fade-out from the spawn opacity down to 0 as age approaches life
    spr.material.opacity = u.baseOpacity * (1 - t);
  }
}
