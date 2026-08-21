import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

const SOURCE_PATH = resolve('src/new_brain/source/Brain.glb');
const OUTPUT_PATH = resolve('src/new_brain/runtime/Brain.runtime.glb');
const TARGET_TRIANGLES = 80_000;
const TARGET_ERROR = 0.006;

const COMPONENT_BYTES = {
  5123: 2,
  5125: 4,
  5126: 4,
};

function align4(value) {
  return (value + 3) & ~3;
}

function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('Expected a glTF 2.0 binary source.');
  }

  let offset = 12;
  let json = null;
  let binary = null;
  while (offset < bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(chunk).replace(/\u0000+$/, ''));
    } else if (chunkType === 0x004e4942) {
      binary = chunk;
    }
    offset += 8 + chunkLength;
  }

  if (json === null || binary === null) {
    throw new Error('Source GLB is missing its JSON or BIN chunk.');
  }
  return { json, binary };
}

function accessorView(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const bufferView = json.bufferViews[accessor.bufferView];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  if (componentBytes === undefined || bufferView.byteStride !== undefined) {
    throw new Error('The optimizer expects tightly packed float or unsigned-index accessors.');
  }

  const components = accessor.type === 'VEC3' ? 3 : accessor.type === 'SCALAR' ? 1 : 0;
  if (components === 0) {
    throw new Error(`Unsupported accessor type: ${accessor.type}`);
  }
  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const elementCount = accessor.count * components;
  const sourceOffset = binary.byteOffset + byteOffset;

  if (accessor.componentType === 5126) {
    return new Float32Array(binary.buffer, sourceOffset, elementCount).slice();
  }
  if (accessor.componentType === 5125) {
    return new Uint32Array(binary.buffer, sourceOffset, elementCount).slice();
  }
  if (accessor.componentType === 5123) {
    return Uint32Array.from(new Uint16Array(binary.buffer, sourceOffset, elementCount));
  }
  throw new Error(`Unsupported component type: ${accessor.componentType}`);
}

function compactAttributes(indices, positions, normals) {
  const [remap, vertexCount] = MeshoptSimplifier.compactMesh(indices);
  const compactPositions = new Float32Array(vertexCount * 3);
  const compactNormals = new Float32Array(vertexCount * 3);

  for (let sourceIndex = 0; sourceIndex < remap.length; sourceIndex += 1) {
    const targetIndex = remap[sourceIndex];
    if (targetIndex >= vertexCount) continue;
    compactPositions.set(positions.subarray(sourceIndex * 3, sourceIndex * 3 + 3), targetIndex * 3);
    compactNormals.set(normals.subarray(sourceIndex * 3, sourceIndex * 3 + 3), targetIndex * 3);
  }
  return { positions: compactPositions, normals: compactNormals };
}

function recomputeNormals(indices, positions) {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index] * 3;
    const ib = indices[index + 1] * 3;
    const ic = indices[index + 2] * 3;
    const abx = positions[ib] - positions[ia];
    const aby = positions[ib + 1] - positions[ia + 1];
    const abz = positions[ib + 2] - positions[ia + 2];
    const acx = positions[ic] - positions[ia];
    const acy = positions[ic + 1] - positions[ia + 1];
    const acz = positions[ic + 2] - positions[ia + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const vertexOffset of [ia, ib, ic]) {
      normals[vertexOffset] += nx;
      normals[vertexOffset + 1] += ny;
      normals[vertexOffset + 2] += nz;
    }
  }

  for (let offset = 0; offset < normals.length; offset += 3) {
    const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]);
    if (length > 1e-12) {
      normals[offset] /= length;
      normals[offset + 1] /= length;
      normals[offset + 2] /= length;
    } else {
      normals[offset + 1] = 1;
    }
  }
  return normals;
}

function validate(indices, positions, normals) {
  if (positions.length !== normals.length || positions.length % 3 !== 0 || indices.length % 3 !== 0) {
    throw new Error('Runtime geometry has inconsistent attribute or index capacity.');
  }
  const vertexCount = positions.length / 3;
  let degenerateTriangles = 0;
  for (const value of positions) {
    if (!Number.isFinite(value)) throw new Error('Runtime geometry contains a non-finite position.');
  }
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset];
    const b = indices[offset + 1];
    const c = indices[offset + 2];
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
      throw new Error('Runtime geometry contains an out-of-range index.');
    }
    if (a === b || b === c || c === a) degenerateTriangles += 1;
  }
  if (degenerateTriangles > 0) {
    throw new Error(`Runtime geometry contains ${degenerateTriangles} degenerate triangles.`);
  }
}

function attributeBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }
  return { min, max };
}

function writeGlb(indices, positions, normals) {
  const indexBytes = new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength);
  const positionBytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
  const normalBytes = new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength);
  const indexOffset = 0;
  const positionOffset = align4(indexBytes.byteLength);
  const normalOffset = align4(positionOffset + positionBytes.byteLength);
  const binaryLength = align4(normalOffset + normalBytes.byteLength);
  const binary = new Uint8Array(binaryLength);
  binary.set(indexBytes, indexOffset);
  binary.set(positionBytes, positionOffset);
  binary.set(normalBytes, normalOffset);
  const bounds = attributeBounds(positions);

  const json = {
    asset: { generator: 'synapse meshoptimizer pipeline', version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'BrainRuntime' }],
    meshes: [
      {
        name: 'BrainRuntime',
        primitives: [
          {
            attributes: { POSITION: 1, NORMAL: 2 },
            indices: 0,
            mode: 4,
          },
        ],
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5125, count: indices.length, type: 'SCALAR' },
      {
        bufferView: 1,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: bounds.min,
        max: bounds.max,
      },
      { bufferView: 2, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength, target: 34963 },
      { buffer: 0, byteOffset: positionOffset, byteLength: positionBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: normalOffset, byteLength: normalBytes.byteLength, target: 34962 },
    ],
    buffers: [{ byteLength: binaryLength }],
  };

  const encodedJson = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(encodedJson.byteLength);
  const totalLength = 12 + 8 + jsonLength + 8 + binaryLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + jsonLength);
  glb.set(encodedJson, 20);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binaryLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  glb.set(binary, binaryHeader + 8);
  return glb;
}

await MeshoptSimplifier.ready;
const sourceBytes = new Uint8Array(await readFile(SOURCE_PATH));
const { json, binary } = parseGlb(sourceBytes);
const primitive = json.meshes?.[0]?.primitives?.[0];
if (primitive === undefined || primitive.mode !== 4 || primitive.indices === undefined) {
  throw new Error('Expected one indexed triangle primitive in the source brain.');
}

const positions = accessorView(json, binary, primitive.attributes.POSITION);
const sourceNormals = accessorView(json, binary, primitive.attributes.NORMAL);
const sourceIndices = accessorView(json, binary, primitive.indices);
const targetIndexCount = TARGET_TRIANGLES * 3;
const [simplifiedIndices, simplificationError] = MeshoptSimplifier.simplifyWithAttributes(
  sourceIndices,
  positions,
  3,
  sourceNormals,
  3,
  [0.35, 0.35, 0.35],
  null,
  targetIndexCount,
  TARGET_ERROR,
  ['Permissive', 'Prune', 'Regularize'],
);
const { positions: compactPositions } = compactAttributes(
  simplifiedIndices,
  positions,
  sourceNormals,
);
const compactNormals = recomputeNormals(simplifiedIndices, compactPositions);
validate(simplifiedIndices, compactPositions, compactNormals);
const outputBytes = writeGlb(simplifiedIndices, compactPositions, compactNormals);
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, outputBytes);

console.log(
  JSON.stringify(
    {
      source: {
        bytes: sourceBytes.byteLength,
        vertices: positions.length / 3,
        triangles: sourceIndices.length / 3,
      },
      runtime: {
        bytes: outputBytes.byteLength,
        vertices: compactPositions.length / 3,
        triangles: simplifiedIndices.length / 3,
        simplificationError,
        removedTextureAndUvs: true,
      },
    },
    null,
    2,
  ),
);
