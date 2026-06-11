import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface HologramPipeParams { color?: number; scanSpeed?: number; }

export class HologramPipe implements EffectPipe {
  readonly name = 'hologram';
  private mesh: THREE.Mesh | THREE.Group | null = null;
  private materials: THREE.ShaderMaterial[] = [];

  constructor(public params: HologramPipeParams = {}) {}
  setup(_ctx: PipeSetupContext) {}

  onMeshChanged(mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {
    this.mesh = mesh; this.materials = [];
    if (!mesh) return;
    const color = new THREE.Color(this.params.color ?? 0x00ffff);
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { color:{value:color}, time:{value:0} },
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

  update(ctx: PipeFrameContext) {
    for (const mat of this.materials) mat.uniforms.time.value = ctx.time * (this.params.scanSpeed ?? 1);
  }

  dispose() { this.materials = []; this.mesh = null; }
}
