import * as THREE from 'three';
import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface RadialBlurPipeParams { strength?: number; samples?: number; center?: [number, number]; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, strength:{value:0.15}, center:{value:new THREE.Vector2(0.5,0.5)}, samples:{value:8} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform vec2 center; uniform int samples; varying vec2 vUv;
    void main(){vec2 dir=vUv-center;vec4 acc=vec4(0.);float total=0.;
      for(int i=0;i<32;i++){if(i>=samples)break;float t=float(i)/float(max(samples-1,1));acc+=texture2D(tDiffuse,vUv-dir*strength*t);total+=1.;}
      gl_FragColor=acc/total;}`,
};

export class RadialBlurPipe extends ShaderPipeBase {
  readonly name = 'radialBlur';
  constructor(public params: RadialBlurPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('strength', this.params.strength ?? 0.15);
    this.setU('samples',  Math.max(1, Math.min(32, Math.floor(this.params.samples ?? 8))));
    const c = this.params.center ?? [0.5, 0.5];
    this.setU('center', new THREE.Vector2(c[0], c[1]));
  }
}
