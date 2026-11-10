// CADWorks Pro - Import Engine
// Imports STL (Binary and ASCII), OBJ, DXF, and Project JSON
import * as THREE from 'three';
import { generateId } from '../utils/math';
import { SKETCH_ENTITY_TYPES } from '../utils/constants';

export class ImportEngine {
  /**
   * Import STL (detects ASCII or binary)
   * @param {ArrayBuffer|string} bufferOrString
   * @returns {THREE.BufferGeometry}
   */
  importSTL(bufferOrString) {
    if (typeof bufferOrString === 'string') {
      return this._importAsciiSTL(bufferOrString);
    }

    // Check if binary or ASCII in ArrayBuffer
    const view = new DataView(bufferOrString);
    const isBinary = bufferOrString.byteLength > 84;

    if (isBinary) {
      try {
        return this._importBinarySTL(bufferOrString);
      } catch (e) {
        const decoder = new TextDecoder();
        return this._importAsciiSTL(decoder.decode(bufferOrString));
      }
    }

    const decoder = new TextDecoder();
    return this._importAsciiSTL(decoder.decode(bufferOrString));
  }

  _importBinarySTL(buffer) {
    const reader = new DataView(buffer);
    const numFaces = reader.getUint32(80, true);

    const positions = new Float32Array(numFaces * 9);
    const normals = new Float32Array(numFaces * 9);

    let offset = 84;
    for (let face = 0; face < numFaces; face++) {
      if (offset + 50 > buffer.byteLength) break;

      const nx = reader.getFloat32(offset, true); offset += 4;
      const ny = reader.getFloat32(offset, true); offset += 4;
      const nz = reader.getFloat32(offset, true); offset += 4;

      for (let v = 0; v < 3; v++) {
        const vx = reader.getFloat32(offset, true); offset += 4;
        const vy = reader.getFloat32(offset, true); offset += 4;
        const vz = reader.getFloat32(offset, true); offset += 4;

        const idx = face * 9 + v * 3;
        positions[idx] = vx;
        positions[idx + 1] = vy;
        positions[idx + 2] = vz;

        normals[idx] = nx;
        normals[idx + 1] = ny;
        normals[idx + 2] = nz;
      }
      offset += 2; // attribute byte count
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  _importAsciiSTL(text) {
    const lines = text.split('\n');
    const vertices = [];
    const normals = [];

    let currentNormal = [0, 0, 1];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('facet normal')) {
        const parts = line.split(/\s+/);
        currentNormal = [parseFloat(parts[2]), parseFloat(parts[3]), parseFloat(parts[4])];
      } else if (line.startsWith('vertex')) {
        const parts = line.split(/\s+/);
        vertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
        normals.push(...currentNormal);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Import OBJ format text into THREE.BufferGeometry
   */
  importOBJ(text) {
    const lines = text.split('\n');
    const v = [];
    const vn = [];
    const positions = [];
    const normals = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('#') || line.length === 0) continue;

      const parts = line.split(/\s+/);
      const cmd = parts[0];

      if (cmd === 'v') {
        v.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
      } else if (cmd === 'vn') {
        vn.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
      } else if (cmd === 'f') {
        // Face definition, can have v, v/vt, v/vt/vn, or v//vn
        const faceVertices = [];
        const faceNormals = [];

        for (let i = 1; i < parts.length; i++) {
          const segs = parts[i].split('/');
          const vIdx = parseInt(segs[0], 10) - 1;
          faceVertices.push(v[vIdx]);

          if (segs.length >= 3 && segs[2]) {
            const nIdx = parseInt(segs[2], 10) - 1;
            faceNormals.push(vn[nIdx]);
          }
        }

        // Triangulate face fan
        for (let i = 1; i < faceVertices.length - 1; i++) {
          const v0 = faceVertices[0];
          const v1 = faceVertices[i];
          const v2 = faceVertices[i + 1];

          positions.push(...v0, ...v1, ...v2);

          if (faceNormals.length === faceVertices.length) {
            normals.push(...faceNormals[0], ...faceNormals[i], ...faceNormals[i + 1]);
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length === positions.length) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    return geometry;
  }

  /**
   * Import 2D DXF into sketch entities
   */
  importDXF(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const entities = [];

    let i = 0;
    while (i < lines.length) {
      const code = lines[i];
      const val = lines[i + 1];

      if (code === '0' && val === 'LINE') {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        i += 2;
        while (i < lines.length && lines[i] !== '0') {
          const c = lines[i];
          const v = lines[i + 1];
          if (c === '10') x1 = parseFloat(v);
          if (c === '20') y1 = parseFloat(v);
          if (c === '11') x2 = parseFloat(v);
          if (c === '21') y2 = parseFloat(v);
          i += 2;
        }
        entities.push({
          id: generateId('line'),
          type: SKETCH_ENTITY_TYPES.LINE,
          p1: { x: x1, y: y1 },
          p2: { x: x2, y: y2 },
          construction: false,
        });
        continue;
      } else if (code === '0' && val === 'CIRCLE') {
        let cx = 0, cy = 0, r = 10;
        i += 2;
        while (i < lines.length && lines[i] !== '0') {
          const c = lines[i];
          const v = lines[i + 1];
          if (c === '10') cx = parseFloat(v);
          if (c === '20') cy = parseFloat(v);
          if (c === '40') r = parseFloat(v);
          i += 2;
        }
        entities.push({
          id: generateId('circle'),
          type: SKETCH_ENTITY_TYPES.CIRCLE,
          center: { x: cx, y: cy },
          radius: r,
          construction: false,
        });
        continue;
      }
      i += 2;
    }

    return entities;
  }

  detectFormat(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'stl') return 'stl';
    if (ext === 'obj') return 'obj';
    if (ext === 'dxf') return 'dxf';
    if (ext === 'step' || ext === 'stp') return 'step';
    if (ext === 'json') return 'json';
    return null;
  }
}

export const importEngine = new ImportEngine();
export default ImportEngine;
