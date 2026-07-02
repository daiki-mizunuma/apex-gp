/* =====================================================================
   APEX GP — Procedural textures (canvas)
   ===================================================================== */
import { renderer } from './scene.js';

const MAXANI = renderer.capabilities.getMaxAnisotropy();

export function cvs(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
export function texFrom(canvas, srgb){
  const t=new THREE.CanvasTexture(canvas);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=MAXANI;
  t.generateMipmaps=true; t.minFilter=THREE.LinearMipmapLinearFilter;
  if(srgb) t.encoding=THREE.sRGBEncoding;
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
  const blotch=fbm(S,4,0.55,4), grain=fbm(S,3,0.6,48), fine=fbm(S,2,0.7,160);
  const col=new Uint8ClampedArray(S*S*4), h=new Float32Array(S*S);
  for(let i=0;i<S*S;i++){
    let g=54 + (blotch[i]-0.5)*26 + (grain[i]-0.5)*30 + (fine[i]-0.5)*16;
    if(grain[i]>0.80) g+=48*(grain[i]-0.80)/0.20;   // light aggregate stones
    if(blotch[i]<0.16) g-=12;                         // darker oil/tyre patches
    g=Math.max(24,Math.min(120,g));
    const k=i*4; col[k]=g; col[k+1]=g; col[k+2]=g+4; col[k+3]=255;
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
export function skyTex(){
  const W=1024,H=512,c=cvs(W,H),x=c.getContext('2d');
  // zenith -> horizon gradient
  const g=x.createLinearGradient(0,0,0,H);
  g.addColorStop(0.0,'#154ea0'); g.addColorStop(0.40,'#3f87d4'); g.addColorStop(0.70,'#8cbde9');
  g.addColorStop(0.90,'#cfe2f0'); g.addColorStop(1.0,'#eaf1f2');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  // sun glow + core
  const sx=W*0.72, sy=H*0.28;
  let sg=x.createRadialGradient(sx,sy,0,sx,sy,H*0.55);
  sg.addColorStop(0,'rgba(255,250,232,0.85)'); sg.addColorStop(0.16,'rgba(255,247,226,0.45)'); sg.addColorStop(1,'rgba(255,247,226,0)');
  x.fillStyle=sg; x.fillRect(0,0,W,H);
  sg=x.createRadialGradient(sx,sy,0,sx,sy,30);
  sg.addColorStop(0,'rgba(255,255,252,1)'); sg.addColorStop(1,'rgba(255,255,248,0)');
  x.fillStyle=sg; x.beginPath(); x.arc(sx,sy,30,0,7); x.fill();
  // puffy cumulus clouds (clusters of soft blobs, bigger/denser toward the horizon)
  function cloud(cxp,cyp,scale,alpha){
    const puffs=10+Math.floor(Math.random()*8);
    for(let i=0;i<puffs;i++){
      const dx=(Math.random()-0.5)*130*scale;
      const dy=(Math.random()-0.5)*32*scale - Math.abs(dx)*0.10;
      const r=(16+Math.random()*30)*scale, px=cxp+dx, py=cyp+dy;
      let rg=x.createRadialGradient(px,py+r*0.3,0,px,py+r*0.3,r);   // soft grey underside
      rg.addColorStop(0,'rgba(196,206,220,'+(alpha*0.5)+')'); rg.addColorStop(1,'rgba(196,206,220,0)');
      x.fillStyle=rg; x.beginPath(); x.arc(px,py+r*0.3,r,0,7); x.fill();
      rg=x.createRadialGradient(px,py-r*0.18,0,px,py-r*0.18,r);     // white top
      rg.addColorStop(0,'rgba(255,255,255,'+alpha+')'); rg.addColorStop(0.7,'rgba(255,255,255,'+(alpha*0.55)+')'); rg.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle=rg; x.beginPath(); x.arc(px,py-r*0.18,r,0,7); x.fill();
    }
  }
  for(let i=0;i<13;i++){
    const cyp=H*(0.34+Math.random()*0.42);
    const scale=0.55 + (cyp/H)*1.1 + Math.random()*0.4;
    cloud(80+Math.random()*(W-160), cyp, scale, 0.88);
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; t.anisotropy=MAXANI; t.encoding=THREE.sRGBEncoding; return t;
}
export function liveryTex(base, accent){
  const S=512, c=cvs(S,S), x=c.getContext('2d');
  x.fillStyle=base; x.fillRect(0,0,S,S);
  // carbon-fibre weave
  x.globalAlpha=0.07;
  for(let yy=0;yy<S;yy+=6){ x.fillStyle=((yy/6)&1)?'#000':'#fff'; x.fillRect(0,yy,S,3); }
  x.globalAlpha=1;
  // accent sweep + white stripe
  x.fillStyle=accent; x.beginPath(); x.moveTo(0,300); x.lineTo(S,180); x.lineTo(S,272); x.lineTo(0,384); x.closePath(); x.fill();
  x.fillStyle='rgba(255,255,255,.9)'; x.fillRect(0,120,S,16);
  // gloss highlight
  const gl=x.createLinearGradient(0,0,0,S); gl.addColorStop(0,'rgba(255,255,255,.20)'); gl.addColorStop(.22,'rgba(255,255,255,0)');
  x.fillStyle=gl; x.fillRect(0,0,S,S);
  return texFrom(c,true);
}

/* ---------------- 360° distant backdrop: forested hill ranges + Mt. Tsukuba ---------------- */
export function panoramaTex(){
  const W=4096,H=768,c=cvs(W,H),x=c.getContext('2d');
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
  ridge(H*0.46, H*0.15, '#9fb5c6', 4, 0.4);   // far range (bluish, atmospheric)
  ridge(H*0.52, H*0.19, '#84a1b2', 6, 1.3);   // mid range
  (function twinPeaks(){                        // Mt. Tsukuba twin peaks
    const cx=W*0.5, base=H*0.53;
    function peak(px,ph,pw,col){ x.fillStyle=col; x.beginPath(); x.moveTo(px-pw,base); x.lineTo(px-pw*0.15,base-ph*0.96); x.lineTo(px,base-ph); x.lineTo(px+pw*0.2,base-ph*0.9); x.lineTo(px+pw,base); x.closePath(); x.fill(); }
    peak(cx-95,H*0.31,150,'#7f99a8');           // Nyotai-san
    peak(cx+95,H*0.27,135,'#88a1af');           // Nantai-san
  })();
  let hz=x.createLinearGradient(0,H*0.30,0,H*0.66);   // horizon haze
  hz.addColorStop(0,'rgba(214,229,240,0)'); hz.addColorStop(0.55,'rgba(214,229,240,0.55)'); hz.addColorStop(1,'rgba(214,229,240,0)');
  x.fillStyle=hz; x.fillRect(0,0,W,H);
  ridge(H*0.60, H*0.15, '#5f7f6b', 11, 2.1);   // near green hills
  ridge(H*0.70, H*0.13, '#496a4c', 19, 3.7);   // forested foothills
  (function treeline(){                         // jagged forest edge
    x.fillStyle='#33502f'; x.beginPath(); x.moveTo(0,H);
    for(let px=0;px<=W;px+=5){ const t=px/W*Math.PI*2;
      const y=H*0.75 - (Math.sin(t*40)*0.5+0.5)*20 - (Math.sin(t*97)*0.5+0.5)*11; x.lineTo(px,y); }
    x.lineTo(W,H); x.closePath(); x.fill();
  })();
  const t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; t.anisotropy=MAXANI; t.encoding=THREE.sRGBEncoding; return t;
}

export const TEX = { asphalt:asphaltTex(), grass:grassTex(), kerb:kerbTex(), checker:checkerTex() };
