import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface LensDistortPipeParams { k?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, k:{value:0.3} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float k; varying vec2 vUv;
    void main(){
      vec2 uv=vUv-0.5;
      float r2=dot(uv,uv);
      vec2 distorted=uv*(1.+k*r2)+0.5;
      if(distorted.x<0.||distorted.x>1.||distorted.y<0.||distorted.y>1.){gl_FragColor=vec4(0.);return;}
      gl_FragColor=texture2D(tDiffuse,distorted);}`,
};

export class LensDistortPipe extends ShaderPipeBase {
  readonly name = 'lensDistort';
  constructor(public params: LensDistortPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) { this.setU('k', this.params.k ?? 0.3); }
}
