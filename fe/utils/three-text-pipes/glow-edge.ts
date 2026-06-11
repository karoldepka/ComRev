import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface GlowEdgePipeParams { radius?: number; intensity?: number; color?: number; }

const SHADER = {
  uniforms: {
    tDiffuse:{value:null}, texelSize:{value:new THREE.Vector2(1/512,1/512)},
    radius:{value:3}, intensity:{value:1.5}, glowColor:{value:new THREE.Color(0xff6600)},
  },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texelSize; uniform float radius,intensity; uniform vec3 glowColor; varying vec2 vUv;
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      vec4 blur=vec4(0.); float w=0.;
      for(int x=-4;x<=4;x++){for(int y=-4;y<=4;y++){
        float d=float(x*x+y*y); if(d>float(int(radius)*int(radius)*2))continue;
        float weight=exp(-d/(2.*radius));
        blur+=texture2D(tDiffuse,vUv+vec2(float(x),float(y))*texelSize)*weight; w+=weight;}}
      blur/=w;
      float edge=clamp(length(blur.rgb-c.rgb)*intensity,0.,1.);
      gl_FragColor=vec4(c.rgb+glowColor*edge,c.a);}`,
};

export class GlowEdgePipe extends ShaderPipeBase {
  readonly name = 'glowEdge';
  constructor(public params: GlowEdgePipeParams = {}) { super(SHADER); }
  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('texelSize', new THREE.Vector2(1/ctx.width, 1/ctx.height));
  }
  update(_ctx: PipeFrameContext) {
    this.setU('radius',    this.params.radius    ?? 3);
    this.setU('intensity', this.params.intensity ?? 1.5);
    this.setU('glowColor', new THREE.Color(this.params.color ?? 0xff6600));
  }
}
