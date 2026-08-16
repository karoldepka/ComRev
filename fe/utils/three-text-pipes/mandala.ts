import * as THREE from 'three';
import { EffectPipe, PipeFrameContext, PipeSetupContext } from './base';

export interface MandalaPipeParams {
  color?: number;
  opacity?: number;
  petals?: number;
  rings?: number;
  /** Number of nested pattern layers, 1-6. 1 keeps the original simple single-ring
   * look; higher values add progressively more (and finer, counter-rotating)
   * layers for a denser, more intricate sacred-geometry feel. */
  complexity?: number;
  speed?: number;
  size?: number;
  offsetZ?: number;
}

/** A lightweight animated radial pattern rendered behind the text. */
export class MandalaPipe implements EffectPipe {
  readonly name = 'mandala';
  private mesh: THREE.Mesh | null = null;
  private scene: THREE.Scene | null = null;

  constructor(public params: MandalaPipeParams = {}) {}

  setup(ctx: PipeSetupContext) {
    this.scene = ctx.scene;
    const geometry = new THREE.PlaneGeometry(this.params.size ?? 400, this.params.size ?? 400);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(this.params.color ?? 0xff9800) },
        uOpacity: { value: this.params.opacity ?? 0.16 },
        uPetals: { value: this.params.petals ?? 12 },
        uRings: { value: this.params.rings ?? 4 },
        uComplexity: { value: this.params.complexity ?? 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uPetals;
        uniform float uRings;
        uniform float uComplexity;
        const int MAX_LAYERS = 6;
        void main() {
          vec2 p = vUv - 0.5;
          float radius = length(p);
          float baseAngle = atan(p.y, p.x);
          // Each layer nests in its own radius band with its own petal count
          // and counter-rotating speed — at uComplexity=1 this collapses back
          // to the original single-ring look; higher values stack more, finer
          // rings inward and outward for a denser, more intricate pattern.
          float pattern = 0.0;
          for (int i = 0; i < MAX_LAYERS; i++) {
            if (float(i) >= uComplexity) break;
            float fi = float(i);
            float dir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
            float angle = baseAngle + uTime * 0.08 * dir * (1.0 + fi * 0.15);
            float layerPetals = uPetals + fi * 6.0;
            float petalWave = cos(angle * layerPetals) * 0.5 + 0.5;
            float ringWave = cos(radius * (uRings + fi * 3.0) * 18.0 - uTime * 0.45 * (1.0 + fi * 0.1)) * 0.5 + 0.5;
            float layerPattern = smoothstep(0.56, 0.92, petalWave * ringWave);
            float bandInner = 0.02 + fi * 0.025;
            float bandOuter = 0.74 - fi * 0.045;
            float halo = smoothstep(bandInner, bandInner + 0.19, radius) * smoothstep(bandOuter, bandOuter - 0.46, radius);
            pattern = max(pattern, layerPattern * halo);
          }
          gl_FragColor = vec4(uColor, pattern * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.z = this.params.offsetZ ?? -50;
    this.mesh.renderOrder = -20;
    ctx.scene.add(this.mesh);
  }

  update(ctx: PipeFrameContext) {
    if (!this.mesh) return;
    const material = this.mesh.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value = ctx.time * (this.params.speed ?? 1);
    material.uniforms.uColor.value.set(this.params.color ?? 0xff9800);
    material.uniforms.uOpacity.value = this.params.opacity ?? 0.16;
    material.uniforms.uPetals.value = this.params.petals ?? 12;
    material.uniforms.uRings.value = this.params.rings ?? 4;
    material.uniforms.uComplexity.value = this.params.complexity ?? 1;
    this.mesh.position.z = this.params.offsetZ ?? -50;
  }

  dispose() {
    if (!this.mesh || !this.scene) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
  }
}
