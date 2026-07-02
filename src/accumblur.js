/* =====================================================================
   APEX GP — AccumBlurNode: a TSL post-processing node that reproduces the
   original WebGL motion blur (a full-frame exponential moving average,
   output = mix(newFrame, accumulated, damp)).

   three's stock AfterImageNode is max()-based with a brightness threshold,
   so dark content (asphalt!) never blurs — wrong effect for speed blur.
   This node is structurally a fork of AfterImageNode (same ping-pong
   render-target plumbing) with the compose function swapped for mix().
   ===================================================================== */
import { RenderTarget, Vector2, QuadMesh, NodeMaterial, RendererUtils, TempNode, NodeUpdateType } from 'three/webgpu';
import { nodeObject, Fn, uv, texture, passTexture, uniform, mix, convertToTexture } from 'three/tsl';

const _size = new Vector2();
const _quadMeshComp = new QuadMesh();
let _rendererState;

class AccumBlurNode extends TempNode {

  static get type(){ return 'AccumBlurNode'; }

  constructor(textureNode, damp = 0){
    super('vec4');
    this.textureNode = textureNode;
    this.textureNodeOld = texture(null);
    this.damp = uniform(damp);                 // 0 = no blur, ->1 = heavier accumulation
    this._compRT = new RenderTarget(1, 1, { depthBuffer:false });
    this._compRT.texture.name = 'AccumBlurNode.comp';
    this._oldRT = new RenderTarget(1, 1, { depthBuffer:false });
    this._oldRT.texture.name = 'AccumBlurNode.old';
    this._textureNode = passTexture(this, this._compRT.texture);
    this.updateBeforeType = NodeUpdateType.FRAME;
  }

  getTextureNode(){ return this._textureNode; }

  setSize(w, h){
    this._compRT.setSize(w, h);
    this._oldRT.setSize(w, h);
  }

  updateBefore(frame){
    const { renderer } = frame;
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);

    const textureNode = this.textureNode;
    const map = textureNode.value;
    this._compRT.texture.type = map.type;
    this._oldRT.texture.type = map.type;

    renderer.getDrawingBufferSize(_size);
    this.setSize(_size.x, _size.y);

    const currentTexture = textureNode.value;
    this.textureNodeOld.value = this._oldRT.texture;

    // compose mix(new, old, damp) into compRT, then ping-pong the targets so
    // this frame's output becomes next frame's history
    _quadMeshComp.material = this._materialComposed;
    renderer.setRenderTarget(this._compRT);
    _quadMeshComp.render(renderer);

    const temp = this._oldRT;
    this._oldRT = this._compRT;
    this._compRT = temp;

    textureNode.value = currentTexture;
    RendererUtils.restoreRendererState(renderer, _rendererState);
  }

  setup(builder){
    const textureNode = this.textureNode;
    const textureNodeOld = this.textureNodeOld;
    textureNodeOld.uvNode = textureNode.uvNode || uv();

    const accum = Fn(() => {
      const texelOld = textureNodeOld.sample().toVar();
      const texelNew = textureNode.sample().toVar();
      return mix(texelNew, texelOld, this.damp);
    });

    const materialComposed = this._materialComposed || (this._materialComposed = new NodeMaterial());
    materialComposed.name = 'AccumBlur';
    materialComposed.fragmentNode = accum();

    const properties = builder.getNodeProperties(this);
    properties.textureNode = textureNode;

    return this._textureNode;
  }

  dispose(){
    this._compRT.dispose();
    this._oldRT.dispose();
  }
}

export const accumBlur = (node, damp) => nodeObject(new AccumBlurNode(convertToTexture(node), damp));
export default AccumBlurNode;
