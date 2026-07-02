/* =====================================================================
   APEX GP — Scenery (trees, grandstands, Dunlop bridge, pits, barriers,
   billboards)  — side-effect module: builds scenery into the scene
   ===================================================================== */
import * as THREE from 'three';
import { N, ROAD_HALF, KERB_W, WALL_LAT } from './config.js';
import { scene } from './scene.js';
import { cvs } from './textures.js';
import { SP, FWD, RT, VMAX, trackLen, terrainY, distToTrack, isInsideLoop } from './track.js';

/* ---- Scenery: instanced trees + grandstands ---- */
(function trees(){
  const count=150;
  const trunkG=new THREE.CylinderGeometry(0.5,0.7,4,6);
  const leafG=new THREE.ConeGeometry(3.2,8,8);
  const trunkM=new THREE.MeshStandardMaterial({color:0x6b4a2b,roughness:1});
  const leafM=new THREE.MeshStandardMaterial({color:0x2f6d2f,roughness:1});
  const trunks=new THREE.InstancedMesh(trunkG,trunkM,count);
  const leaves=new THREE.InstancedMesh(leafG,leafM,count);
  leaves.castShadow=true;
  const m=new THREE.Matrix4(); let n=0, tries=0;
  while(n<count && tries<6000){
    tries++;
    const x=(Math.random()*2-1)*620, z=(Math.random()*2-1)*520;
    const d=distToTrack(x,z);
    if(d<WALL_LAT+8 || d>170) continue;
    if(isInsideLoop(x,z)) continue;    // never place trees in the infield
    const s=0.7+Math.random()*1.1;
    const gy=terrainY(x,z);
    m.makeScale(s,s,s); m.setPosition(x,gy+2*s,z); trunks.setMatrixAt(n,m);
    m.makeScale(s,s,s); m.setPosition(x,gy+7*s,z); leaves.setMatrixAt(n,m);
    n++;
  }
  trunks.count=n; leaves.count=n; trunks.instanceMatrix.needsUpdate=true; leaves.instanceMatrix.needsUpdate=true;
  scene.add(trunks,leaves);
})();
(function stands(){
  const seatMat=new THREE.MeshStandardMaterial({color:0x36507a,roughness:0.9});
  const baseMat=new THREE.MeshStandardMaterial({color:0xbfc4cb,roughness:0.9});
  for(let s=0;s<3;s++){
    const idx=(8 + s*22) % N;                 // spread along the home straight
    const samp=SP[idx];
    const pos=new THREE.Vector3().copy(samp).addScaledVector(RT[idx], ROAD_HALF+20);  // outside (spectator) side
    const gy=terrainY(pos.x,pos.z);
    const base=new THREE.Mesh(new THREE.BoxGeometry(14,7,42),baseMat);   // depth × height × length (along the track)
    base.position.set(pos.x,gy+3.5,pos.z); base.rotation.y=Math.atan2(FWD[idx].x,FWD[idx].z); base.castShadow=true; base.receiveShadow=true;
    scene.add(base);
    const seats=new THREE.Mesh(new THREE.BoxGeometry(12,1,40),seatMat);
    seats.position.set(pos.x,gy+7.6,pos.z); seats.rotation.y=base.rotation.y; scene.add(seats);
  }
})();

/* ---- Dunlop bridge (classic yellow tyre-shaped arch, à la Le Mans/Fuji) over the Dunlop corner ---- */
try{(function dunlop(){
  const di=Math.round(N*0.585)%N;          // ~58.5% of the lap: ダンロップコーナー section
  const c=SP[di], r=RT[di], f=FWD[di];
  const R=13, rotY=Math.atan2(f.x,f.z);
  const yellow=new THREE.MeshStandardMaterial({color:0xffd400, metalness:0.25, roughness:0.5});
  const steel =new THREE.MeshStandardMaterial({color:0x2b2f36, metalness:0.7, roughness:0.4});
  const basis=new THREE.Matrix4().makeBasis(r, new THREE.Vector3(0,1,0), f);  // X->across, Y->up, Z->along
  // big half-torus arch, stretched along the track for a tyre/bridge depth
  const arch=new THREE.Mesh(new THREE.TorusGeometry(R, 0.95, 14, 60, Math.PI), yellow);
  arch.quaternion.setFromRotationMatrix(basis); arch.position.copy(c); arch.position.y=c.y; arch.scale.set(1,1,2.4); arch.castShadow=true; scene.add(arch);
  // dark "tread" band on the inside of the arch
  const tread=new THREE.Mesh(new THREE.TorusGeometry(R, 0.6, 10, 60, Math.PI),
              new THREE.MeshStandardMaterial({color:0x16171b, roughness:0.7}));
  tread.quaternion.copy(arch.quaternion); tread.position.copy(c); tread.position.y=c.y; tread.scale.set(1,1,2.7); scene.add(tread);
  // feet
  for(const s of [-1,1]){
    const foot=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.4,3.4), steel);
    foot.position.copy(c).addScaledVector(r,s*R); foot.position.y=c.y+0.7; foot.rotation.y=rotY; foot.castShadow=true; scene.add(foot);
  }
  // DUNLOP wordmark banner across the arch
  const cv=cvs(512,128), x=cv.getContext('2d');
  x.fillStyle='#ffd400'; x.fillRect(0,0,512,128);
  x.fillStyle='#0b2a63'; x.fillRect(0,0,512,18); x.fillRect(0,110,512,18);
  x.fillStyle='#0b2a63'; x.font='bold 92px Arial'; x.textAlign='center'; x.textBaseline='middle'; x.fillText('DUNLOP',256,70);
  const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace;
  const banner=new THREE.Mesh(new THREE.BoxGeometry(R*1.5,3.2,0.4),
               new THREE.MeshStandardMaterial({map:tex, metalness:0.1, roughness:0.6}));
  banner.position.copy(c); banner.position.y=c.y+R*0.66; banner.rotation.y=rotY; banner.castShadow=true; scene.add(banner);
})(); }catch(_e){ console.warn('dunlop skipped', _e); }

/* ---- Tsukuba-style surroundings: pit complex, tyre barriers, billboards ---- */
try{(function tsukubaScenery(){
  // Mt. Tsukuba is rendered as part of the 360° panorama backdrop (see environment.js)
  // Pit complex + control tower (infield side of the main straight)
  (function(){
    const mi=Math.round(105/(trackLen/N))%N;   // garage centred ~105 m past the start line, along the home straight
    const c=SP[mi], r=RT[mi], f=FWD[mi], rotY=Math.atan2(f.x,f.z), off=30;
    const base=new THREE.Vector3().copy(c).addScaledVector(r,-off), gy=terrainY(base.x,base.z);
    const wall=new THREE.MeshStandardMaterial({color:0xe2e6ea, roughness:0.7});
    const dark=new THREE.MeshStandardMaterial({color:0x23262b, roughness:0.5, metalness:0.3});
    const red =new THREE.MeshStandardMaterial({color:0xc81e34, roughness:0.6});
    const garage=new THREE.Mesh(new THREE.BoxGeometry(11,7,110), wall);   // depth × height × length (along the straight)
    garage.position.set(base.x,gy+3.5,base.z); garage.rotation.y=rotY; garage.castShadow=true; garage.receiveShadow=true; scene.add(garage);
    const doors=new THREE.Mesh(new THREE.BoxGeometry(0.6,3.4,104), dark);
    doors.position.copy(base).addScaledVector(r,5.6); doors.position.y=gy+2.4; doors.rotation.y=rotY; scene.add(doors);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(11,0.9,110), red);
    roof.position.set(base.x,gy+7.1,base.z); roof.rotation.y=rotY; scene.add(roof);
    const sf=SP[0], sfr=RT[0], tb=new THREE.Vector3().copy(sf).addScaledVector(sfr,-off);
    const tgy=terrainY(tb.x,tb.z), trot=Math.atan2(FWD[0].x,FWD[0].z);
    const tower=new THREE.Mesh(new THREE.BoxGeometry(12,21,11), wall);
    tower.position.set(tb.x,tgy+10.5,tb.z); tower.rotation.y=trot; tower.castShadow=true; scene.add(tower);
    const glass=new THREE.Mesh(new THREE.BoxGeometry(12.6,5.5,11.6), new THREE.MeshStandardMaterial({color:0x16323f,metalness:0.5,roughness:0.18}));
    glass.position.set(tb.x,tgy+17,tb.z); glass.rotation.y=trot; scene.add(glass);
  })();
  // Tyre barriers on the outside of tight corners
  (function(){
    const pts=[];
    for(let i=0;i<N;i+=2){
      if(VMAX[i]<29){
        const f0=FWD[i], f1=FWD[(i+4)%N], r=RT[i];
        const turn=(f1.x-f0.x)*r.x+(f1.z-f0.z)*r.z, outer=turn>0?-1:1, dd=ROAD_HALF+KERB_W+1.7;
        pts.push([SP[i].x+r.x*outer*dd, SP[i].y, SP[i].z+r.z*outer*dd]);
      }
    }
    if(pts.length){
      const im=new THREE.InstancedMesh(new THREE.TorusGeometry(0.55,0.22,8,12),
                new THREE.MeshStandardMaterial({color:0x111114, roughness:0.85}), pts.length*2);
      const m=new THREE.Matrix4(); let n=0;
      for(const p of pts){ for(let h=0;h<2;h++){ m.makeRotationX(Math.PI/2); m.setPosition(p[0],p[1]+0.28+h*0.5,p[2]); im.setMatrixAt(n++,m); } }
      im.count=n; im.castShadow=true; im.instanceMatrix.needsUpdate=true; scene.add(im);
    }
  })();
  // Billboards along the main straight (spectator side)
  (function(){
    const txts=['TSUKUBA','JASC','APEX GP','DUNLOP','ENEOS'], bgs=['#11305e','#0a6b3a','#7a1020','#ffd400','#c8410b'];
    const sp=trackLen/N;
    for(let k=0;k<txts.length;k++){
      const idx=(Math.round((12+k*15)/sp))%N, c=SP[idx], r=RT[idx], f=FWD[idx];
      const pos=new THREE.Vector3().copy(c).addScaledVector(r, ROAD_HALF+5.5), gy=terrainY(pos.x,pos.z);
      const cv=cvs(256,64), x=cv.getContext('2d');
      x.fillStyle=bgs[k]; x.fillRect(0,0,256,64);
      x.fillStyle=(bgs[k]==='#ffd400')?'#0b2a63':'#ffffff'; x.font='bold 36px Arial'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(txts[k],128,34);
      const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace;
      const board=new THREE.Mesh(new THREE.BoxGeometry(8,2.2,0.3), new THREE.MeshStandardMaterial({map:tex, roughness:0.7}));
      board.position.set(pos.x,gy+2.6,pos.z); board.rotation.y=Math.atan2(f.x,f.z); board.castShadow=true; scene.add(board);
      const leg=new THREE.Mesh(new THREE.BoxGeometry(0.3,2.6,0.3), new THREE.MeshStandardMaterial({color:0x333740,roughness:0.7}));
      leg.position.set(pos.x,gy+1.3,pos.z); scene.add(leg);
    }
  })();
})(); }catch(_e){ console.warn('scenery skipped', _e); }
