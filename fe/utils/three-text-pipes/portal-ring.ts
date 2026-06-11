import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface PortalRingPipeParams { color?: number; radius?: number; speed?: number; }

export class PortalRingPipe implements EffectPipe {
  readonly name = 'portalRing';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private materials: THREE.ShaderMaterial[] = [];

  constructor(public params: PortalRingPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    const { color = 0x00ffff, radius = 5 } = this.params;
    const c = new THREE.Color(color);
    // Outer torus with spinning shader
    const torusGeo = new THREE.TorusGeometry(radius, 0.15, 12, 100);
    const mat = new THREE.ShaderMaterial({
      uniforms: { color:{value:c}, time:{value:0} },
      vertexShader: `varying float vAngle; void main(){vAngle=atan(position.y,position.x);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform vec3 color; uniform float time; varying float vAngle;
        void main(){float a=fract(vAngle/(3.14159*2.)+time)*2.;float bright=smoothstep(1.,0.,abs(a-1.));gl_FragColor=vec4(color*bright,bright);}`,
      transparent: true, side: THREE.DoubleSide,
    });
    const torus = new THREE.Mesh(torusGeo, mat);
    torus.rotation.y = Math.PI / 2;
    this.group.add(torus);
    this.materials.push(mat);
    ctx.scene.add(this.group);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 0.5;
    for (const mat of this.materials) mat.uniforms.time.value = ctx.time * speed;
  }

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null; this.materials = [];
  }
}
