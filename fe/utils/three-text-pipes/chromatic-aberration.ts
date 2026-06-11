import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface ChromaticAberrationPipeParams { offset?: number; }

const SHADER = {
  uniforms: { tDiffuse: { value: null }, offset: { value: 0.005 } },
  vertexShader: UV_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float offset; varying vec2 vUv;
    void main(){
      vec2 dir=normalize(vUv-0.5); float dist=length(vUv-0.5);
      vec4 cr=texture2D(tDiffuse,vUv+dir*offset*dist);
      vec4 cg=texture2D(tDiffuse,vUv);
      vec4 cb=texture2D(tDiffuse,vUv-dir*offset*dist);
      gl_FragColor=vec4(cr.r,cg.g,cb.b,cg.a);
    }`,
};

export class ChromaticAberrationPipe extends ShaderPipeBase {
  readonly name = 'chromaticAberration';
  constructor(public params: ChromaticAberrationPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) { this.setU('offset', this.params.offset ?? 0.005); }
}
