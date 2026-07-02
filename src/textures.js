/* =====================================================================
   APEX GP — Procedural textures (canvas)
   ===================================================================== */
import * as THREE from 'three';
import { currentWeather } from './weather.js';   // weather.js stays texture-free (no cycle)

// WebGPU guarantees anisotropy up to 16, but on the WebGL2 fallback the real
// device limit is only knowable after the async backend init. Textures start
// at 16 and main.js clamps them via clampAnisotropy() on the first frame
// (protects rare WebGL2 devices without the anisotropic-filtering extension).
const MAXANI=16;
const anisoTextures=[];

export function clampAnisotropy(max){
  for(const t of anisoTextures){
    if(t.anisotropy>max){ t.anisotropy=max; t.needsUpdate=true; }
  }
}

export function cvs(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
export function texFrom(canvas, srgb){
  const t=new THREE.CanvasTexture(canvas);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=MAXANI;
  t.generateMipmaps=true; t.minFilter=THREE.LinearMipmapLinearFilter;
  if(srgb) t.colorSpace=THREE.SRGBColorSpace;
  anisoTextures.push(t);
  return t;
}
// seamless fractal value-noise (FBM) -> Float32 [0,1]
function fbm(size, octaves, persistence, baseCells){
  const out=new Float32Array(size*size);
  const layers=[]; let amp=1, cells=baseCells, max=0;
  for(let o=0;o<octaves;o++){
    const g=new Float32Array(cells*cells);
    for(let i=0;i<g.length;i++) g[i]=Math.random();
    layers.push({cells,g,amp}); max+=amp; amp*=persistence; cells*=2;
  }
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      let v=0;
      for(let l=0;l<layers.length;l++){
        const lc=layers[l].cells, g=layers[l].g, a=layers[l].amp;
        const fx=x/size*lc, fy=y/size*lc;
        const x0=Math.floor(fx)%lc, y0=Math.floor(fy)%lc;
        const x1=(x0+1)%lc, y1=(y0+1)%lc;
        const tx=fx-Math.floor(fx), ty=fy-Math.floor(fy);
        const sx=tx*tx*(3-2*tx), sy=ty*ty*(3-2*ty);
        const p00=g[y0*lc+x0], p10=g[y0*lc+x1], p01=g[y1*lc+x0], p11=g[y1*lc+x1];
        const top=p00+(p10-p00)*sx, bot=p01+(p11-p01)*sx;
        v+=(top+(bot-top)*sy)*a;
      }
      out[y*size+x]=v/max;
    }
  }
  return out;
}
// build a tangent-space normal map texture from a height field
function normalTex(height, size, strength){
  const data=new Uint8ClampedArray(size*size*4);
  const H=(x,y)=>height[(((y%size)+size)%size)*size + (((x%size)+size)%size)];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const hl=H(x-1,y),hr=H(x+1,y),hd=H(x,y-1),hu=H(x,y+1);
    let nx=(hl-hr)*strength, ny=(hd-hu)*strength, nz=1;
    const il=1/Math.hypot(nx,ny,nz); nx*=il; ny*=il; nz*=il;
    const i=(y*size+x)*4;
    data[i]=(nx*.5+.5)*255; data[i+1]=(ny*.5+.5)*255; data[i+2]=(nz*.5+.5)*255; data[i+3]=255;
  }
  const c=cvs(size,size); c.getContext('2d').putImageData(new ImageData(data,size,size),0,0);
  return texFrom(c,false);
}

function asphaltTex(){
  const S=512;
  const wet = currentWeather().id==='rain';       // rain -> darker, slightly blue wet look
  const blotch=fbm(S,4,0.55,4), grain=fbm(S,3,0.6,48), fine=fbm(S,2,0.7,160);
  const col=new Uint8ClampedArray(S*S*4), h=new Float32Array(S*S);
  for(let i=0;i<S*S;i++){
    let g=54 + (blotch[i]-0.5)*26 + (grain[i]-0.5)*30 + (fine[i]-0.5)*16;
    if(grain[i]>0.80) g+=48*(grain[i]-0.80)/0.20;   // light aggregate stones
    if(blotch[i]<0.16) g-=12;                         // darker oil/tyre patches
    g=Math.max(24,Math.min(120,g));
    if(wet) g*=0.68;
    const k=i*4; col[k]=g; col[k+1]=g; col[k+2]=g+(wet?7:4); col[k+3]=255;
    h[i]=grain[i]*0.7+fine[i]*0.3;
  }
  const cc=cvs(S,S); cc.getContext('2d').putImageData(new ImageData(col,S,S),0,0);
  return { map:texFrom(cc,true), normal:normalTex(h,S,2.0) };
}
function grassTex(){
  const S=512;
  const patch=fbm(S,4,0.55,6), blade=fbm(S,2,0.7,160);
  const col=new Uint8ClampedArray(S*S*4), h=new Float32Array(S*S);
  for(let i=0;i<S*S;i++){
    const t=patch[i]*0.6+blade[i]*0.4;
    const r=46+(patch[i]-0.5)*30+(blade[i]-0.5)*22;
    const g=98+(t-0.5)*74;
    const b=40+(patch[i]-0.5)*22;
    const k=i*4;
    col[k]=Math.max(22,Math.min(120,r)); col[k+1]=Math.max(60,Math.min(186,g)); col[k+2]=Math.max(18,Math.min(92,b)); col[k+3]=255;
    h[i]=blade[i];
  }
  const cc=cvs(S,S); cc.getContext('2d').putImageData(new ImageData(col,S,S),0,0);
  return { map:texFrom(cc,true), normal:normalTex(h,S,1.4) };
}
function kerbTex(){
  const S=256, c=cvs(S,S), x=c.getContext('2d');
  x.fillStyle='#cf1b1b'; x.fillRect(0,0,S,S/2);
  x.fillStyle='#f4f4f4'; x.fillRect(0,S/2,S,S/2);
  const grd=x.createLinearGradient(0,0,S,0);
  grd.addColorStop(0,'rgba(0,0,0,.4)'); grd.addColorStop(.5,'rgba(255,255,255,.14)'); grd.addColorStop(1,'rgba(0,0,0,.4)');
  x.fillStyle=grd; x.fillRect(0,0,S,S);
  const h=new Float32Array(S*S);
  for(let y=0;y<S;y++)for(let xx=0;xx<S;xx++){
    const bevel=Math.min(1,(Math.min(xx,S-1-xx)/(S*0.5))*2.4);   // raised ridge across width
    h[y*S+xx]=((y<S/2)?0.85:0.45)*bevel;
  }
  return { map:texFrom(c,true), normal:normalTex(h,S,1.7) };
}
function checkerTex(){
  const S=256, s=S/8, c=cvs(S,S), x=c.getContext('2d');
  for(let i=0;i<8;i++)for(let j=0;j<8;j++){ x.fillStyle=((i+j)&1)?'#0c0c0c':'#fafafa'; x.fillRect(i*s,j*s,s,s); }
  return texFrom(c,true);
}
export function skyTex(weather='sunny'){
  const W=1024,H=512,c=cvs(W,H),x=c.getContext('2d');
  // zenith -> horizon gradient (per weather; horizon end matches scene.js SKY_HORIZON)
  const stops = weather==='rain'
    ? [[0.0,'#6f7a84'],[0.50,'#8b96a0'],[0.85,'#98a2ab'],[1.0,'#9aa4ad']]
    : weather==='sunset'
    ? [[0.0,'#2e3a68'],[0.38,'#8a5f86'],[0.62,'#d97b58'],[0.85,'#f3a26a'],[1.0,'#f4b183']]
    : [[0.0,'#154ea0'],[0.40,'#3f87d4'],[0.70,'#8cbde9'],[0.90,'#cfe2f0'],[1.0,'#eaf1f2']];
  const g=x.createLinearGradient(0,0,0,H);
  for(const [t,col] of stops) g.addColorStop(t,col);
  x.fillStyle=g; x.fillRect(0,0,W,H);
  if(weather==='rain'){
    // solid overcast: no sun, ragged darker stratus patches only
    for(let i=0;i<34;i++){
      const px=Math.random()*W, py=H*(0.05+Math.random()*0.60);
      const rx=120+Math.random()*260, ry=16+Math.random()*26;
      x.save(); x.translate(px,py); x.scale(rx/ry,1);
      const rg=x.createRadialGradient(0,0,0,0,0,ry);
      rg.addColorStop(0,'rgba(106,114,122,0.30)'); rg.addColorStop(1,'rgba(106,114,122,0)');
      x.fillStyle=rg; x.beginPath(); x.arc(0,0,ry,0,7); x.fill(); x.restore();
    }
  } else {
    const dusk = weather==='sunset';
    // sun glow + core (low & warm at dusk, high & white at noon).
    // On the equirect dome canvas y=0.5H is the horizon — the dusk sun must sit
    // just ABOVE it (0.44H ≈ 11° elevation) or it hides below the ground plane.
    const sx=W*0.72, sy=H*(dusk?0.44:0.28);
    let sg=x.createRadialGradient(sx,sy,0,sx,sy,H*0.55);
    if(dusk){ sg.addColorStop(0,'rgba(255,196,130,0.95)'); sg.addColorStop(0.2,'rgba(255,170,110,0.5)'); sg.addColorStop(1,'rgba(255,170,110,0)'); }
    else { sg.addColorStop(0,'rgba(255,250,232,0.85)'); sg.addColorStop(0.16,'rgba(255,247,226,0.45)'); sg.addColorStop(1,'rgba(255,247,226,0)'); }
    x.fillStyle=sg; x.fillRect(0,0,W,H);
    const cr=dusk?38:30;
    sg=x.createRadialGradient(sx,sy,0,sx,sy,cr);
    if(dusk){ sg.addColorStop(0,'rgba(255,232,196,1)'); sg.addColorStop(1,'rgba(255,208,150,0)'); }
    else { sg.addColorStop(0,'rgba(255,255,252,1)'); sg.addColorStop(1,'rgba(255,255,248,0)'); }
    x.fillStyle=sg; x.beginPath(); x.arc(sx,sy,cr,0,7); x.fill();
    // puffy cumulus clouds (clusters of soft blobs, bigger/denser toward the horizon)
    const under = dusk? '110,80,108' : '196,206,220';       // shadow side
    const top   = dusk? '255,196,152': '255,255,255';       // lit side
    function cloud(cxp,cyp,scale,alpha){
      const puffs=10+Math.floor(Math.random()*8);
      for(let i=0;i<puffs;i++){
        const dx=(Math.random()-0.5)*130*scale;
        const dy=(Math.random()-0.5)*32*scale - Math.abs(dx)*0.10;
        const r=(16+Math.random()*30)*scale, px=cxp+dx, py=cyp+dy;
        let rg=x.createRadialGradient(px,py+r*0.3,0,px,py+r*0.3,r);   // soft underside
        rg.addColorStop(0,'rgba('+under+','+(alpha*0.5)+')'); rg.addColorStop(1,'rgba('+under+',0)');
        x.fillStyle=rg; x.beginPath(); x.arc(px,py+r*0.3,r,0,7); x.fill();
        rg=x.createRadialGradient(px,py-r*0.18,0,px,py-r*0.18,r);     // lit top
        rg.addColorStop(0,'rgba('+top+','+alpha+')'); rg.addColorStop(0.7,'rgba('+top+','+(alpha*0.55)+')'); rg.addColorStop(1,'rgba('+top+',0)');
        x.fillStyle=rg; x.beginPath(); x.arc(px,py-r*0.18,r,0,7); x.fill();
      }
    }
    for(let i=0;i<13;i++){
      const cyp=H*(0.34+Math.random()*0.42);
      const scale=0.55 + (cyp/H)*1.1 + Math.random()*0.4;
      cloud(80+Math.random()*(W-160), cyp, scale, dusk?0.62:0.88);
    }
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; t.anisotropy=MAXANI; t.colorSpace=THREE.SRGBColorSpace; anisoTextures.push(t); return t;
}
export function liveryTex(base, accent, plain){
  const S=512, c=cvs(S,S), x=c.getContext('2d');
  x.fillStyle=base; x.fillRect(0,0,S,S);
  // carbon-fibre weave
  x.globalAlpha=0.07;
  for(let yy=0;yy<S;yy+=6){ x.fillStyle=((yy/6)&1)?'#000':'#fff'; x.fillRect(0,yy,S,3); }
  x.globalAlpha=1;
  // accent sweep + white stripe (skipped for plain single-colour liveries)
  if(!plain){
    x.fillStyle=accent; x.beginPath(); x.moveTo(0,300); x.lineTo(S,180); x.lineTo(S,272); x.lineTo(0,384); x.closePath(); x.fill();
    x.fillStyle='rgba(255,255,255,.9)'; x.fillRect(0,120,S,16);
  }
  // gloss highlight
  const gl=x.createLinearGradient(0,0,0,S); gl.addColorStop(0,'rgba(255,255,255,.20)'); gl.addColorStop(.22,'rgba(255,255,255,0)');
  x.fillStyle=gl; x.fillRect(0,0,S,S);
  return texFrom(c,true);
}

/* ---------------- 360° distant backdrop: forested hill ranges + Mt. Tsukuba ---------------- */
export function panoramaTex(weather='sunny'){
  const W=4096,H=768,c=cvs(W,H),x=c.getContext('2d');
  // per-weather hill palette: sunny = original daylight, rain = desaturated
  // grey-greens, sunset = dark warm-purple silhouettes with amber haze
  const P={
    sunny :{ far:'#9fb5c6', mid:'#84a1b2', p1:'#7f99a8', p2:'#88a1af', haze:'214,229,240', near:'#5f7f6b', foot:'#496a4c', tree:'#33502f' },
    rain  :{ far:'#8f99a2', mid:'#7c868f', p1:'#727d86', p2:'#78838b', haze:'168,177,184', near:'#5a6a60', foot:'#47564c', tree:'#37453c' },
    sunset:{ far:'#8a7590', mid:'#6e5a78', p1:'#5d4d66', p2:'#645370', haze:'244,177,131', near:'#4a4653', foot:'#3a3742', tree:'#2d2b34' },
  }[weather] || {far:'#9fb5c6',mid:'#84a1b2',p1:'#7f99a8',p2:'#88a1af',haze:'214,229,240',near:'#5f7f6b',foot:'#496a4c',tree:'#33502f'};
  x.clearRect(0,0,W,H);
  function ridge(baseY,amp,color,f,ph){
    x.fillStyle=color; x.beginPath(); x.moveTo(0,H);
    for(let px=0;px<=W;px+=6){ const t=px/W*Math.PI*2;
      let h=(Math.sin(t*f+ph)*0.5+0.5)*amp;
      h+=(Math.sin(t*3*f+ph*1.7)*0.5+0.5)*amp*0.42;
      h+=(Math.sin(t*7*f+ph*0.6)*0.5+0.5)*amp*0.18;
      x.lineTo(px, baseY-h); }
    x.lineTo(W,H); x.closePath(); x.fill();
  }
  ridge(H*0.46, H*0.15, P.far, 4, 0.4);   // far range (atmospheric)
  ridge(H*0.52, H*0.19, P.mid, 6, 1.3);   // mid range
  (function twinPeaks(){                        // Mt. Tsukuba twin peaks
    const cx=W*0.5, base=H*0.53;
    function peak(px,ph,pw,col){ x.fillStyle=col; x.beginPath(); x.moveTo(px-pw,base); x.lineTo(px-pw*0.15,base-ph*0.96); x.lineTo(px,base-ph); x.lineTo(px+pw*0.2,base-ph*0.9); x.lineTo(px+pw,base); x.closePath(); x.fill(); }
    peak(cx-95,H*0.31,150,P.p1);                // Nyotai-san
    peak(cx+95,H*0.27,135,P.p2);                // Nantai-san
  })();
  let hz=x.createLinearGradient(0,H*0.30,0,H*0.66);   // horizon haze
  hz.addColorStop(0,'rgba('+P.haze+',0)'); hz.addColorStop(0.55,'rgba('+P.haze+',0.55)'); hz.addColorStop(1,'rgba('+P.haze+',0)');
  x.fillStyle=hz; x.fillRect(0,0,W,H);
  ridge(H*0.60, H*0.15, P.near, 11, 2.1);  // near green hills
  ridge(H*0.70, H*0.13, P.foot, 19, 3.7);  // forested foothills
  (function treeline(){                         // jagged forest edge
    x.fillStyle=P.tree; x.beginPath(); x.moveTo(0,H);
    for(let px=0;px<=W;px+=5){ const t=px/W*Math.PI*2;
      const y=H*0.75 - (Math.sin(t*40)*0.5+0.5)*20 - (Math.sin(t*97)*0.5+0.5)*11; x.lineTo(px,y); }
    x.lineTo(W,H); x.closePath(); x.fill();
  })();
  const t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; t.anisotropy=MAXANI; t.colorSpace=THREE.SRGBColorSpace; anisoTextures.push(t); return t;
}

export const TEX = { asphalt:asphaltTex(), grass:grassTex(), kerb:kerbTex(), checker:checkerTex() };
