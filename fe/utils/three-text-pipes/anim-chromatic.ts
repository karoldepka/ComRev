import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface AnimChromaticPipeParams { amount?: number; speed?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, amount:{value:0.01}, time:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount,time; varying vec2 vUv;
    void main(){
      float shift=amount*(0.5+0.5*sin(time*2.));
      float r=texture2D(tDiffuse,vUv+vec2(shift,0.)).r;
      float g=texture2D(tDiffuse,vUv).g;
      float b=texture2D(tDiffuse,vUv-vec2(shift,0.)).b;
      float a=texture2D(tDiffuse,vUv).a;
      gl_FragColor=vec4(r,g,b,a);}`,
};

export class AnimChromaticPipe extends ShaderPipeBase {
  readonly name = 'animChromatic';
  constructor(public params: AnimChromaticPipeParams = {}) { super(SHADER); }
  update(ctx: PipeFrameContext) {
    this.setU('amount', this.params.amount ?? 0.01);
    this.setU('time',   ctx.time * (this.params.speed ?? 1));
  }
}
