import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface VhsTrackingPipeParams { strength?: number; speed?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, strength:{value:0.04}, time:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength,time; varying vec2 vUv;
    float rand(float x){return fract(sin(x*127.1)*43758.5453);}
    void main(){
      float t=floor(time*12.)/12.;
      float jitter=rand(vUv.y*100.+t)*strength*(rand(t)*2.-1.);
      vec2 uv=vec2(fract(vUv.x+jitter),vUv.y);
      gl_FragColor=texture2D(tDiffuse,uv);}`,
};

export class VhsTrackingPipe extends ShaderPipeBase {
  readonly name = 'vhsTracking';
  constructor(public params: VhsTrackingPipeParams = {}) { super(SHADER); }
  update(ctx: PipeFrameContext) {
    this.setU('strength', this.params.strength ?? 0.04);
    this.setU('time',     ctx.time * (this.params.speed ?? 1));
  }
}
