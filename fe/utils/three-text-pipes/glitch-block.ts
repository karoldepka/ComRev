import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface GlitchBlockPipeParams { intensity?: number; frequency?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, intensity:{value:0.1}, time:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float intensity,time; varying vec2 vUv;
    float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      float t=floor(time*6.)/6.;
      float blockY=floor(vUv.y*24.)/24.;
      float glitch=step(0.93,rand(vec2(blockY,t)))*intensity;
      float shift=(rand(vec2(t,blockY))*2.-1.)*glitch;
      vec2 uv=vec2(fract(vUv.x+shift),vUv.y);
      vec4 c=texture2D(tDiffuse,uv);
      if(glitch>0.05){c.r=texture2D(tDiffuse,uv+vec2(glitch*.02,0.)).r;c.b=texture2D(tDiffuse,uv-vec2(glitch*.02,0.)).b;}
      gl_FragColor=c;}`,
};

export class GlitchBlockPipe extends ShaderPipeBase {
  readonly name = 'glitchBlock';
  constructor(public params: GlitchBlockPipeParams = {}) { super(SHADER); }
  update(ctx: PipeFrameContext) {
    this.setU('intensity', this.params.intensity ?? 0.1);
    this.setU('time',      ctx.time * (this.params.frequency ?? 1));
  }
}
