import * as THREE from 'three';
import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface DuotonePipeParams { colorA?: number; colorB?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, colorA:{value:new THREE.Color(0xff6600)}, colorB:{value:new THREE.Color(0x0066ff)} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 colorA,colorB; varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);
      float lum=dot(c.rgb,vec3(.299,.587,.114));
      gl_FragColor=vec4(mix(colorA,colorB,lum),c.a);}`,
};

export class DuotonePipe extends ShaderPipeBase {
  readonly name = 'duotone';
  constructor(public params: DuotonePipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('colorA', new THREE.Color(this.params.colorA ?? 0xff6600));
    this.setU('colorB', new THREE.Color(this.params.colorB ?? 0x0066ff));
  }
}
