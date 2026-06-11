import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface NoisePostPipeParams { amount?: number; animated?: boolean; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, amount:{value:0.15}, time:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount,time; varying vec2 vUv;
    float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      float n=(rand(vUv+time)-0.5)*2.*amount;
      gl_FragColor=vec4(clamp(c.rgb+n,0.,1.),c.a);}`,
};

export class NoisePostPipe extends ShaderPipeBase {
  readonly name = 'noisePost';
  constructor(public params: NoisePostPipeParams = {}) { super(SHADER); }
  update(ctx: PipeFrameContext) {
    this.setU('amount', this.params.amount ?? 0.15);
    this.setU('time',   (this.params.animated ?? true) ? ctx.time : 0);
  }
}
