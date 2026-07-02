/* =====================================================================
   APEX GP — Sky dome, 360° panorama backdrop, environment map
   (side-effect module: builds the environment into the scene)
   ===================================================================== */
import * as THREE from 'three';
import { scene } from './scene.js';
import { cvs, skyTex, panoramaTex } from './textures.js';
import { currentWeather } from './weather.js';
import { BOUNDS } from './track.js';

const WID=currentWeather().id;

// backdrop sizing must clear the selected circuit: Suzuka's far corners sit
// ~1100 m from a fixed Tsukuba-era centre, beyond the old 1050 m cylinder
const CX=BOUNDS.cx, CZ=BOUNDS.cz;
const REACH=Math.hypot(Math.max(BOUNDS.exX,1)/2, Math.max(BOUNDS.exZ,1)/2);

/* ---------------- Sky dome ---------------- */
{
  const geo=new THREE.SphereGeometry(Math.max(2200, REACH+1600),32,16);
  const mat=new THREE.MeshBasicMaterial({ map:skyTex(WID), side:THREE.BackSide, fog:false, depthWrite:false });
  const m=new THREE.Mesh(geo,mat); m.position.set(CX,0,CZ); scene.add(m);
}

/* ---------------- 360° distant backdrop cylinder ---------------- */
{
  const R=Math.max(1050, REACH+400);
  const geo=new THREE.CylinderGeometry(R,R,260*(R/1050),96,1,true);
  const mat=new THREE.MeshBasicMaterial({ map:panoramaTex(WID), side:THREE.BackSide, transparent:true, depthWrite:false, fog:true });
  const m=new THREE.Mesh(geo,mat); m.position.set(CX,73*(R/1050),CZ); scene.add(m);
}

/* ---------------- Environment map (glossy paint / chrome reflections) ---------------- */
(function(){
  try{
    const G={
      sunny :{ top:'#a9c8ea', hor:'#dce8f2', g0:'#7b8088', g1:'#34383d', sun:'255,255,255', sy:0.22, i:1 },
      rain  :{ top:'#8c96a0', hor:'#adb5bc', g0:'#5e6368', g1:'#2c3034', sun:null,          sy:0.22, i:0.45 },
      sunset:{ top:'#6f5f92', hor:'#f4b183', g0:'#6b5648', g1:'#2e2620', sun:'255,214,150', sy:0.44, i:1 },
    }[WID];
    const w=512,h=256,c=cvs(w,h),x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,0,h);
    g.addColorStop(0,G.top); g.addColorStop(0.48,G.hor);
    g.addColorStop(0.52,G.g0); g.addColorStop(1,G.g1);
    x.fillStyle=g; x.fillRect(0,0,w,h);
    if(G.sun){                                             // sun hotspot -> highlight (none when overcast)
      const sxp=w*0.68, syp=h*G.sy, r=72;
      const rg=x.createRadialGradient(sxp,syp,0,sxp,syp,r);
      rg.addColorStop(0,'rgba('+G.sun+',1)'); rg.addColorStop(1,'rgba('+G.sun+',0)');
      x.fillStyle=rg; x.beginPath(); x.arc(sxp,syp,r,0,7); x.fill();
    }
    const eq=new THREE.CanvasTexture(c);
    eq.mapping=THREE.EquirectangularReflectionMapping;
    eq.colorSpace=THREE.SRGBColorSpace;
    // modern three converts equirect environments internally (no manual PMREM needed)
    scene.environment=eq;
    scene.environmentIntensity=G.i;                        // dull reflections under overcast
  }catch(e){ /* reflections are optional */ }
})();
