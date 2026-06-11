import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface OldFilmPipeParams { scratchIntensity?: number; vignetteAmount?: number; grainAmount?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, scratchIntensity:{value:0.3}, vignetteAmount:{value:0.5}, grainAmount:{value:0.08}, time:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float scratchIntensity,vignetteAmount,grainAmount,time; varying vec2 vUv;
    float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      // sepia
      float r=dot(c.rgb,vec3(.393,.769,.189)),g=dot(c.rgb,vec3(.349,.686,.168)),b=dot(c.rgb,vec3(.272,.534,.131));
      c.rgb=mix(c.rgb,vec3(r,g,b),0.7);
      // grain
      c.rgb+=rand(vUv+time)*grainAmount;
      // vignette
      float d=distance(vUv,vec2(0.5));
      c.rgb*=smoothstep(0.8,0.2,d*vignetteAmount*2.);
      // vertical scratch
      float sx=rand(vec2(floor(time*8.),0.));
      float scrW=0.001;
      if(abs(vUv.x-sx)<scrW)c.rgb+=scratchIntensity;
      gl_FragColor=c;}`,
};

export class OldFilmPipe extends ShaderPipeBase {
  readonly name = 'oldFilm';
  constructor(public params: OldFilmPipeParams = {}) { super(SHADER); }
  update(ctx: PipeFrameContext) {
    this.setU('scratchIntensity', this.params.scratchIntensity ?? 0.3);
    this.setU('vignetteAmount',   this.params.vignetteAmount   ?? 0.5);
    this.setU('grainAmount',      this.params.grainAmount      ?? 0.08);
    this.setU('time',             ctx.time);
  }
}
