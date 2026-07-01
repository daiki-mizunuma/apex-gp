/* =====================================================================
   APEX GP — Motion blur (accumulation post-process; toggle with B)
   ===================================================================== */
import { TOP_SPEED } from './config.js';
import { renderer, scene, camera } from './scene.js';

export const MBLUR=(function(){
  let ok=false, on=true, rtScene, rtA, rtB, qScene, qCam, blendMat, copyMat;
  function rt(){ const s=renderer.getDrawingBufferSize(new THREE.Vector2());
    return new THREE.WebGLRenderTarget(Math.max(2,s.x),Math.max(2,s.y),{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}); }
  function init(){
    rtScene=rt(); rtA=rt(); rtB=rt();
    qCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1); qScene=new THREE.Scene();
    blendMat=new THREE.ShaderMaterial({uniforms:{tNew:{value:null},tAcc:{value:null},uMix:{value:0}},depthTest:false,depthWrite:false,
      vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'uniform sampler2D tNew,tAcc;uniform float uMix;varying vec2 v;void main(){gl_FragColor=mix(texture2D(tNew,v),texture2D(tAcc,v),uMix);}'});
    copyMat=new THREE.ShaderMaterial({uniforms:{t:{value:null}},depthTest:false,depthWrite:false,
      vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'uniform sampler2D t;varying vec2 v;void main(){vec4 c=texture2D(t,v);gl_FragColor=vec4(pow(max(c.rgb,0.0),vec3(0.4545)),1.0);}'});
    const q=new THREE.Mesh(new THREE.PlaneGeometry(2,2), blendMat); q.frustumCulled=false; qScene.add(q);
    ok=true;
  }
  function resize(){ if(!ok)return; const s=renderer.getDrawingBufferSize(new THREE.Vector2()); rtScene.setSize(s.x,s.y); rtA.setSize(s.x,s.y); rtB.setSize(s.x,s.y); }
  function render(speed){
    const q=qScene.children[0];
    const mixv = on ? Math.min(0.74, (speed/TOP_SPEED)*0.85) : 0;
    renderer.setRenderTarget(rtScene); renderer.render(scene,camera);
    q.material=blendMat; blendMat.uniforms.tNew.value=rtScene.texture; blendMat.uniforms.tAcc.value=rtA.texture; blendMat.uniforms.uMix.value=mixv;
    renderer.setRenderTarget(rtB); renderer.render(qScene,qCam);
    renderer.setRenderTarget(null); q.material=copyMat; copyMat.uniforms.t.value=rtB.texture; renderer.render(qScene,qCam);
    const tmp=rtA; rtA=rtB; rtB=tmp;
  }
  return { init, resize, render, toggle(){on=!on; return on;}, get on(){return on;}, get ok(){return ok;} };
})();

try{ MBLUR.init(); }catch(e){ console.warn('motion blur unavailable', e); }
