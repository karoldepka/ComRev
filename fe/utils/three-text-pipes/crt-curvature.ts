import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface CrtCurvaturePipeParams { bend?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, bend:{value:4.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float bend; varying vec2 vUv;
    vec2 curveUV(vec2 uv,float b){uv=uv*2.-1.;vec2 offset=abs(uv.yx)/b;uv=uv+uv*offset*offset;return uv*0.5+0.5;}
    void main(){
      vec2 uv=curveUV(vUv,bend);
      if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){gl_FragColor=vec4(0.);return;}
      gl_FragColor=texture2D(tDiffuse,uv);}`,
};

export class CrtCurvaturePipe extends ShaderPipeBase {
  readonly name = 'crtCurvature';
  constructor(public params: CrtCurvaturePipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) { this.setU('bend', Math.max(0.1, this.params.bend ?? 4)); }
}
