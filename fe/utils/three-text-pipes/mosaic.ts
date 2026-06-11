import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface MosaicPipeParams { size?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, size:{value:0.05} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float size; varying vec2 vUv;
    void main(){
      vec2 uv=floor(vUv/size)*size+size*0.5;
      gl_FragColor=texture2D(tDiffuse,uv);}`,
};

export class MosaicPipe extends ShaderPipeBase {
  readonly name = 'mosaic';
  constructor(public params: MosaicPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) { this.setU('size', Math.max(0.001, this.params.size ?? 0.05)); }
}
