import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext, makeRng } from './base';

export interface FloatingCubesPipeParams { count?: number; color?: number; spread?: number; speed?: number; }

export class FloatingCubesPipe implements EffectPipe {
  readonly name = 'floatingCubes';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private cubes: { mesh: THREE.Mesh; offset: THREE.Vector3; phase: number; rotSpeed: THREE.Vector3 }[] = [];

  constructor(public params: FloatingCubesPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    const { count = 12, color = 0xff6600, spread = 10 } = this.params;
    const rng = makeRng(42);
    for (let i = 0; i < count; i++) {
      const s = 0.1 + rng() * 0.4;
      const geo = new THREE.BoxGeometry(s, s, s);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.2, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      const offset = new THREE.Vector3((rng() - 0.5) * spread, (rng() - 0.5) * spread * 0.5, (rng() - 0.5) * spread * 0.3);
      mesh.position.copy(offset);
      this.group.add(mesh);
      this.cubes.push({ mesh, offset, phase: rng() * Math.PI * 2, rotSpeed: new THREE.Vector3((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05) });
    }
    ctx.scene.add(this.group);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 0.5;
    for (const { mesh, offset, phase, rotSpeed } of this.cubes) {
      const bob = Math.sin(ctx.time * speed + phase) * 0.3;
      mesh.position.set(offset.x, offset.y + bob, offset.z);
      mesh.rotation.x += rotSpeed.x; mesh.rotation.y += rotSpeed.y; mesh.rotation.z += rotSpeed.z;
    }
  }

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null; this.cubes = [];
  }
}
