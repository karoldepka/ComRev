import * as THREE from "three";

/**
 * Wire format for shuttling a built text Group across the worker boundary.
 * Plain typed arrays only (structured-clone/Transferable-safe) — no THREE
 * class instances, which can't cross postMessage.
 */
export interface SerializedGeometry {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  index: Uint16Array | Uint32Array | null;
  groups: { start: number; count: number; materialIndex: number }[];
}

export type SerializedNode =
  | { kind: "group"; x: number; y: number; z: number; children: SerializedNode[] }
  | { kind: "mesh"; x: number; y: number; z: number; geometry: SerializedGeometry };

export interface WorkerResponse {
  id: number;
  node?: SerializedNode;
  error?: string;
}

/** The subset of TextGeometryOptions that actually affects layout/geometry
 * (as opposed to materials, which stay main-thread-only). Declared here
 * rather than imported from three-text-geometry.ts so the worker-client
 * module doesn't import back into it, which would create a require cycle. */
export interface WorkerGeometryOptions {
  text: string;
  fontFamily?: string;
  size?: number;
  height?: number;
  curveSegments?: number;
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelOffset?: number;
  bevelSegments?: number;
  equalizeLineWidths?: boolean;
  equalizationMethod?: 'spacing' | 'fontSize';
  targetWidth?: number;
  lineSpacing?: number;
}

/** Runs in the worker: flattens a built Group/Mesh tree into transferable data. */
export function serializeNode(obj: THREE.Object3D, transfer: Transferable[]): SerializedNode {
  if (obj instanceof THREE.Mesh) {
    const geo = obj.geometry as THREE.BufferGeometry;
    const position = geo.attributes.position.array as Float32Array;
    const normal = geo.attributes.normal.array as Float32Array;
    const uv = geo.attributes.uv.array as Float32Array;
    const index = geo.index ? (geo.index.array as Uint16Array | Uint32Array) : null;
    transfer.push(position.buffer, normal.buffer, uv.buffer);
    if (index) transfer.push(index.buffer);
    return {
      kind: "mesh",
      x: obj.position.x,
      y: obj.position.y,
      z: obj.position.z,
      geometry: {
        position,
        normal,
        uv,
        index,
        groups: geo.groups.map((g) => ({
          start: g.start,
          count: g.count,
          materialIndex: g.materialIndex ?? 0,
        })),
      },
    };
  }
  return {
    kind: "group",
    x: obj.position.x,
    y: obj.position.y,
    z: obj.position.z,
    children: obj.children.map((child) => serializeNode(child, transfer)),
  };
}

/** Runs on the main thread: reconstructs the real THREE Group/Mesh tree. */
export function deserializeNode(node: SerializedNode): THREE.Object3D {
  if (node.kind === "mesh") {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(node.geometry.position, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(node.geometry.normal, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(node.geometry.uv, 2));
    if (node.geometry.index) {
      geo.setIndex(new THREE.BufferAttribute(node.geometry.index, 1));
    }
    for (const g of node.geometry.groups) {
      geo.addGroup(g.start, g.count, g.materialIndex);
    }
    const mesh = new THREE.Mesh(geo);
    mesh.position.set(node.x, node.y, node.z);
    return mesh;
  }
  const group = new THREE.Group();
  group.position.set(node.x, node.y, node.z);
  for (const child of node.children) {
    group.add(deserializeNode(child));
  }
  return group;
}
