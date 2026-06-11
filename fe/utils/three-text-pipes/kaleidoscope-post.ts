import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface KaleidoscopePostPipeParams { segments?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, segments:{value:6.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float segments; varying vec2 vUv;
    const float PI=3.14159265;
    void main(){
      vec2 uv=vUv-0.5;
      float angle=atan(uv.y,uv.x);
      float r=length(uv);
      float seg=PI/segments;
      angle=mod(angle,2.*seg);
      if(angle>seg)angle=2.*seg-angle;
      vec2 ku=vec2(cos(angle),sin(angle))*r+0.5;
      gl_FragColor=texture2D(tDiffuse,ku);}`,
};

export class KaleidoscopePostPipe extends ShaderPipeBase {
  readonly name = 'kaleidoscopePost';
  constructor(public params: KaleidoscopePostPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) { this.setU('segments', Math.max(2, this.params.segments ?? 6)); }
}
