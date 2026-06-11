import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface BlurPipeParams { radius?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, texelSize:{value:new THREE.Vector2(1/512,1/512)}, radius:{value:1.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texelSize; uniform float radius; varying vec2 vUv;
    void main(){
      vec4 acc=vec4(0.); float w=0.;
      for(int x=-3;x<=3;x++){for(int y=-3;y<=3;y++){
        float d=float(x*x+y*y); float weight=exp(-d/(2.*radius*radius));
        acc+=texture2D(tDiffuse,vUv+vec2(float(x),float(y))*texelSize)*weight;
        w+=weight;}}
      gl_FragColor=acc/w;}`,
};

export class BlurPipe extends ShaderPipeBase {
  readonly name = 'blur';
  constructor(public params: BlurPipeParams = {}) { super(SHADER); }
  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('texelSize', new THREE.Vector2(1/ctx.width, 1/ctx.height));
  }
  update(_ctx: PipeFrameContext) { this.setU('radius', this.params.radius ?? 1); }
}
