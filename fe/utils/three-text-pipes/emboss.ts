import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface EmbossPipeParams { strength?: number; }

const SHADER = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 2.0 }, texelSize: { value: [1/512, 1/512] } },
  vertexShader: UV_VS,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform vec2 texelSize;
    varying vec2 vUv;
    void main() {
      vec3 c  = texture2D(tDiffuse, vUv).rgb;
      vec3 tl = texture2D(tDiffuse, vUv + vec2(-texelSize.x, -texelSize.y)).rgb;
      vec3 br = texture2D(tDiffuse, vUv + vec2( texelSize.x,  texelSize.y)).rgb;
      vec3 diff = (c - tl) * strength;
      float lum = dot(diff, vec3(0.299, 0.587, 0.114));
      vec3 result = vec3(clamp(lum + 0.5, 0.0, 1.0));
      gl_FragColor = vec4(result, 1.0);
    }`,
};

export class EmbossPipe extends ShaderPipeBase {
  readonly name = 'emboss';
  constructor(public params: EmbossPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('strength', this.params.strength ?? 2);
    if (this.pass) {
      const size = (this.pass as any).uniforms?.texelSize;
      if (size) size.value = [1 / 512, 1 / 512];
    }
  }
}
