import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface PixelShiftPipeParams { amount?: number; speed?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, texelSize:{value:new THREE.Vector2(1/512,1/512)}, amount:{value:3.0}, time:{value:0.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texelSize; uniform float amount,time; varying vec2 vUv;
    float rand(float x){return fract(sin(x*127.1)*43758.5453);}
    void main(){
      float t=floor(time*12.)/12.;
      float row=floor(vUv.y*64.);
      float shift=(rand(row+t)-0.5)*2.*amount;
      vec2 uv=vUv+vec2(shift*texelSize.x,0.);
      gl_FragColor=texture2D(tDiffuse,uv);}`,
};

export class PixelShiftPipe extends ShaderPipeBase {
  readonly name = 'pixelShift';
  constructor(public params: PixelShiftPipeParams = {}) { super(SHADER); }
  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('texelSize', new THREE.Vector2(1/ctx.width, 1/ctx.height));
  }
  update(ctx: PipeFrameContext) {
    this.setU('amount', this.params.amount ?? 3);
    this.setU('time',   ctx.time * (this.params.speed ?? 1));
  }
}
