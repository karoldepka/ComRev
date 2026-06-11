import * as THREE from 'three';
import { EffectPipe, PipeSetupContext, PipeFrameContext } from './base';

export interface CometTrailPipeParams { color?: number; speed?: number; count?: number; }

export class CometTrailPipe implements EffectPipe {
  readonly name = 'cometTrail';
  private group: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private comets: { head: THREE.Mesh; trail: THREE.Line; theta: number; phi: number; r: number }[] = [];

  constructor(public params: CometTrailPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    const { count = 3, color = 0xffffff } = this.params;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.08, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color });
      const head = new THREE.Mesh(geo, mat);
      // Trail as line with 12 points
      const trailGeo = new THREE.BufferGeometry();
      const pts = new Float32Array(12 * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 }));
      this.group.add(head, trail);
      this.comets.push({ head, trail, theta: (i / count) * Math.PI * 2, phi: Math.random() * Math.PI, r: 6 + i * 1.5 });
    }
    ctx.scene.add(this.group);
  }

  onMeshChanged(_mesh: THREE.Mesh | THREE.Group | null, _ctx: PipeSetupContext) {}

  update(ctx: PipeFrameContext) {
    const speed = this.params.speed ?? 1.2;
    for (const c of this.comets) {
      c.theta += ctx.delta * speed * (0.8 + c.r * 0.03);
      const x = Math.cos(c.theta) * c.r;
      const y = Math.sin(c.theta * 0.7 + c.phi) * 2;
      const z = Math.sin(c.theta) * c.r;
      c.head.position.set(x, y, z);
      const pts = c.trail.geometry.attributes.position.array as Float32Array;
      pts.copyWithin(3, 0, pts.length - 3);
      pts[0] = x; pts[1] = y; pts[2] = z;
      c.trail.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    if (this.group && this.scene) this.scene.remove(this.group);
    this.group = null; this.comets = [];
  }
}
