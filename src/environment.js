/* =====================================================================
   APEX GP — Sky dome, 360° panorama backdrop, environment map
   (side-effect module: builds the environment into the scene)
   ===================================================================== */
import * as THREE from 'three';
import { scene } from './scene.js';
import { cvs, skyTex, panoramaTex } from './textures.js';

/* ---------------- Sky dome ---------------- */
{
  const geo=new THREE.SphereGeometry(2200,32,16);
  const mat=new THREE.MeshBasicMaterial({ map:skyTex(), side:THREE.BackSide, fog:false, depthWrite:false });
  scene.add(new THREE.Mesh(geo,mat));
}

/* ---------------- 360° distant backdrop cylinder ---------------- */
{
  const R=1050, geo=new THREE.CylinderGeometry(R,R,260,96,1,true);
  const mat=new THREE.MeshBasicMaterial({ map:panoramaTex(), side:THREE.BackSide, transparent:true, depthWrite:false, fog:true });
  const m=new THREE.Mesh(geo,mat); m.position.set(0,73,5); scene.add(m);
}

/* ---------------- Environment map (glossy paint / chrome reflections) ---------------- */
(function(){
  try{
    const w=512,h=256,c=cvs(w,h),x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#a9c8ea'); g.addColorStop(0.48,'#dce8f2');
    g.addColorStop(0.52,'#7b8088'); g.addColorStop(1,'#34383d');
    x.fillStyle=g; x.fillRect(0,0,w,h);
    const sxp=w*0.68, syp=h*0.22, r=72;                    // sun hotspot -> highlight
    const rg=x.createRadialGradient(sxp,syp,0,sxp,syp,r);
    rg.addColorStop(0,'rgba(255,255,255,1)'); rg.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=rg; x.beginPath(); x.arc(sxp,syp,r,0,7); x.fill();
    const eq=new THREE.CanvasTexture(c);
    eq.mapping=THREE.EquirectangularReflectionMapping;
    eq.colorSpace=THREE.SRGBColorSpace;
    // modern three converts equirect environments internally (no manual PMREM needed)
    scene.environment=eq;
  }catch(e){ /* reflections are optional */ }
})();
