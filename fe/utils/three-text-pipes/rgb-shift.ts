import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface RgbShiftPipeParams { amount?: number; angle?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, amount:{value:0.005}, angle:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount,angle; varying vec2 vUv;
    void main(){
      vec2 offset=amount*vec2(cos(angle),sin(angle));
      float r=texture2D(tDiffuse,vUv+offset).r;
      float g=texture2D(tDiffuse,vUv).g;
      float b=texture2D(tDiffuse,vUv-offset).b;
      gl_FragColor=vec4(r,g,b,texture2D(tDiffuse,vUv).a);}`,
};

export class RgbShiftPipe extends ShaderPipeBase {
  readonly name = 'rgbShift';
  constructor(public params: RgbShiftPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('amount', this.params.amount ?? 0.005);
    this.setU('angle',  this.params.angle  ?? 0);
  }
}
