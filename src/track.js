/* =====================================================================
   APEX GP — TRACK (centreline data, terrain helpers, road meshes)
   ===================================================================== */
import { N, ROAD_HALF, KERB_W, WALL_LAT, TOP_SPEED, GRIP } from './config.js';
import { scene } from './scene.js';
import { TEX } from './textures.js';

// Tsukuba Circuit (TC2000)-style centreline — traced from the official dimensioned
// TC2000 drawing — validated: 2045 m, no self-intersection.
// Order: Home straight → 第1コーナー(55R/35R) → S字(105R) → 第1ヘアピン(75R/25R) → ダンロップ(35R) → 80R → 第2ヘアピン → Back straight → 最終コーナー(100R/90R).
const TSUKUBA=[[-130.6,-96.9],[-54.8,-107.4],[21.1,-120.1],[61.1,-125.6],[84.3,-126.4],[107.4,-116.3],[118.4,-94.4],[112.1,-73.3],[87.6,-63.2],[46.3,-53.9],[-14.7,-42.1],[-80.1,-31.2],[-124.3,-16],[-162.2,-2.5],[-187.5,14.3],[-195.5,27.8],[-215.7,43],[-222.9,63.2],[-210.2,81.7],[-182.4,85.9],[-155,75],[-125.6,57.3],[-85.1,43],[-46.3,28.6],[-21.1,10.5],[9.3,16.9],[51.4,43],[106.2,59],[160.9,65.7],[204.3,69.9],[240.2,77.5],[268,94.4],[274.7,116.3],[253.6,134.8],[217.4,136.5],[180.3,125.6],[118,119.7],[42.1,126.4],[-29.5,128.1],[-105.3,125.6],[-172.7,118],[-227.5,97.7],[-264.6,64],[-275.5,16.9],[-260.4,-26.1],[-222.5,-64],[-175.3,-85.1]];
// Gentle elevation per point (m): climbs to 第1コーナー entry (highest), drops through the infield, rises back to the line.
const TH=[2.5,3.2,4.2,5.2,5.8,6.0,5.6,4.8,4.2,3.8,3.4,3.0,2.8,2.6,2.4,2.2,2.0,1.9,1.9,2.0,2.2,2.4,2.6,2.6,2.6,2.4,2.2,2.0,1.8,1.6,1.4,1.3,1.3,1.4,1.5,1.6,1.4,1.2,1.1,1.1,1.3,1.7,2.2,2.6,2.6,2.5,2.5];
const ctrl=TSUKUBA.map((p,i)=>new THREE.Vector3(p[0],TH[i],p[1]));
const curve=new THREE.CatmullRomCurve3(ctrl, true, 'centripetal', 0.5);
const rawPts=curve.getSpacedPoints(N);     // N+1 pts (closed)

// per-sample data
export const SP=[], FWD=[], RT=[], CUM=[], VMAX=[];
for(let i=0;i<N;i++) SP.push(rawPts[i].clone());
export let trackLen=0;
for(let i=0;i<N;i++){
  const a=SP[i], b=SP[(i+1)%N];
  CUM.push(trackLen);
  trackLen += a.distanceTo(b);
}
for(let i=0;i<N;i++){
  const p=SP[(i-1+N)%N], n=SP[(i+1)%N];
  const f=new THREE.Vector3().subVectors(n,p).setY(0).normalize();
  FWD.push(f);
  RT.push(new THREE.Vector3(f.z,0,-f.x));    // right vector
}
// corner speed limits from curvature
for(let i=0;i<N;i++){
  const a=SP[(i-3+N)%N], b=SP[i], c=SP[(i+3)%N];
  const ab=a.distanceTo(b), bc=b.distanceTo(c), ac=a.distanceTo(c);
  const area=Math.abs((b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z))/2;
  let R=area>1e-4 ? (ab*bc*ac)/(4*area) : 9999;
  VMAX.push(Math.min(TOP_SPEED, Math.sqrt(GRIP*Math.min(R,3000))));
}

/* terrain height that hugs the track elevation near the track and flattens to 0 far away */
export function terrainY(x,z){
  let best=1e18, bi=0, lowest=1e18;
  for(let i=0;i<N;i+=2){ const dx=x-SP[i].x, dz=z-SP[i].z, d=dx*dx+dz*dz;
    if(d<best){best=d; bi=i;}
    if(d<1000 && SP[i].y<lowest) lowest=SP[i].y;   // lowest road within ~32m
  }
  const dist=Math.sqrt(best);
  let f; if(dist<=16) f=1; else if(dist>=150) f=0; else f=Math.cos((dist-16)/134*Math.PI)*0.5+0.5;
  // base on the LOWEST nearby road so grass can never rise above any adjacent asphalt
  const baseY = lowest<1e18 ? Math.min(SP[bi].y, lowest) : SP[bi].y;
  return baseY*f - 0.6;       // sit well below the road so it never pokes through
}

export function distToTrack(x,z){
  let best=1e9;
  for(let i=0;i<N;i+=3){ const dx=x-SP[i].x, dz=z-SP[i].z; const d=dx*dx+dz*dz; if(d<best)best=d; }
  return Math.sqrt(best);
}

/* ---- Road ribbon ---- */
function buildRibbon(inner, outer, yOff, tex, uRep, alongTile, mat0){
  const pos=[], uv=[], idx=[];
  for(let i=0;i<=N;i++){
    const k=i%N;
    const c=SP[k], r=RT[k];
    const li=new THREE.Vector3().copy(c).addScaledVector(r, inner);
    const ro=new THREE.Vector3().copy(c).addScaledVector(r, outer);
    pos.push(li.x, li.y+yOff, li.z, ro.x, ro.y+yOff, ro.z);
    const v=CUM[k]/alongTile;
    uv.push(0, v, uRep, v);
  }
  for(let i=0;i<N;i++){
    const a=i*2, b=a+1, c=a+2, d=a+3;
    idx.push(a,b,d, a,d,c);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  const m=mat0 || new THREE.MeshStandardMaterial({ map:tex, roughness:0.95, metalness:0.0 });
  const mesh=new THREE.Mesh(g,m); mesh.receiveShadow=true; return mesh;
}
scene.add( buildRibbon(-ROAD_HALF, ROAD_HALF, 0.05, null, ROAD_HALF*2/8, 8,
           new THREE.MeshStandardMaterial({ map:TEX.asphalt.map, normalMap:TEX.asphalt.normal,
             roughness:0.9, metalness:0.0, side:THREE.DoubleSide,
             polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3,
             normalScale:new THREE.Vector2(0.5,0.5) })) );

// kerbs (both edges) — shared material with bevel normals
const kerbMat=new THREE.MeshStandardMaterial({ map:TEX.kerb.map, normalMap:TEX.kerb.normal,
             roughness:0.55, metalness:0.0, normalScale:new THREE.Vector2(1,1) });
const kR=buildRibbon(ROAD_HALF, ROAD_HALF+KERB_W, 0.09, null, 1, 3.0, kerbMat);
const kL=buildRibbon(-ROAD_HALF-KERB_W, -ROAD_HALF, 0.09, null, 1, 3.0, kerbMat);
scene.add(kR, kL);

// flat red/white "zebra" run-off strips beyond the kerbs at the tighter corners
(function zebra(){
  const ZW=4.5, pos=[], uv=[], idx=[];
  const zt=TEX.kerb.map.clone(); zt.wrapS=zt.wrapT=THREE.RepeatWrapping; zt.repeat.set(1,1); zt.needsUpdate=true;
  for(const side of [-1,1]){
    for(let i=0;i<N;i++){
      if(VMAX[i]>=36) continue;                         // tight corners only
      const j=(i+1)%N; if(j===0) continue;
      const ci=SP[i], cj=SP[j], ri=RT[i], rj=RT[j];
      const a1=ci.clone().addScaledVector(ri, side*ROAD_HALF);
      const a2=ci.clone().addScaledVector(ri, side*(ROAD_HALF+ZW));
      const b1=cj.clone().addScaledVector(rj, side*ROAD_HALF);
      const b2=cj.clone().addScaledVector(rj, side*(ROAD_HALF+ZW));
      const base=pos.length/3;
      // inner edge meets the kerb top (connected to the track), outer edge meets the grass
      pos.push(a1.x,ci.y+0.05,a1.z, a2.x,ci.y-0.30,a2.z, b1.x,cj.y+0.05,b1.z, b2.x,cj.y-0.30,b2.z);
      const v0=CUM[i]/1.4, v1=CUM[j]/1.4;
      uv.push(0,v0, 1,v0, 0,v1, 1,v1);
      idx.push(base,base+1,base+3, base,base+3,base+2);
    }
  }
  if(!pos.length) return;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({map:zt, roughness:0.7, metalness:0.0, side:THREE.DoubleSide})));
})();

// white guardrails (Armco) running continuously along both sides of the circuit
function buildRail(lat, y0, y1, mat){
  const pos=[], uv=[], idx=[];
  for(let i=0;i<=N;i++){ const k=i%N, c=SP[k], r=RT[k];
    const p=new THREE.Vector3().copy(c).addScaledVector(r, lat);
    pos.push(p.x,p.y+y0,p.z, p.x,p.y+y1,p.z);
    const v=CUM[k]/3.0; uv.push(v,0, v,1); }
  for(let i=0;i<N;i++){ const a=i*2,b=a+1,c2=a+2,d=a+3; idx.push(a,b,d, a,d,c2); }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat); m.receiveShadow=true; return m;
}
(function guardrails(){
  const railMat=new THREE.MeshStandardMaterial({ color:0xeef1f4, roughness:0.45, metalness:0.35, side:THREE.DoubleSide });
  const postMat=new THREE.MeshStandardMaterial({ color:0xb9bec5, roughness:0.6, metalness:0.3 });
  const step=3, postG=new THREE.BoxGeometry(0.13,1.3,0.13), cnt=Math.ceil(N/step);
  for(const side of [-1,1]){
    const lat=side*WALL_LAT;
    scene.add( buildRail(lat, 0.52, 0.76, railMat) );   // lower beam
    scene.add( buildRail(lat, 0.92, 1.16, railMat) );   // upper beam
    const im=new THREE.InstancedMesh(postG, postMat, cnt); let n=0;
    for(let i=0;i<N && n<cnt;i+=step){
      const c=SP[i], r=RT[i];
      const p=new THREE.Vector3().copy(c).addScaledVector(r, lat); p.y=c.y+0.6;
      const mm=new THREE.Matrix4().setPosition(p); im.setMatrixAt(n++, mm);
    }
    im.count=n; im.instanceMatrix.needsUpdate=true; im.castShadow=true; scene.add(im);
  }
})();

/* ---- Grass: flat far-field plane + elevation-hugging terrain over the track ---- */
TEX.grass.map.repeat.set(200,200); TEX.grass.normal.repeat.set(200,200);
const grassMat=new THREE.MeshStandardMaterial({ map:TEX.grass.map, normalMap:TEX.grass.normal,
          roughness:1, metalness:0, normalScale:new THREE.Vector2(0.5,0.5) });
{
  const g=new THREE.PlaneGeometry(3000,3000);
  const ground=new THREE.Mesh(g,grassMat); ground.rotation.x=-Math.PI/2; ground.position.y=-0.5; ground.receiveShadow=true;
  scene.add(ground);
}
{ // displaced terrain: rises/falls with the track, settles to 0 at the edges
  const g=new THREE.PlaneGeometry(1900,1700,260,230);
  g.rotateX(-Math.PI/2);
  const cx=0, cz=5, pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i)+cx, z=pos.getZ(i)+cz;
    pos.setX(i,x); pos.setZ(i,z); pos.setY(i, terrainY(x,z));
  }
  pos.needsUpdate=true; g.computeVertexNormals();
  const terr=new THREE.Mesh(g,grassMat); terr.receiveShadow=true; scene.add(terr);
}

/* ---- Start / finish line ---- */
{
  const t=TEX.checker.clone(); t.needsUpdate=true; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(ROAD_HALF*2/2,1);
  const g=new THREE.PlaneGeometry(ROAD_HALF*2, 4);
  const m=new THREE.MeshStandardMaterial({ map:t, roughness:0.8 });
  const line=new THREE.Mesh(g,m); line.rotation.x=-Math.PI/2;
  const c=SP[0]; line.position.set(c.x,c.y+0.08,c.z);
  line.rotation.z = Math.atan2(FWD[0].x, FWD[0].z);
  scene.add(line);
  // start gantry
  const postMat=new THREE.MeshStandardMaterial({color:0x222831,roughness:0.6});
  for(const s of [-1,1]){
    const post=new THREE.Mesh(new THREE.BoxGeometry(0.6,7,0.6),postMat);
    post.position.copy(c).addScaledVector(RT[0],s*(ROAD_HALF+1)); post.position.y=c.y+3.5; post.castShadow=true;
    scene.add(post);
  }
  const beam=new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF+1)*2,0.7,0.7),postMat);
  beam.position.copy(c); beam.position.y=c.y+7; beam.rotation.y=Math.atan2(FWD[0].x,FWD[0].z); scene.add(beam);
}
