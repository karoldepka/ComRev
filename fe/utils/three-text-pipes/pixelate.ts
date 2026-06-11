import * as THREE from 'three';
import { ShaderPipeBase, PipeSetupContext, PipeFrameContext, UV_VS } from './base';

export interface PixelatePipeParams { pixelSize?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, resolution:{value:new THREE.Vector2(1,1)}, pixelSize:{value:4.0} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float pixelSize; varying vec2 vUv;
    void main(){vec2 dxy=pixelSize/resolution;vec2 coord=dxy*floor(vUv/dxy);gl_FragColor=texture2D(tDiffuse,coord);}`,
};

export class PixelatePipe extends ShaderPipeBase {
  readonly name = 'pixelate';
  constructor(public params: PixelatePipeParams = {}) { super(SHADER); }

  protected override initUniforms(ctx: PipeSetupContext) {
    this.setU('resolution', new THREE.Vector2(ctx.width, ctx.height));
  }

  update(_ctx: PipeFrameContext) { this.setU('pixelSize', this.params.pixelSize ?? 4); }
}
