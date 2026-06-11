import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface HalftonePipeParams { dotSize?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, dotSize:{value:4.0}, resolution:{value:new THREE.Vector2(1,1)} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float dotSize; uniform vec2 resolution; varying vec2 vUv;
    void main(){
      vec2 px=vUv*resolution;
      vec2 cell=floor(px/dotSize)*dotSize+dotSize*0.5;
      vec2 uv2=cell/resolution;
      vec4 c=texture2D(tDiffuse,uv2);
      float lum=dot(c.rgb,vec3(.299,.587,.114));
      float r=(dotSize*0.5)*lum;
      float d=length(px-cell);
      float alpha=step(d,r);
      gl_FragColor=vec4(c.rgb*alpha,c.a);}`,
};

export class HalftonePipe extends ShaderPipeBase {
  readonly name = 'halftone';
  constructor(public params: HalftonePipeParams = {}) { super(SHADER); }
  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('resolution', new THREE.Vector2(ctx.width, ctx.height));
  }
  update(_ctx: PipeFrameContext) { this.setU('dotSize', this.params.dotSize ?? 4); }
}
