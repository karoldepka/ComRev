import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface SharpenPipeParams { amount?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, amount:{value:1.0}, texelSize:{value:new THREE.Vector2(1/512,1/512)} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; uniform vec2 texelSize; varying vec2 vUv;
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      vec4 n=texture2D(tDiffuse,vUv+vec2(0.,texelSize.y));
      vec4 s=texture2D(tDiffuse,vUv+vec2(0.,-texelSize.y));
      vec4 e=texture2D(tDiffuse,vUv+vec2(texelSize.x,0.));
      vec4 w=texture2D(tDiffuse,vUv+vec2(-texelSize.x,0.));
      vec4 sharp=c*(1.+4.*amount)-(n+s+e+w)*amount;
      gl_FragColor=vec4(clamp(sharp.rgb,0.,1.),c.a);}`,
};

export class SharpenPipe extends ShaderPipeBase {
  readonly name = 'sharpen';
  constructor(public params: SharpenPipeParams = {}) { super(SHADER); }
  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('texelSize', new THREE.Vector2(1/ctx.width, 1/ctx.height));
  }
  update(_ctx: PipeFrameContext) { this.setU('amount', this.params.amount ?? 1); }
}
