import * as THREE from 'three';
import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface ColorOverlayPipeParams { color?: number; opacity?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, overlayColor:{value:new THREE.Color(0xff6600)}, opacity:{value:0.4} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 overlayColor; uniform float opacity; varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);
      gl_FragColor=vec4(mix(c.rgb,overlayColor,opacity),c.a);}`,
};

export class ColorOverlayPipe extends ShaderPipeBase {
  readonly name = 'colorOverlay';
  constructor(public params: ColorOverlayPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('overlayColor', new THREE.Color(this.params.color ?? 0xff6600));
    this.setU('opacity',      this.params.opacity ?? 0.4);
  }
}
