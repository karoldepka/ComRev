import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface CrosshatchPipeParams { density?: number; lineWidth?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, texelSize:{value:new THREE.Vector2(1/512,1/512)}, density:{value:8.0}, lineWidth:{value:0.5} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texelSize; uniform float density,lineWidth; varying vec2 vUv;
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      float lum=1.-dot(c.rgb,vec3(.299,.587,.114));
      vec2 px=vUv/texelSize;
      float h1=step(lineWidth,mod(px.x+px.y,density));
      float h2=step(lineWidth,mod(px.x-px.y,density));
      float h3=lum>0.5?step(lineWidth,mod(px.x,density)):1.;
      float h4=lum>0.75?step(lineWidth,mod(px.y,density)):1.;
      float cross=h1*h2*h3*h4;
      gl_FragColor=vec4(vec3(cross),c.a);}`,
};

export class CrosshatchPipe extends ShaderPipeBase {
  readonly name = 'crosshatch';
  constructor(public params: CrosshatchPipeParams = {}) { super(SHADER); }
  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('texelSize', new THREE.Vector2(1/ctx.width, 1/ctx.height));
  }
  update(_ctx: PipeFrameContext) {
    this.setU('density',   this.params.density   ?? 8);
    this.setU('lineWidth', this.params.lineWidth ?? 0.5);
  }
}
