import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface CircularBlurPipeParams { radius?: number; samples?: number; }

const SHADER = {
  uniforms: { tDiffuse:{value:null}, radius:{value:0.01}, samples:{value:16} },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float radius; uniform int samples; varying vec2 vUv;
    const float PI2=6.28318530718;
    void main(){vec4 acc=vec4(0.);float total=0.;
      for(int i=0;i<64;i++){if(i>=samples)break;
        float angle=PI2*float(i)/float(samples);
        vec2 offset=vec2(cos(angle),sin(angle))*radius;
        acc+=texture2D(tDiffuse,vUv+offset);total+=1.;}
      gl_FragColor=acc/total;}`,
};

export class CircularBlurPipe extends ShaderPipeBase {
  readonly name = 'circularBlur';
  constructor(public params: CircularBlurPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('radius',  this.params.radius  ?? 0.01);
    this.setU('samples', Math.max(1, Math.min(64, Math.floor(this.params.samples ?? 16))));
  }
}
