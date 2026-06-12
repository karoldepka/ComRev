import * as THREE from 'three';
import { LayeredMeshPipeBase, PipeSetupContext, PipeFrameContext } from './base';

export interface DissolveAnimPipeParams { speed?: number; color?: number; }

export class DissolveAnimPipe extends LayeredMeshPipeBase {
  readonly name = 'dissolveAnim';
  private materials: THREE.ShaderMaterial[] = [];

  constructor(public params: DissolveAnimPipeParams = {}) { super(); }

  protected applyToClone(clone: THREE.Mesh | THREE.Group, _original: THREE.Mesh | THREE.Group, _ctx: PipeSetupContext) {
    this.materials = [];
    const color = new THREE.Color(this.params.color ?? 0xff6600);
    clone.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { time: { value: 0 }, color: { value: color } },
          vertexShader: `varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
          fragmentShader: `uniform float time; uniform vec3 color; varying vec3 vPos;
            float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5);}
            void main(){
              float n=hash(vPos*2.+floor(time));
              float threshold=fract(time)*1.2-0.1;
              if(n<threshold)discard;
              float edge=smoothstep(threshold,threshold+0.1,n);
              gl_FragColor=vec4(mix(color,vec3(.9),edge),1.);}`,
          side: THREE.DoubleSide,
        });
        child.material = mat;
        this.materials.push(mat);
      }
    });
  }

  protected tick(ctx: PipeFrameContext) {
    for (const mat of this.materials) mat.uniforms.time.value = ctx.time * (this.params.speed ?? 0.5);
  }

  dispose() {
    super.dispose();
    this.materials = [];
  }
}
