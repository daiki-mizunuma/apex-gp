/* =====================================================================
   APEX GP — TRACK (circuit selection, terrain helpers, road meshes)
   ===================================================================== */
import * as THREE from 'three';
import { N, ROAD_HALF, KERB_W, OFFTRACK, WALL_LAT, TOP_SPEED, GRIP } from './config.js';
import { scene } from './scene.js';
import { TEX } from './textures.js';
import { currentCircuit } from './circuits.js';

// Centreline control polygon comes from circuits.js; the title-screen picker
// stores the choice and reloads the page, so reading it once at import is enough.
const CIRCUIT=currentCircuit();
const PTS=CIRCUIT.points;
// Elevation: real per-point data when the circuit ships it (Suzuka's carries the
// figure-8 overpass); otherwise a gentle synthetic undulation (Tsukuba is nearly flat).
const TH=CIRCUIT.elev || PTS.map((_,i)=>{ const t=i/PTS.length*Math.PI*2; return 2.0+0.9*Math.sin(t+0.7)+0.5*Math.sin(2*t+2.1); });
const ctrl=PTS.map((p,i)=>new THREE.Vector3(p[0],TH[i],p[1]));
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

// track bounding box — drives grass/terrain plane sizing here and scenery scatter extents
export const BOUNDS=(()=>{
  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
  for(const p of SP){ if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; if(p.z<minZ)minZ=p.z; if(p.z>maxZ)maxZ=p.z; }
  return { minX,maxX,minZ,maxZ, cx:(minX+maxX)/2, cz:(minZ+maxZ)/2, exX:maxX-minX, exZ:maxZ-minZ };
})();

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

/* point-in-polygon (ray casting) against the closed track centreline —
   true for points enclosed by the loop (the infield), false outside it */
export function isInsideLoop(x,z){
  let inside=false;
  for(let i=0,j=N-1;i<N;j=i++){
    const xi=SP[i].x, zi=SP[i].z, xj=SP[j].x, zj=SP[j].z;
    const crosses=((zi>z)!==(zj>z)) && (x < (xj-xi)*(z-zi)/(zj-zi)+xi);
    if(crosses) inside=!inside;
  }
  return inside;
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

// kerbs — red/white strips at the corners only (like the real circuit), both sides.
// corner[i]: local radius under ~135 m (VMAX<52), dilated ±8 samples so the kerb
// starts before turn-in and runs past the exit.
const kerbMat=new THREE.MeshStandardMaterial({ map:TEX.kerb.map, normalMap:TEX.kerb.normal,
             roughness:0.55, metalness:0.0, normalScale:new THREE.Vector2(1,1), side:THREE.DoubleSide });
const corner=new Array(N).fill(false);
for(let i=0;i<N;i++) if(VMAX[i]<52) for(let d=-8;d<=8;d++) corner[((i+d)%N+N)%N]=true;

// striped run-off: paved zebra on the OUTSIDE of each tight corner (VMAX<38),
// extended 4 samples into the entry and 16 through the exit (where cars run wide).
// zebraR/zebraL mark the +RT / -RT sides; DRIVE_R/DRIVE_L are the per-side
// drivable half-widths (full grip within them) consumed by physics.js.
// (computed before the kerbs so the kerb mask can be widened to cover them)
const zebraR=new Array(N).fill(false), zebraL=new Array(N).fill(false);
export const DRIVE_R=new Array(N).fill(OFFTRACK), DRIVE_L=new Array(N).fill(OFFTRACK);
{
  const tight=[]; for(let i=0;i<N;i++) tight.push(VMAX[i]<38);
  const start=tight.indexOf(false);            // scan origin off any run so no run splits at the wrap
  if(start>=0){
    const closeRun=(from,to)=>{                // absolute (unwrapped) indices, from<=to
      let sum=0;                               // summed turn direction over the run (robust vs noise)
      for(let k=from;k<=to;k++){ const m=k%N, j=(m+4)%N;
        sum+=(FWD[j].x-FWD[m].x)*RT[m].x+(FWD[j].z-FWD[m].z)*RT[m].z; }
      const side = sum>0 ? -1 : 1;             // inside is +1 when turning right → zebra on -1, and vice versa
      const mask = side>0 ? zebraR : zebraL;
      for(let k=from-4;k<=to+16;k++) mask[((k%N)+N)%N]=true;
    };
    let runFrom=-1;
    for(let k=start;k<start+N;k++){
      if(tight[k%N]){ if(runFrom<0) runFrom=k; }
      else if(runFrom>=0){ closeRun(runFrom,k-1); runFrom=-1; }
    }
    if(runFrom>=0) closeRun(runFrom,start+N-1);
  }
  for(let i=0;i<N;i++){ if(zebraR[i]) DRIVE_R[i]=ROAD_HALF+4.3; if(zebraL[i]) DRIVE_L[i]=ROAD_HALF+4.3; }
}
// a zebra's inner edge must always tuck under a kerb — widen the kerb mask to cover
// the zebra's entry/exit extensions, which outrun the ±8 corner dilation at fast exits
for(let i=0;i<N;i++) if(zebraR[i]||zebraL[i]) corner[i]=true;
(function kerbs(){
  const pos=[], uv=[], idx=[];
  for(const side of [-1,1]){
    for(let i=0;i<N;i++){
      if(!corner[i]) continue;
      const j=(i+1)%N; if(j===0) continue;
      const ci=SP[i], cj=SP[j], ri=RT[i], rj=RT[j];
      const a1=ci.clone().addScaledVector(ri, side*ROAD_HALF);
      const a2=ci.clone().addScaledVector(ri, side*(ROAD_HALF+KERB_W));
      const b1=cj.clone().addScaledVector(rj, side*ROAD_HALF);
      const b2=cj.clone().addScaledVector(rj, side*(ROAD_HALF+KERB_W));
      const base=pos.length/3;
      pos.push(a1.x,ci.y+0.09,a1.z, a2.x,ci.y+0.09,a2.z, b1.x,cj.y+0.09,b1.z, b2.x,cj.y+0.09,b2.z);
      const v0=CUM[i]/3.0, v1=CUM[j]/3.0;
      uv.push(0,v0, 1,v0, 0,v1, 1,v1);
      // wind so the face normal points up on both sides (the +1 side reverses the
      // column direction: for side>0, (a2-a1)×(b2-a1) ∝ RT×FWD which points DOWN)
      if(side>0) idx.push(base,base+3,base+1, base,base+2,base+3);
      else       idx.push(base,base+1,base+3, base,base+3,base+2);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  const m=new THREE.Mesh(g,kerbMat); m.receiveShadow=true; scene.add(m);
})();

(function zebra(){
  const ZW=4.3, pos=[], uv=[], idx=[];
  const zt=TEX.kerb.map.clone(); zt.wrapS=zt.wrapT=THREE.RepeatWrapping; zt.repeat.set(1,1); zt.needsUpdate=true;
  for(const side of [-1,1]){
    const mask = side>0 ? zebraR : zebraL;
    for(let i=0;i<N;i++){
      if(!mask[i]) continue;
      const j=(i+1)%N; if(j===0) continue;
      const ci=SP[i], cj=SP[j], ri=RT[i], rj=RT[j];
      const a1=ci.clone().addScaledVector(ri, side*ROAD_HALF);
      const a2=ci.clone().addScaledVector(ri, side*(ROAD_HALF+ZW));
      const b1=cj.clone().addScaledVector(rj, side*ROAD_HALF);
      const b2=cj.clone().addScaledVector(rj, side*(ROAD_HALF+ZW));
      const base=pos.length/3;
      // inner edge tucks under the kerb; nearly flat outward so the strip is drivable
      pos.push(a1.x,ci.y+0.05,a1.z, a2.x,ci.y-0.10,a2.z, b1.x,cj.y+0.05,b1.z, b2.x,cj.y-0.10,b2.z);
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

// white guardrails (Armco) running continuously along both sides of the circuit.
// A constant lateral offset from the centreline self-intersects on the INSIDE of
// any corner tighter than the offset distance; WALL_LAT (13.3 m) now sits below
// the tightest hairpin radius (~16 m) so it can no longer fold back, and the
// inside-of-corner clamp additionally hugs tight corners. Rails are floored at
// the zebra edge on either side so an inside-clamped rail can't land on the
// exit run-off of an adjacent opposite-direction corner (S-curves).
function railOffset(k, side){
  const j=(k+4)%N, f0=FWD[k], f1=FWD[j], r=RT[k];
  const turn=(f1.x-f0.x)*r.x+(f1.z-f0.z)*r.z;      // >0: track curves toward +r (right)
  const innerSide = turn>0 ? 1 : -1;               // which side (+1/-1) is the inside of this corner
  let off=WALL_LAT;
  if(side===innerSide && VMAX[k]<TOP_SPEED-0.01){
    const R=(VMAX[k]*VMAX[k])/GRIP;                // local corner radius, back-derived from VMAX
    off=Math.max(ROAD_HALF+KERB_W+2, Math.min(WALL_LAT, R*0.72));
  }
  if(side>0 ? zebraR[k] : zebraL[k]) off=Math.max(off, ROAD_HALF+5.1);  // clear the drivable zebra (outer edge 11.3)
  return side*off;
}
function buildRail(side, y0, y1, mat){
  const pos=[], uv=[], idx=[];
  for(let i=0;i<=N;i++){ const k=i%N, c=SP[k], r=RT[k];
    const p=new THREE.Vector3().copy(c).addScaledVector(r, railOffset(k,side));
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
    scene.add( buildRail(side, 0.52, 0.76, railMat) );   // lower beam
    scene.add( buildRail(side, 0.92, 1.16, railMat) );   // upper beam
    const im=new THREE.InstancedMesh(postG, postMat, cnt); let n=0;
    for(let i=0;i<N && n<cnt;i+=step){
      const c=SP[i], r=RT[i];
      const p=new THREE.Vector3().copy(c).addScaledVector(r, railOffset(i,side)); p.y=c.y+0.6;
      const mm=new THREE.Matrix4().setPosition(p); im.setMatrixAt(n++, mm);
    }
    im.count=n; im.instanceMatrix.needsUpdate=true; im.castShadow=true; scene.add(im);
  }
})();

/* ---- Overpass supports: plain pillars wherever the road bridges well above
   the local terrain (Suzuka's figure-8 crossover). One instanced box every
   ~6 samples, skipping spots that would land on the lower road itself. ---- */
(function pillars(){
  const spots=[];
  for(let i=0;i<N;i+=6){
    const gy=terrainY(SP[i].x,SP[i].z), gap=SP[i].y-gy;
    // 3.0 m threshold: terrainY sits 0.6 m under the road and dips to the LOWEST
    // sample within ~32 m, so ordinary undulation reads as a ~2.6 m "gap" where
    // two track legs of different heights run close (Tsukuba's final corner) —
    // only a genuine bridge (Suzuka's ~8 m crossover) exceeds 3.0
    if(gap<=3.0) continue;
    let onRoad=false;
    for(let j=0;j<N;j++){                                // every sample: at 8 m spacing a j+=2 stride could miss the underpass
      if(SP[i].y-SP[j].y<2) continue;                    // only much-lower road segments matter
      const dx=SP[i].x-SP[j].x, dz=SP[i].z-SP[j].z;
      if(dx*dx+dz*dz<(ROAD_HALF+1)*(ROAD_HALF+1)){ onRoad=true; break; }
    }
    if(onRoad) continue;
    spots.push([SP[i].x, gy, SP[i].z, gap]);
  }
  if(!spots.length) return;
  const im=new THREE.InstancedMesh(new THREE.BoxGeometry(0.6,1,0.6),
            new THREE.MeshStandardMaterial({color:0x2a2d33, roughness:0.9}), spots.length);
  const m=new THREE.Matrix4();
  spots.forEach(([x,gy,z,gap],k)=>{ m.makeScale(1,gap,1); m.setPosition(x,gy+gap/2,z); im.setMatrixAt(k,m); });
  im.instanceMatrix.needsUpdate=true; im.castShadow=true; scene.add(im);
})();

/* ---- Grass: flat far-field plane + elevation-hugging terrain over the track ---- */
const farW=BOUNDS.exX+2600, farH=BOUNDS.exZ+2600;
TEX.grass.map.repeat.set(Math.round(farW/15),Math.round(farH/15));
TEX.grass.normal.repeat.set(Math.round(farW/15),Math.round(farH/15));
const grassMat=new THREE.MeshStandardMaterial({ map:TEX.grass.map, normalMap:TEX.grass.normal,
          roughness:1, metalness:0, normalScale:new THREE.Vector2(0.5,0.5) });
{
  const g=new THREE.PlaneGeometry(farW,farH);
  const ground=new THREE.Mesh(g,grassMat); ground.rotation.x=-Math.PI/2;
  ground.position.set(BOUNDS.cx,-0.5,BOUNDS.cz); ground.receiveShadow=true;
  scene.add(ground);
}
{ // displaced terrain: rises/falls with the track, settles to 0 at the edges
  const w=BOUNDS.exX+800, h=BOUNDS.exZ+800;
  const segX=Math.min(320,Math.round(w/7)), segZ=Math.min(320,Math.round(h/7));  // ~7 m cells, capped
  const g=new THREE.PlaneGeometry(w,h,segX,segZ);
  g.rotateX(-Math.PI/2);
  const cx=BOUNDS.cx, cz=BOUNDS.cz, pos=g.attributes.position;
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
