import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface FrostedGlassPipeParams { blur?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, texelSize:{value:new THREE.Vector2(1/512,1/512)}, blur:{value:2.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texelSize; uniform float blur; varying vec2 vUv;
    float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec4 acc=vec4(0.); float w=0.;
      for(int i=0;i<12;i++){
        float angle=float(i)/12.*6.28318530;
        float r=(rand(vUv+vec2(float(i)))*0.5+0.5)*blur;
        vec2 off=vec2(cos(angle),sin(angle))*r*texelSize;
        acc+=texture2D(tDiffuse,vUv+off); w+=1.;}
      gl_FragColor=acc/w;}`,
};

export class FrostedGlassPipe extends ShaderPipeBase {
  readonly name = 'frostedGlass';
  constructor(public params: FrostedGlassPipeParams = {}) { super(SHADER); }
  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('texelSize', new THREE.Vector2(1/ctx.width, 1/ctx.height));
  }
  update(_ctx: PipeFrameContext) { this.setU('blur', this.params.blur ?? 2); }
}
