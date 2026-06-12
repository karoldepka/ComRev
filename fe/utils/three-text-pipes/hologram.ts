import * as THREE from 'three';
import { LayeredMeshPipeBase, PipeSetupContext, PipeFrameContext } from './base';

export interface HologramPipeParams { color?: number; scanSpeed?: number; }

export class HologramPipe extends LayeredMeshPipeBase {
  readonly name = 'hologram';
  private materials: THREE.ShaderMaterial[] = [];
  private savedMaterials: MaterialMap = new Map();

  constructor(public params: HologramPipeParams = {}) { super(); }

  protected applyToClone(clone: THREE.Mesh | THREE.Group, _original: THREE.Mesh | THREE.Group, _ctx: PipeSetupContext) {
    this.materials = [];
    const color = new THREE.Color(this.params.color ?? 0x00ffff);
    clone.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { color: { value: color }, time: { value: 0 } },
          vertexShader: `varying vec2 vUv; varying vec3 vNormal; void main(){vUv=uv;vNormal=normalMatrix*normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
          fragmentShader: `uniform vec3 color; uniform float time; varying vec2 vUv; varying vec3 vNormal;
            void main(){
              float rim=1.-abs(dot(vNormal,vec3(0.,0.,1.)));
              float scan=step(0.5,fract(vUv.y*20.-time*2.))*0.3;
              float alpha=(rim*0.6+scan+0.15);
              gl_FragColor=vec4(color,clamp(alpha,0.,0.85));}`,
          transparent: true, depthWrite: false, side: THREE.DoubleSide,
        });
        child.material = mat;
        this.materials.push(mat);
      }
    });
  }

  protected tick(ctx: PipeFrameContext) {
    for (const mat of this.materials) mat.uniforms.time.value = ctx.time * (this.params.scanSpeed ?? 1);
  }

  dispose() {
    super.dispose();
    this.materials = [];
  }
}
