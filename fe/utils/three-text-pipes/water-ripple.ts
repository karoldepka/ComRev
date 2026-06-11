import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface WaterRipplePipeParams { strength?: number; speed?: number; frequency?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, strength:{value:0.02}, time:{value:0.0}, frequency:{value:10.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength,time,frequency; varying vec2 vUv;
    void main(){
      vec2 uv=vUv;
      float r=length(uv-0.5);
      float wave=sin(r*frequency-time*5.)*strength;
      vec2 dir=normalize(uv-0.5+0.001);
      uv+=dir*wave;
      gl_FragColor=texture2D(tDiffuse,uv);}`,
};

export class WaterRipplePipe extends ShaderPipeBase {
  readonly name = 'waterRipple';
  constructor(public params: WaterRipplePipeParams = {}) { super(SHADER); }
  update(ctx: PipeFrameContext) {
    this.setU('strength',  this.params.strength  ?? 0.02);
    this.setU('time',      ctx.time * (this.params.speed ?? 1));
    this.setU('frequency', this.params.frequency ?? 10);
  }
}
