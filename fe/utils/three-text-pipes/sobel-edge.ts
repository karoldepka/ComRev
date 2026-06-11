import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface SobelEdgePipeParams { strength?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, texelSize:{value:new THREE.Vector2(1/512,1/512)}, strength:{value:1.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texelSize; uniform float strength; varying vec2 vUv;
    float lum(vec4 c){return dot(c.rgb,vec3(.299,.587,.114));}
    void main(){
      float tl=lum(texture2D(tDiffuse,vUv+texelSize*vec2(-1, 1)));
      float t =lum(texture2D(tDiffuse,vUv+texelSize*vec2( 0, 1)));
      float tr=lum(texture2D(tDiffuse,vUv+texelSize*vec2( 1, 1)));
      float l =lum(texture2D(tDiffuse,vUv+texelSize*vec2(-1, 0)));
      float r =lum(texture2D(tDiffuse,vUv+texelSize*vec2( 1, 0)));
      float bl=lum(texture2D(tDiffuse,vUv+texelSize*vec2(-1,-1)));
      float b =lum(texture2D(tDiffuse,vUv+texelSize*vec2( 0,-1)));
      float br=lum(texture2D(tDiffuse,vUv+texelSize*vec2( 1,-1)));
      float gx=-tl-2.*l-bl+tr+2.*r+br;
      float gy= tl+2.*t+tr-bl-2.*b-br;
      float edge=clamp(sqrt(gx*gx+gy*gy)*strength,0.,1.);
      gl_FragColor=vec4(vec3(edge),1.);}`,
};

export class SobelEdgePipe extends ShaderPipeBase {
  readonly name = 'sobelEdge';
  constructor(public params: SobelEdgePipeParams = {}) { super(SHADER); }
  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('texelSize', new THREE.Vector2(1 / ctx.width, 1 / ctx.height));
  }
  update(_ctx: PipeFrameContext) { this.setU('strength', this.params.strength ?? 1); }
}
