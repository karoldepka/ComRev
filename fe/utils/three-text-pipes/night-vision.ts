import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface NightVisionPipeParams { intensity?: number; noise?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, intensity:{value:0.8}, noise:{value:0.2}, time:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float intensity,noise,time; varying vec2 vUv;
    float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec4 c=texture2D(tDiffuse,vUv);
      float lum=dot(c.rgb,vec3(.299,.587,.114));
      float n=rand(vUv+time)*noise;
      float v=clamp(lum*intensity+n,0.,1.);
      gl_FragColor=vec4(0.,v,0.,c.a);}`,
};

export class NightVisionPipe extends ShaderPipeBase {
  readonly name = 'nightVision';
  constructor(public params: NightVisionPipeParams = {}) { super(SHADER); }
  update(ctx: PipeFrameContext) {
    this.setU('intensity', this.params.intensity ?? 0.8);
    this.setU('noise',     this.params.noise     ?? 0.2);
    this.setU('time',      ctx.time);
  }
}
