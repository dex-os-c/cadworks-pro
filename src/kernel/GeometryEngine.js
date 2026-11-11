// CADWorks Pro - Core Geometry Engine
// Provides all 3D modeling operations including extrude, revolve, sweep, loft,
// fillets, chamfers, shells, holes, patterns, mirrors, and CSG booleans.

import * as THREE from 'three';
import { EPSILON, vec3, generateId } from '../utils/math.js';
import {
  Vertex,
  Edge,
  CoEdge,
  Loop,
  Face,
  Shell,
  SolidBody,
  Curve,
  LineCurve,
  ArcCurve,
  NurbsCurve,
  Surface,
  PlaneSurface,
  CylinderSurface,
  ConeSurface,
  TorusSurface,
  SphereSurface,
  CURVE_TYPES,
  SURFACE_TYPES,
  safeNormalize,
  sanitizePoint,
  removeConsecutiveDuplicates,
} from './Topology.js';
import {
  createSolidBox,
  createSolidCylinder,
  extrudeSolid,
  revolveSolid,
  sweepSolid,
  loftSolid,
  filletSolid,
  chamferSolid,
  shellSolid,
  booleanUnion as brepBooleanUnion,
  booleanSubtract as brepBooleanSubtract,
  booleanIntersect as brepBooleanIntersect,
  solidToBufferGeometry,
  bufferGeometryToSolid,
  extractBRepEdges,
} from './BRep.js';

// ============================================================================
// BSP-Tree CSG Implementation
// ============================================================================

/**
 * CSG Vertex: position + normal
 */
class CSGVertex {
  constructor(pos, normal) {
    this.pos = sanitizePoint(pos);
    this.normal = safeNormalize(normal, new THREE.Vector3(0, 0, 1));
  }

  clone() {
    return new CSGVertex(this.pos, this.normal);
  }

  flip() {
    this.normal.negate();
  }

  interpolate(other, t) {
    const clampedT = isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
    const p = this.pos.clone().lerp(other.pos, clampedT);
    const n = this.normal.clone().lerp(other.normal, clampedT);
    return new CSGVertex(p, safeNormalize(n, this.normal));
  }
}

/**
 * CSG Polygon: array of vertices + shared metadata
 */
class CSGPolygon {
  constructor(vertices, shared = null) {
    const cleaned = [];
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (!cleaned.length || v.pos.distanceTo(cleaned[cleaned.length - 1].pos) > 1e-6) {
        cleaned.push(v);
      }
    }
    if (cleaned.length > 1 && cleaned[0].pos.distanceTo(cleaned[cleaned.length - 1].pos) <= 1e-6) {
      cleaned.pop();
    }
    this.vertices = cleaned.length >= 3 ? cleaned : vertices;
    this.shared = shared;
    this.plane = CSGPlane.fromVertices(this.vertices);
  }

  computeArea() {
    if (this.vertices.length < 3) return 0;
    let areaVec = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < this.vertices.length; i++) {
      const v0 = this.vertices[i].pos;
      const v1 = this.vertices[(i + 1) % this.vertices.length].pos;
      areaVec.add(new THREE.Vector3().crossVectors(v0, v1));
    }
    const a = areaVec.dot(this.plane.normal) * 0.5;
    return isNaN(a) ? 0 : Math.abs(a);
  }

  clone() {
    return new CSGPolygon(
      this.vertices.map(v => v.clone()),
      this.shared
    );
  }

  flip() {
    this.vertices.reverse().forEach(v => v.flip());
    this.plane.flip();
  }
}

/**
 * CSG Plane: defined by normal and w (distance from origin)
 */
class CSGPlane {
  constructor(normal, w) {
    this.normal = safeNormalize(normal, new THREE.Vector3(0, 0, 1));
    this.w = typeof w === 'number' && !isNaN(w) && isFinite(w) ? w : 0;
  }

  static fromPoints(a, b, c) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const n = new THREE.Vector3().crossVectors(ab, ac);
    const norm = safeNormalize(n, new THREE.Vector3(0, 0, 1));
    return new CSGPlane(norm, norm.dot(a));
  }

  static fromVertices(vertices) {
    if (!vertices || vertices.length < 3) {
      return new CSGPlane(new THREE.Vector3(0, 0, 1), 0);
    }
    const normal = new THREE.Vector3(0, 0, 0);
    const center = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < vertices.length; i++) {
      const curr = vertices[i].pos;
      const next = vertices[(i + 1) % vertices.length].pos;
      normal.x += (curr.y - next.y) * (curr.z + next.z);
      normal.y += (curr.z - next.z) * (curr.x + next.x);
      normal.z += (curr.x - next.x) * (curr.y + next.y);
      center.add(curr);
    }
    center.divideScalar(vertices.length);
    const norm = safeNormalize(normal, new THREE.Vector3(0, 0, 1));
    return new CSGPlane(norm, norm.dot(center));
  }

  clone() {
    return new CSGPlane(this.normal.clone(), this.w);
  }

  flip() {
    this.normal.negate();
    this.w = -this.w;
  }

  /**
   * Split polygon by this plane, categorizing into coplanar-front,
   * coplanar-back, front, back, or splitting across the plane.
   */
  splitPolygon(polygon, coplanarFront, coplanarBack, front, back) {
    const COPLANAR = 0;
    const FRONT = 1;
    const BACK = 2;
    const SPANNING = 3;
    const CSG_EPSILON = 1e-4;

    let polygonType = 0;
    const types = [];

    for (const vertex of polygon.vertices) {
      const t = this.normal.dot(vertex.pos) - this.w;
      const type = (t < -CSG_EPSILON) ? BACK : (t > CSG_EPSILON) ? FRONT : COPLANAR;
      polygonType |= type;
      types.push(type);
    }

    switch (polygonType) {
      case COPLANAR:
        (this.normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack)
          .push(polygon);
        break;
      case FRONT:
        front.push(polygon);
        break;
      case BACK:
        back.push(polygon);
        break;
      case SPANNING: {
        const f = [];
        const b = [];
        for (let i = 0; i < polygon.vertices.length; i++) {
          const j = (i + 1) % polygon.vertices.length;
          const ti = types[i];
          const tj = types[j];
          const vi = polygon.vertices[i];
          const vj = polygon.vertices[j];

          if (ti !== BACK) f.push(vi);
          if (ti !== FRONT) b.push(ti !== BACK ? vi.clone() : vi);

          if ((ti | tj) === SPANNING) {
            const denom = this.normal.dot(new THREE.Vector3().subVectors(vj.pos, vi.pos));
            const t = Math.abs(denom) > 1e-9
              ? (this.w - this.normal.dot(vi.pos)) / denom
              : 0;
            const clampedT = isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
            const v = vi.interpolate(vj, clampedT);
            f.push(v);
            b.push(v.clone());
          }
        }
        if (f.length >= 3) {
          const polyF = new CSGPolygon(f, polygon.shared);
          if (polyF.computeArea() > 1e-9) front.push(polyF);
        }
        if (b.length >= 3) {
          const polyB = new CSGPolygon(b, polygon.shared);
          if (polyB.computeArea() > 1e-9) back.push(polyB);
        }
        break;
      }
    }
  }
}

/**
 * BSP Tree Node for CSG operations
 */
class CSGNode {
  constructor(polygons) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polygons = [];
    if (polygons && polygons.length > 0) {
      this.build(polygons);
    }
  }

  clone() {
    const node = new CSGNode();
    node.plane = this.plane ? this.plane.clone() : null;
    node.front = this.front ? this.front.clone() : null;
    node.back = this.back ? this.back.clone() : null;
    node.polygons = this.polygons.map(p => p.clone());
    return node;
  }

  /**
   * Invert all polygons and swap front/back subtrees
   */
  invert() {
    for (const polygon of this.polygons) {
      polygon.flip();
    }
    if (this.plane) this.plane.flip();
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    const temp = this.front;
    this.front = this.back;
    this.back = temp;
  }

  /**
   * Recursively remove all polygons that are inside this BSP tree.
   */
  clipPolygons(polygons) {
    if (!this.plane) return polygons.slice();

    let front = [];
    let back = [];

    for (const polygon of polygons) {
      this.plane.splitPolygon(polygon, front, back, front, back);
    }

    if (this.front) front = this.front.clipPolygons(front);
    if (this.back) back = this.back.clipPolygons(back);
    else back = [];

    return front.concat(back);
  }

  /**
   * Remove polygons in this tree that are inside the other BSP tree.
   */
  clipTo(bsp) {
    this.polygons = bsp.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  }

  /**
   * Collect all polygons from this BSP tree.
   */
  allPolygons() {
    let polygons = this.polygons.slice();
    if (this.front) polygons = polygons.concat(this.front.allPolygons());
    if (this.back) polygons = polygons.concat(this.back.allPolygons());
    return polygons;
  }

  /**
   * Build the BSP tree from an array of polygons.
   */
  build(polygons) {
    if (polygons.length === 0) return;

    if (!this.plane) {
      this.plane = polygons[0].plane.clone();
    }

    const front = [];
    const back = [];

    for (const polygon of polygons) {
      this.plane.splitPolygon(
        polygon,
        this.polygons,
        this.polygons,
        front,
        back
      );
    }

    if (front.length > 0) {
      if (!this.front) this.front = new CSGNode();
      this.front.build(front);
    }
    if (back.length > 0) {
      if (!this.back) this.back = new CSGNode();
      this.back.build(back);
    }
  }
}

// ============================================================================
// CSG Utility Functions
// ============================================================================

/**
 * Convert a Three.js BufferGeometry to an array of CSG polygons.
 */
function geometryToPolygons(geometry) {
  const polygons = [];
  const posAttr = geometry.getAttribute('position');
  const normAttr = geometry.getAttribute('normal');
  const indexAttr = geometry.index;

  // Ensure normals exist
  if (!normAttr) {
    geometry.computeVertexNormals();
  }
  const normals = geometry.getAttribute('normal');

  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i += 3) {
      const vertices = [];
      for (let j = 0; j < 3; j++) {
        const idx = indexAttr.getX(i + j);
        const pos = new THREE.Vector3(
          posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx)
        );
        const normal = new THREE.Vector3(
          normals.getX(idx), normals.getY(idx), normals.getZ(idx)
        );
        vertices.push(new CSGVertex(pos, normal));
      }
      // Skip degenerate triangles
      const edge1 = new THREE.Vector3().subVectors(vertices[1].pos, vertices[0].pos);
      const edge2 = new THREE.Vector3().subVectors(vertices[2].pos, vertices[0].pos);
      if (edge1.cross(edge2).lengthSq() > EPSILON) {
        polygons.push(new CSGPolygon(vertices));
      }
    }
  } else {
    for (let i = 0; i < posAttr.count; i += 3) {
      const vertices = [];
      for (let j = 0; j < 3; j++) {
        const idx = i + j;
        const pos = new THREE.Vector3(
          posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx)
        );
        const normal = new THREE.Vector3(
          normals.getX(idx), normals.getY(idx), normals.getZ(idx)
        );
        vertices.push(new CSGVertex(pos, normal));
      }
      const edge1 = new THREE.Vector3().subVectors(vertices[1].pos, vertices[0].pos);
      const edge2 = new THREE.Vector3().subVectors(vertices[2].pos, vertices[0].pos);
      if (edge1.cross(edge2).lengthSq() > EPSILON) {
        polygons.push(new CSGPolygon(vertices));
      }
    }
  }

  return polygons;
}

/**
 * Convert an array of CSG polygons back to Three.js BufferGeometry.
 */
function polygonsToGeometry(polygons) {
  const positions = [];
  const normals = [];

  for (const polygon of polygons) {
    // Triangulate polygon (fan from first vertex)
    for (let i = 2; i < polygon.vertices.length; i++) {
      const v0 = polygon.vertices[0];
      const v1 = polygon.vertices[i - 1];
      const v2 = polygon.vertices[i];

      positions.push(v0.pos.x, v0.pos.y, v0.pos.z);
      positions.push(v1.pos.x, v1.pos.y, v1.pos.z);
      positions.push(v2.pos.x, v2.pos.y, v2.pos.z);

      normals.push(v0.normal.x, v0.normal.y, v0.normal.z);
      normals.push(v1.normal.x, v1.normal.y, v1.normal.z);
      normals.push(v2.normal.x, v2.normal.y, v2.normal.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

// ============================================================================
// GeometryEngine Class
// ============================================================================

class GeometryEngine {
  constructor() {
    this.tolerance = 1e-6;
  }

  // ==========================================================================
  // Profile-Based Operations
  // ==========================================================================

  /**
   * Extrude a 2D Three.js Shape into 3D geometry.
   * @param {THREE.Shape} shape - The 2D profile to extrude
   * @param {number} depth - Extrusion depth
   * @param {THREE.Vector3} direction - Extrusion direction (default: Z-up)
   * @param {Object} options - { symmetric, endCondition, draft, draftAngle }
   * @returns {THREE.BufferGeometry}
   */
  extrudeProfile(shape, depth, direction = null, options = {}) {
    const {
      symmetric = false,
      endCondition = 'blind', // 'blind', 'through', 'upTo', 'midplane'
      draft = false,
      draftAngle = 0,
      steps = 1,
      bevelEnabled = false,
      bevelThickness = 0,
      bevelSize = 0,
      bevelSegments = 1,
      flip = false,
      plane = 'Front',
    } = options;

    const isMidplane = symmetric || endCondition === 'midplane';
    let actualDepth = depth;
    if (endCondition === 'through') {
      actualDepth = 500;
    }

    const extrudeSettings = {
      steps: steps,
      depth: actualDepth,
      bevelEnabled: bevelEnabled || draft,
      bevelThickness: draft ? Math.tan(draftAngle * Math.PI / 180) * actualDepth : bevelThickness,
      bevelSize: draft ? Math.tan(draftAngle * Math.PI / 180) * actualDepth : bevelSize,
      bevelSegments: bevelSegments,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Symmetric / Mid-plane: center around sketch plane
    if (isMidplane) {
      geometry.translate(0, 0, -actualDepth / 2);
    }

    // Direction flip
    if (flip) {
      geometry.translate(0, 0, isMidplane ? 0 : -actualDepth);
      const pos = geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, -pos.getZ(i));
      }
      geometry.computeVertexNormals();
    }

    // Transform by sketch plane orientation if specified
    const planeName = typeof direction === 'string' ? direction : plane;
    if (planeName) {
      if (planeName === 'Top' || planeName === 'XZ') {
        geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      } else if (planeName === 'Right' || planeName === 'YZ') {
        geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      }
    } else if (direction instanceof THREE.Vector3) {
      const defaultDir = new THREE.Vector3(0, 0, 1);
      const dir = direction.clone().normalize();
      if (dir.distanceTo(defaultDir) > EPSILON) {
        const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDir, dir);
        geometry.applyQuaternion(quaternion);
      }
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  }

  /**
   * Revolve a 2D profile around an axis.
   * @param {THREE.Shape} shape - The 2D profile to revolve
   * @param {THREE.Vector3} axis - Rotation axis (default: Y)
   * @param {number} angle - Revolution angle in radians (default: 2π)
   * @param {Object} options - { segments, offset }
   * @returns {THREE.BufferGeometry}
   */
  revolveProfile(shape, axis = null, angle = Math.PI * 2, options = {}) {
    const {
      segments = 64,
      offset = 0,
    } = options;

    // Extract points from the shape for LatheGeometry
    const points = shape.getPoints(50);

    // Offset points from axis if needed
    const lathePoints = points.map(p =>
      new THREE.Vector2(Math.abs(p.x) + offset, p.y)
    );

    // LatheGeometry revolves around the Y-axis
    const geometry = new THREE.LatheGeometry(lathePoints, segments, 0, angle);

    // Rotate to align with the specified axis if not Y
    if (axis) {
      const defaultAxis = new THREE.Vector3(0, 1, 0);
      const targetAxis = axis.clone().normalize();
      if (targetAxis.distanceTo(defaultAxis) > EPSILON) {
        const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultAxis, targetAxis);
        geometry.applyQuaternion(quaternion);
      }
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  }

  /**
   * Sweep a 2D profile along a 3D path curve.
   * @param {THREE.Shape} shape - The cross-section profile
   * @param {THREE.Curve} path - The sweep path (e.g., CatmullRomCurve3)
   * @param {Object} options - { steps, closed, twist }
   * @returns {THREE.BufferGeometry}
   */
  sweepProfile(shape, path, options = {}) {
    const {
      steps = 100,
      closed = false,
      twist = 0,
    } = options;

    const extrudeSettings = {
      steps: steps,
      bevelEnabled: false,
      extrudePath: path,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Apply twist if specified
    if (twist !== 0) {
      const posAttr = geometry.getAttribute('position');
      const pathLength = path.getLength();

      for (let i = 0; i < posAttr.count; i++) {
        const vertex = new THREE.Vector3(
          posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)
        );

        // Find the closest point on the path to determine the twist angle
        // Use an approximate method: project onto path
        const closestParam = this._findClosestParamOnPath(vertex, path, steps);
        const twistAngle = closestParam * twist;

        // Get the tangent at this point
        const tangent = path.getTangentAt(closestParam).normalize();
        const pointOnPath = path.getPointAt(closestParam);

        // Rotate vertex around the tangent at the path point
        const offset = vertex.clone().sub(pointOnPath);
        const rotMatrix = new THREE.Matrix4().makeRotationAxis(tangent, twistAngle);
        offset.applyMatrix4(rotMatrix);
        vertex.copy(pointOnPath).add(offset);

        posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
      posAttr.needsUpdate = true;
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  }

  /**
   * Create geometry by interpolating between multiple cross-section shapes.
   * @param {THREE.Shape[]} shapes - Array of cross-section profiles
   * @param {Object} options - { steps, closed }
   * @returns {THREE.BufferGeometry}
   */
  loftProfiles(shapes, options = {}) {
    const {
      steps = 32,
      closed = false,
      heights = null, // Array of Z-heights for each cross-section
    } = options;

    if (shapes.length < 2) {
      throw new Error('Loft requires at least 2 cross-section shapes');
    }

    // Extract points from each shape
    const pointsPerShape = 64;
    const profiles = shapes.map(s => s.getPoints(pointsPerShape));

    // Ensure all profiles have the same number of points by resampling
    const maxPoints = Math.max(...profiles.map(p => p.length));
    const normalizedProfiles = profiles.map(profile => {
      if (profile.length === maxPoints) return profile;
      return this._resamplePoints(profile, maxPoints);
    });

    // Compute heights for each profile if not provided
    const zHeights = heights || normalizedProfiles.map((_, i) =>
      i / (normalizedProfiles.length - 1) * 100
    );

    // Build geometry by interpolating between profiles
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const numProfiles = normalizedProfiles.length;
    const totalSteps = (numProfiles - 1) * steps;

    // Generate interpolated profiles at each step
    const interpolatedProfiles = [];
    for (let s = 0; s <= totalSteps; s++) {
      const t = s / totalSteps;
      const globalT = t * (numProfiles - 1);
      const profileIdx = Math.min(Math.floor(globalT), numProfiles - 2);
      const localT = globalT - profileIdx;

      const profile = normalizedProfiles[profileIdx].map((p, i) => {
        const nextP = normalizedProfiles[profileIdx + 1][i];
        const x = p.x + (nextP.x - p.x) * localT;
        const y = p.y + (nextP.y - p.y) * localT;
        const z = zHeights[profileIdx] + (zHeights[profileIdx + 1] - zHeights[profileIdx]) * localT;
        return new THREE.Vector3(x, y, z);
      });
      interpolatedProfiles.push(profile);
    }

    // Build mesh from interpolated profiles
    const numPoints = maxPoints;
    for (let s = 0; s < interpolatedProfiles.length; s++) {
      for (let p = 0; p < numPoints; p++) {
        const v = interpolatedProfiles[s][p];
        positions.push(v.x, v.y, v.z);

        // Compute normal (approximate)
        const u0 = s / interpolatedProfiles.length;
        const v0 = p / numPoints;
        uvs.push(u0, v0);
      }
    }

    // Compute normals and build faces
    for (let s = 0; s < interpolatedProfiles.length - 1; s++) {
      for (let p = 0; p < numPoints - 1; p++) {
        const a = s * numPoints + p;
        const b = s * numPoints + (p + 1);
        const c = (s + 1) * numPoints + (p + 1);
        const d = (s + 1) * numPoints + p;

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
      // Close the loop if the profile is closed
      if (closed) {
        const a = s * numPoints + (numPoints - 1);
        const b = s * numPoints;
        const c = (s + 1) * numPoints;
        const d = (s + 1) * numPoints + (numPoints - 1);

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  }

  // ==========================================================================
  // Modification Operations
  // ==========================================================================

  /**
   * Apply fillet (rounding) to specified edges of a geometry.
   * Identifies edge vertices and inserts smoothed arc segments.
   * @param {THREE.BufferGeometry} geometry - Input geometry
   * @param {number[]} edgeIndices - Indices of edges to fillet
   * @param {number} radius - Fillet radius
   * @returns {THREE.BufferGeometry}
   */
  applyFillet(geometry, edgeIndices, radius) {
    if (!geometry) return new THREE.BufferGeometry();
    if (typeof radius !== 'number' || isNaN(radius) || radius <= 0) return geometry.clone();

    // Extract edge information from the geometry
    const edges = this._extractEdges(geometry);
    const posAttr = geometry.getAttribute('position');
    if (!posAttr || posAttr.count === 0) return geometry.clone();

    const vertices = [];
    for (let i = 0; i < posAttr.count; i++) {
      vertices.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
    }

    const filletSegments = 8;
    const indexAttr = geometry.index;
    const triangles = [];
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        triangles.push([indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2)]);
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        triangles.push([i, i + 1, i + 2]);
      }
    }

    // Build adjacency: for each edge, find the two adjacent face normals
    const edgeMap = new Map();
    for (let triIdx = 0; triIdx < triangles.length; triIdx++) {
      const tri = triangles[triIdx];
      for (let j = 0; j < 3; j++) {
        const a = tri[j];
        const b = tri[(j + 1) % 3];
        const key = Math.min(a, b) + '_' + Math.max(a, b);
        if (!edgeMap.has(key)) edgeMap.set(key, []);
        edgeMap.get(key).push(triIdx);
      }
    }

    // For targeted edges, create fillet geometry
    const targetEdges = (edgeIndices && edgeIndices.length > 0)
      ? edgeIndices.map(i => edges[Math.min(i, edges.length - 1)])
      : edges;

    // Collect fillet surfaces for each sharp edge
    const filletGeometries = [];
    for (const edge of targetEdges) {
      if (!edge) continue;
      const key = Math.min(edge[0], edge[1]) + '_' + Math.max(edge[0], edge[1]);
      const adjacentTris = edgeMap.get(key);
      if (!adjacentTris || adjacentTris.length !== 2) continue;

      // Get normals of the two adjacent faces
      const n1 = this._computeTriangleNormal(triangles[adjacentTris[0]], vertices);
      const n2 = this._computeTriangleNormal(triangles[adjacentTris[1]], vertices);

      // Compute the dihedral angle
      const dotProduct = Math.max(-1, Math.min(1, n1.dot(n2)));
      if (dotProduct > 0.95 || dotProduct < -0.95) continue; // Nearly flat or opposite, skip

      // Edge direction
      const edgeStart = vertices[edge[0]].clone();
      const edgeEnd = vertices[edge[1]].clone();
      const edgeLength = edgeStart.distanceTo(edgeEnd);
      if (edgeLength < 1e-4) continue;

      // Ensure radius does not exceed adjacent edge lengths
      const maxSafeRadius = edgeLength * 0.45;
      const safeRadius = Math.min(radius, maxSafeRadius);
      if (safeRadius < 1e-4) continue;

      // Create fillet arc perpendicular to the edge
      const arcPoints = this._computeFilletArc(edgeStart, edgeEnd, n1, n2, safeRadius, filletSegments);

      // Build a tube-like fillet strip along the edge
      if (arcPoints.length > 0) {
        const filletGeom = this._buildFilletStrip(edgeStart, edgeEnd, arcPoints, filletSegments);
        if (filletGeom) filletGeometries.push(filletGeom);
      }
    }

    // Merge fillet geometry with the original
    if (filletGeometries.length === 0) return geometry.clone();

    const mergedGeometries = [geometry, ...filletGeometries];
    const result = this._mergeGeometries(mergedGeometries);
    for (const fg of filletGeometries) {
      fg.dispose();
    }
    return result;
  }

  /**
   * Apply chamfer (flat bevel) to specified edges.
   * @param {THREE.BufferGeometry} geometry - Input geometry
   * @param {number[]} edgeIndices - Indices of edges to chamfer
   * @param {number} distance - Chamfer distance
   * @returns {THREE.BufferGeometry}
   */
  applyChamfer(geometry, edgeIndices, distance) {
    if (!geometry) return new THREE.BufferGeometry();
    if (typeof distance !== 'number' || isNaN(distance) || distance <= 0) return geometry.clone();

    const edges = this._extractEdges(geometry);
    const posAttr = geometry.getAttribute('position');
    if (!posAttr || posAttr.count === 0) return geometry.clone();

    const vertices = [];
    for (let i = 0; i < posAttr.count; i++) {
      vertices.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
    }

    const indexAttr = geometry.index;
    const triangles = [];
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        triangles.push([indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2)]);
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        triangles.push([i, i + 1, i + 2]);
      }
    }

    // Build edge adjacency
    const edgeMap = new Map();
    for (let triIdx = 0; triIdx < triangles.length; triIdx++) {
      const tri = triangles[triIdx];
      for (let j = 0; j < 3; j++) {
        const a = tri[j];
        const b = tri[(j + 1) % 3];
        const key = Math.min(a, b) + '_' + Math.max(a, b);
        if (!edgeMap.has(key)) edgeMap.set(key, []);
        edgeMap.get(key).push(triIdx);
      }
    }

    const targetEdges = (edgeIndices && edgeIndices.length > 0)
      ? edgeIndices.map(i => edges[Math.min(i, edges.length - 1)])
      : edges;

    const chamferGeometries = [];
    for (const edge of targetEdges) {
      if (!edge) continue;
      const key = Math.min(edge[0], edge[1]) + '_' + Math.max(edge[0], edge[1]);
      const adjacentTris = edgeMap.get(key);
      if (!adjacentTris || adjacentTris.length !== 2) continue;

      const n1 = this._computeTriangleNormal(triangles[adjacentTris[0]], vertices);
      const n2 = this._computeTriangleNormal(triangles[adjacentTris[1]], vertices);

      const dot = Math.max(-1, Math.min(1, n1.dot(n2)));
      if (dot > 0.95 || dot < -0.95) continue;

      const edgeStart = vertices[edge[0]].clone();
      const edgeEnd = vertices[edge[1]].clone();
      const edgeLength = edgeStart.distanceTo(edgeEnd);
      if (edgeLength < 1e-4) continue;

      const maxSafeDist = edgeLength * 0.45;
      const safeDistance = Math.min(distance, maxSafeDist);
      if (safeDistance < 1e-4) continue;

      // Create chamfer (single flat face between the two beveled positions)
      const chamferGeom = this._buildChamferStrip(edgeStart, edgeEnd, n1, n2, safeDistance);
      if (chamferGeom) chamferGeometries.push(chamferGeom);
    }

    if (chamferGeometries.length === 0) return geometry.clone();
    const result = this._mergeGeometries([geometry, ...chamferGeometries]);
    for (const cg of chamferGeometries) {
      cg.dispose();
    }
    return result;
  }

  /**
   * Create a shell by offsetting all faces inward, hollowing the solid.
   * @param {THREE.BufferGeometry} geometry - Input solid geometry
   * @param {number} thickness - Shell wall thickness
   * @param {number[]} excludeFaces - Face indices to leave open
   * @returns {THREE.BufferGeometry}
   */
  applyShell(geometry, thickness, excludeFaces = []) {
    if (!geometry) return new THREE.BufferGeometry();
    if (typeof thickness !== 'number' || isNaN(thickness) || thickness <= 0) return geometry.clone();

    // Guard against self-intersecting inner offset walls by clamping against solid dimensions
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox || new THREE.Box3();
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const minDim = Math.min(size.x, size.y, size.z);
    const maxSafeThickness = minDim > 0 ? minDim * 0.45 : 10;
    const safeThickness = Math.min(thickness, maxSafeThickness);
    if (safeThickness < 1e-4) return geometry.clone();

    geometry.computeVertexNormals();

    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    const indexAttr = geometry.index;

    const vertexCount = posAttr.count;

    // Build outer shell (original geometry)
    const outerPositions = [];
    const outerNormals = [];
    for (let i = 0; i < vertexCount; i++) {
      outerPositions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      outerNormals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
    }

    // Build inner shell (offset inward along vertex normals)
    const innerPositions = [];
    const innerNormals = [];
    for (let i = 0; i < vertexCount; i++) {
      const nx = normAttr.getX(i);
      const ny = normAttr.getY(i);
      const nz = normAttr.getZ(i);
      innerPositions.push(
        posAttr.getX(i) - nx * safeThickness,
        posAttr.getY(i) - ny * safeThickness,
        posAttr.getZ(i) - nz * safeThickness
      );
      // Flip normals for inner shell
      innerNormals.push(-nx, -ny, -nz);
    }

    // Combine positions and normals
    const allPositions = [...outerPositions, ...innerPositions];
    const allNormals = [...outerNormals, ...innerNormals];

    // Build indices
    const allIndices = [];
    const excludeSet = new Set(excludeFaces);

    if (indexAttr) {
      // Outer faces (original winding)
      for (let i = 0; i < indexAttr.count; i += 3) {
        const faceIdx = Math.floor(i / 3);
        if (excludeSet.has(faceIdx)) continue;
        allIndices.push(indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2));
      }

      // Inner faces (reversed winding, offset by vertexCount)
      for (let i = 0; i < indexAttr.count; i += 3) {
        const faceIdx = Math.floor(i / 3);
        if (excludeSet.has(faceIdx)) continue;
        allIndices.push(
          indexAttr.getX(i + 2) + vertexCount,
          indexAttr.getX(i + 1) + vertexCount,
          indexAttr.getX(i) + vertexCount
        );
      }

      // Build edge connectivity for exposed edges (excluded faces)
      if (excludeSet.size > 0) {
        // Connect outer and inner shells at excluded face boundaries
        const boundaryEdges = this._findBoundaryEdges(indexAttr, excludeSet);
        for (const [a, b] of boundaryEdges) {
          const ai = a + vertexCount;
          const bi = b + vertexCount;
          allIndices.push(a, b, bi);
          allIndices.push(a, bi, ai);
        }
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < vertexCount; i += 3) {
        const faceIdx = Math.floor(i / 3);
        if (excludeSet.has(faceIdx)) continue;
        allIndices.push(i, i + 1, i + 2);
      }
      for (let i = 0; i < vertexCount; i += 3) {
        const faceIdx = Math.floor(i / 3);
        if (excludeSet.has(faceIdx)) continue;
        allIndices.push(i + 2 + vertexCount, i + 1 + vertexCount, i + vertexCount);
      }
    }

    const shellGeom = new THREE.BufferGeometry();
    shellGeom.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    shellGeom.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
    shellGeom.setIndex(allIndices);
    shellGeom.computeVertexNormals();
    shellGeom.computeBoundingBox();
    return shellGeom;
  }

  /**
   * Create a hole in geometry.
   * @param {THREE.BufferGeometry} geometry - Target geometry
   * @param {THREE.Vector3} position - Hole center position
   * @param {THREE.Vector3} direction - Hole direction
   * @param {number} diameter - Hole diameter
   * @param {number} depth - Hole depth (0 for through)
   * @param {string} holeType - 'through', 'blind', 'counterbore', 'countersink'
   * @param {Object} options - { cbDiameter, cbDepth, csAngle }
   * @returns {THREE.BufferGeometry}
   */
  createHole(geometry, position, direction, diameter, depth, holeType = 'through', options = {}) {
    const {
      cbDiameter = diameter * 1.8,
      cbDepth = diameter * 0.5,
      csAngle = 82,
      segments = 32,
    } = options;

    const radius = diameter / 2;
    const dir = safeNormalize(direction, new THREE.Vector3(0, 0, 1));

    // Create the hole cylinder tool
    let holeGeometry;

    switch (holeType) {
      case 'through': {
        holeGeometry = new THREE.CylinderGeometry(radius, radius, 1000, segments);
        break;
      }
      case 'blind': {
        const cylinderGeom = new THREE.CylinderGeometry(radius, radius, depth, segments);
        const tipHeight = radius * Math.tan((Math.PI - (118 * Math.PI / 180)) / 2);
        const coneGeom = new THREE.ConeGeometry(radius, tipHeight, segments);
        coneGeom.translate(0, -(depth / 2 + tipHeight / 2), 0);

        holeGeometry = this._mergeGeometries([cylinderGeom, coneGeom]);
        cylinderGeom.dispose();
        coneGeom.dispose();
        break;
      }
      case 'counterbore': {
        const mainCylinder = new THREE.CylinderGeometry(radius, radius, depth || 1000, segments);
        const cbRadius = cbDiameter / 2;
        const cbCylinder = new THREE.CylinderGeometry(cbRadius, cbRadius, cbDepth, segments);
        cbCylinder.translate(0, (depth || 500) / 2 - cbDepth / 2, 0);

        holeGeometry = this._mergeGeometries([mainCylinder, cbCylinder]);
        mainCylinder.dispose();
        cbCylinder.dispose();
        break;
      }
      case 'countersink': {
        const mainCyl = new THREE.CylinderGeometry(radius, radius, depth || 1000, segments);
        const csAngleRad = csAngle * Math.PI / 180;
        const csRadius = radius * 1.6;
        const csHeight = (csRadius - radius) / Math.tan(csAngleRad / 2);
        const csCone = new THREE.CylinderGeometry(radius, csRadius, csHeight, segments);
        csCone.translate(0, (depth || 500) / 2 - csHeight / 2, 0);

        holeGeometry = this._mergeGeometries([mainCyl, csCone]);
        mainCyl.dispose();
        csCone.dispose();
        break;
      }
      default:
        holeGeometry = new THREE.CylinderGeometry(radius, radius, depth || 1000, segments);
    }

    const defaultAxis = new THREE.Vector3(0, 1, 0);
    if (dir.distanceTo(defaultAxis) > EPSILON) {
      const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultAxis, dir);
      holeGeometry.applyQuaternion(quaternion);
    }

    holeGeometry.translate(position.x, position.y, position.z);

    const result = this.booleanSubtract(geometry, holeGeometry);
    holeGeometry.dispose();
    return result;
  }

  /**
   * Create a linear pattern of geometry.
   * @param {THREE.BufferGeometry} geometry - Source geometry
   * @param {THREE.Vector3} direction - Pattern direction
   * @param {number} count - Number of instances (including original)
   * @param {number} spacing - Distance between instances
   * @returns {THREE.BufferGeometry}
   */
  linearPattern(geometry, direction, count, spacing) {
    const dir = safeNormalize(direction, new THREE.Vector3(1, 0, 0));
    const geometries = [geometry];
    const clonesToDispose = [];

    for (let i = 1; i < count; i++) {
      const clone = geometry.clone();
      const offset = dir.clone().multiplyScalar(spacing * i);
      clone.translate(offset.x, offset.y, offset.z);
      geometries.push(clone);
      clonesToDispose.push(clone);
    }

    const result = this._mergeGeometries(geometries);
    for (const c of clonesToDispose) {
      c.dispose();
    }
    return result;
  }

  /**
   * Create a circular pattern of geometry around an axis.
   * @param {THREE.BufferGeometry} geometry - Source geometry
   * @param {THREE.Vector3} axis - Rotation axis (passes through origin)
   * @param {number} count - Number of instances (including original)
   * @param {number} angle - Total angle in radians (default: 2π)
   * @returns {THREE.BufferGeometry}
   */
  circularPattern(geometry, axis, count, angle = Math.PI * 2) {
    const normalizedAxis = safeNormalize(axis, new THREE.Vector3(0, 1, 0));
    const geometries = [geometry];
    const clonesToDispose = [];
    const angleStep = angle / Math.max(1, count);

    for (let i = 1; i < count; i++) {
      const clone = geometry.clone();
      const rotationMatrix = new THREE.Matrix4().makeRotationAxis(normalizedAxis, angleStep * i);
      clone.applyMatrix4(rotationMatrix);
      geometries.push(clone);
      clonesToDispose.push(clone);
    }

    const result = this._mergeGeometries(geometries);
    for (const c of clonesToDispose) {
      c.dispose();
    }
    return result;
  }

  /**
   * Mirror geometry across a plane.
   * @param {THREE.BufferGeometry} geometry - Source geometry
   * @param {string|THREE.Plane} plane - Mirror plane ('XY', 'XZ', 'YZ' or THREE.Plane)
   * @returns {THREE.BufferGeometry}
   */
  mirrorGeometry(geometry, plane) {
    const mirrorMatrix = new THREE.Matrix4();

    if (typeof plane === 'string') {
      switch (plane) {
        case 'YZ':
          mirrorMatrix.makeScale(-1, 1, 1);
          break;
        case 'XZ':
          mirrorMatrix.makeScale(1, -1, 1);
          break;
        case 'XY':
          mirrorMatrix.makeScale(1, 1, -1);
          break;
        default:
          mirrorMatrix.makeScale(-1, 1, 1);
      }
    } else {
      const n = plane.normal;
      mirrorMatrix.set(
        1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, -2 * n.x * plane.constant,
        -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, -2 * n.y * plane.constant,
        -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, -2 * n.z * plane.constant,
        0, 0, 0, 1
      );
    }

    const mirrored = geometry.clone();
    mirrored.applyMatrix4(mirrorMatrix);

    const indexAttr = mirrored.index;
    if (indexAttr) {
      const indices = Array.from(indexAttr.array);
      for (let i = 0; i < indices.length; i += 3) {
        const temp = indices[i + 1];
        indices[i + 1] = indices[i + 2];
        indices[i + 2] = temp;
      }
      mirrored.setIndex(indices);
    } else {
      const posAttr = mirrored.getAttribute('position');
      for (let i = 0; i < posAttr.count; i += 3) {
        const x1 = posAttr.getX(i + 1), y1 = posAttr.getY(i + 1), z1 = posAttr.getZ(i + 1);
        const x2 = posAttr.getX(i + 2), y2 = posAttr.getY(i + 2), z2 = posAttr.getZ(i + 2);
        posAttr.setXYZ(i + 1, x2, y2, z2);
        posAttr.setXYZ(i + 2, x1, y1, z1);
      }
    }

    mirrored.computeVertexNormals();

    const result = this._mergeGeometries([geometry, mirrored]);
    mirrored.dispose();
    return result;
  }

  // ==========================================================================
  // Boolean (CSG) Operations
  // ==========================================================================

  /**
   * Boolean union: A ∪ B
   * @param {THREE.BufferGeometry} geomA
   * @param {THREE.BufferGeometry} geomB
   * @returns {THREE.BufferGeometry}
   */
  booleanUnion(geomA, geomB) {
    if (!geomA) return geomB ? geomB.clone() : null;
    if (!geomB) return geomA ? geomA.clone() : null;

    geomA.computeBoundingBox();
    geomB.computeBoundingBox();
    if (geomA.boundingBox && geomB.boundingBox && !geomA.boundingBox.intersectsBox(geomB.boundingBox)) {
      return this._mergeGeometries([geomA, geomB]);
    }

    const a = new CSGNode(geometryToPolygons(geomA));
    const b = new CSGNode(geometryToPolygons(geomB));

    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();

    a.build(b.allPolygons());
    const result = polygonsToGeometry(a.allPolygons());
    result.computeVertexNormals();
    result.computeBoundingBox();
    return result;
  }

  /**
   * Boolean subtraction: A - B
   * @param {THREE.BufferGeometry} geomA
   * @param {THREE.BufferGeometry} geomB
   * @returns {THREE.BufferGeometry}
   */
  booleanSubtract(geomA, geomB) {
    if (!geomA) return null;
    if (!geomB) return geomA.clone();

    geomA.computeBoundingBox();
    geomB.computeBoundingBox();
    if (geomA.boundingBox && geomB.boundingBox && !geomA.boundingBox.intersectsBox(geomB.boundingBox)) {
      return geomA.clone();
    }

    const a = new CSGNode(geometryToPolygons(geomA));
    const b = new CSGNode(geometryToPolygons(geomB));

    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();

    const result = polygonsToGeometry(a.allPolygons());
    result.computeVertexNormals();
    result.computeBoundingBox();
    return result;
  }

  /**
   * Boolean intersection: A ∩ B
   * @param {THREE.BufferGeometry} geomA
   * @param {THREE.BufferGeometry} geomB
   * @returns {THREE.BufferGeometry}
   */
  booleanIntersect(geomA, geomB) {
    if (!geomA || !geomB) return new THREE.BufferGeometry();

    geomA.computeBoundingBox();
    geomB.computeBoundingBox();
    if (geomA.boundingBox && geomB.boundingBox && !geomA.boundingBox.intersectsBox(geomB.boundingBox)) {
      return new THREE.BufferGeometry();
    }

    const a = new CSGNode(geometryToPolygons(geomA));
    const b = new CSGNode(geometryToPolygons(geomB));

    const aInverted = a.clone();
    aInverted.invert();

    b.clipTo(aInverted);
    b.invert();

    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.allPolygons());
    a.invert();

    const result = polygonsToGeometry(a.allPolygons());
    result.computeVertexNormals();
    result.computeBoundingBox();
    return result;
  }

  // ==========================================================================
  // Mass Properties
  // ==========================================================================

  /**
   * Compute mass properties of a geometry.
   * Uses the divergence theorem to compute volume from surface mesh.
   * @param {THREE.BufferGeometry} geometry
   * @param {Object} material - { density, youngsModulus, ... }
   * @returns {Object} - { volume, surfaceArea, mass, centerOfMass, momentOfInertia }
   */
  computeMassProperties(geometry, material = { density: 7900 }) {
    if (!geometry) return null;
    if (geometry instanceof SolidBody) {
      return geometry.computeMassProperties(material?.density || 7900);
    }
    const posAttr = geometry.getAttribute('position');
    const indexAttr = geometry.index;

    let volume = 0;
    let surfaceArea = 0;
    const centerOfMass = new THREE.Vector3();

    // Moments and products of inertia accumulators
    let Ixx = 0, Iyy = 0, Izz = 0;
    let Ixy = 0, Ixz = 0, Iyz = 0;

    const getVertex = (index) => {
      return new THREE.Vector3(
        posAttr.getX(index),
        posAttr.getY(index),
        posAttr.getZ(index)
      );
    };

    const processTriangle = (v0, v1, v2) => {
      // Surface area
      const ab = new THREE.Vector3().subVectors(v1, v0);
      const ac = new THREE.Vector3().subVectors(v2, v0);
      const cross = new THREE.Vector3().crossVectors(ab, ac);
      const triArea = cross.length() / 2;
      surfaceArea += triArea;

      // Signed volume contribution via divergence theorem
      // V = (1/6) * Σ (v0 · (v1 × v2))
      const signedVol = v0.dot(new THREE.Vector3().crossVectors(v1, v2)) / 6.0;
      volume += signedVol;

      // Center of mass: weighted by tetrahedron volume
      const triCenter = new THREE.Vector3()
        .addVectors(v0, v1).add(v2).multiplyScalar(0.25);
      centerOfMass.add(triCenter.multiplyScalar(signedVol));

      // Moment of inertia contributions (using canonical integrals over tetrahedra)
      // For each triangle forming a tet with origin
      const verts = [v0, v1, v2];
      for (let i = 0; i < 3; i++) {
        const va = verts[i];
        const vb = verts[(i + 1) % 3];
        Ixx += signedVol * (va.y * va.y + va.y * vb.y + vb.y * vb.y +
          va.z * va.z + va.z * vb.z + vb.z * vb.z) / 10;
        Iyy += signedVol * (va.x * va.x + va.x * vb.x + vb.x * vb.x +
          va.z * va.z + va.z * vb.z + vb.z * vb.z) / 10;
        Izz += signedVol * (va.x * va.x + va.x * vb.x + vb.x * vb.x +
          va.y * va.y + va.y * vb.y + vb.y * vb.y) / 10;
        Ixy += signedVol * (va.x * va.y + va.x * vb.y / 2 + vb.x * va.y / 2 + vb.x * vb.y) / 10;
        Ixz += signedVol * (va.x * va.z + va.x * vb.z / 2 + vb.x * va.z / 2 + vb.x * vb.z) / 10;
        Iyz += signedVol * (va.y * va.z + va.y * vb.z / 2 + vb.y * va.z / 2 + vb.y * vb.z) / 10;
      }
    };

    // Iterate over all triangles
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        processTriangle(
          getVertex(indexAttr.getX(i)),
          getVertex(indexAttr.getX(i + 1)),
          getVertex(indexAttr.getX(i + 2))
        );
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        processTriangle(
          getVertex(i), getVertex(i + 1), getVertex(i + 2)
        );
      }
    }

    volume = Math.abs(volume);
    if (!isFinite(volume) || isNaN(volume)) volume = 0;
    if (!isFinite(surfaceArea) || isNaN(surfaceArea)) surfaceArea = 0;

    if (volume > EPSILON) {
      centerOfMass.divideScalar(volume);
    }
    if (!isFinite(centerOfMass.x) || isNaN(centerOfMass.x)) centerOfMass.x = 0;
    if (!isFinite(centerOfMass.y) || isNaN(centerOfMass.y)) centerOfMass.y = 0;
    if (!isFinite(centerOfMass.z) || isNaN(centerOfMass.z)) centerOfMass.z = 0;

    const density = material.density || 7900; // kg/m³
    const mass = volume * density;

    // Convert moment of inertia to actual values with density
    const momentOfInertia = {
      Ixx: isFinite(Ixx) ? Math.abs(Ixx) * density : 0,
      Iyy: isFinite(Iyy) ? Math.abs(Iyy) * density : 0,
      Izz: isFinite(Izz) ? Math.abs(Izz) * density : 0,
      Ixy: isFinite(Ixy) ? Ixy * density : 0,
      Ixz: isFinite(Ixz) ? Ixz * density : 0,
      Iyz: isFinite(Iyz) ? Iyz * density : 0,
    };

    // Bounding box
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox || new THREE.Box3();
    const minX = isFinite(bbox.min.x) ? bbox.min.x : 0;
    const minY = isFinite(bbox.min.y) ? bbox.min.y : 0;
    const minZ = isFinite(bbox.min.z) ? bbox.min.z : 0;
    const maxX = isFinite(bbox.max.x) ? bbox.max.x : 0;
    const maxY = isFinite(bbox.max.y) ? bbox.max.y : 0;
    const maxZ = isFinite(bbox.max.z) ? bbox.max.z : 0;
    const boundingBox = {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      size: {
        x: maxX - minX,
        y: maxY - minY,
        z: maxZ - minZ,
      },
    };

    return {
      volume,
      surfaceArea,
      mass,
      density,
      centerOfMass: { x: centerOfMass.x, y: centerOfMass.y, z: centerOfMass.z },
      momentOfInertia,
      boundingBox,
    };
  }

  // ==========================================================================
  // Sketch to Shape Conversion
  // ==========================================================================

  /**
   * Convert sketch entities (lines, arcs, circles) into a Three.js Shape
   * suitable for extrusion or other profile-based operations.
   * @param {Object[]} entities - Array of sketch entity objects
   * @returns {THREE.Shape}
   */
  /**
   * Expand open line segments into a closed thin-wall profile shape
   */
  createThinProfileShape(entities, wallThickness = 2.0) {
    const nonConstruction = entities.filter(e => !e.construction);
    if (nonConstruction.length === 0) return new THREE.Shape();

    const half = Math.max(0.1, wallThickness / 2);
    const shape = new THREE.Shape();

    const pts = [];
    nonConstruction.forEach(ent => {
      if (ent.p1 && ent.p2) {
        if (pts.length === 0) pts.push(ent.p1);
        pts.push(ent.p2);
      }
    });

    if (pts.length < 2) return new THREE.Shape();

    const leftPts = [];
    const rightPts = [];

    for (let i = 0; i < pts.length; i++) {
      let dx, dy;
      if (i === 0) {
        dx = pts[1].x - pts[0].x;
        dy = pts[1].y - pts[0].y;
      } else if (i === pts.length - 1) {
        dx = pts[i].x - pts[i - 1].x;
        dy = pts[i].y - pts[i - 1].y;
      } else {
        dx = pts[i + 1].x - pts[i - 1].x;
        dy = pts[i + 1].y - pts[i - 1].y;
      }
      const len = Math.hypot(dx, dy) || 1e-6;
      const nx = -dy / len;
      const ny = dx / len;

      leftPts.push({ x: pts[i].x + nx * half, y: pts[i].y + ny * half });
      rightPts.push({ x: pts[i].x - nx * half, y: pts[i].y - ny * half });
    }

    shape.moveTo(leftPts[0].x, leftPts[0].y);
    for (let i = 1; i < leftPts.length; i++) {
      shape.lineTo(leftPts[i].x, leftPts[i].y);
    }
    for (let i = rightPts.length - 1; i >= 0; i--) {
      shape.lineTo(rightPts[i].x, rightPts[i].y);
    }
    shape.closePath();
    return shape;
  }

  shapeFromSketchEntities(entities, options = {}) {
    if (!entities || entities.length === 0) return new THREE.Shape();

    // Check if Thin Feature is requested
    if (options.thin) {
      return this.createThinProfileShape(entities, options.wallThickness || 2.0);
    }

    // Separate circles from other entities
    const circles = entities.filter(e => e.type === 'circle');
    const otherEntities = entities.filter(e => e.type !== 'circle');

    // If only a single circle, return a circle shape
    if (circles.length > 0 && otherEntities.length === 0) {
      const c = circles[0];
      const shape = new THREE.Shape();
      const cx = c.center?.x || c.cx || 0;
      const cy = c.center?.y || c.cy || 0;
      const r = c.radius || c.r || 10;
      shape.absarc(cx, cy, r, 0, Math.PI * 2, false);
      return shape;
    }

    // For other entities, build ordered chains of points
    const chains = this._buildEntityChains(otherEntities);

    if (chains.length === 0) {
      // Fallback: extract all points and create a shape
      const points = this._extractPointsFromEntities(entities);
      if (points.length < 3) return new THREE.Shape();
      const shape = new THREE.Shape();
      shape.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].y);
      }
      shape.closePath();

      // Add circle holes
      for (const c of circles) {
        const hole = new THREE.Path();
        const cx = c.center?.x || c.cx || 0;
        const cy = c.center?.y || c.cy || 0;
        const r = c.radius || c.r || 10;
        hole.absarc(cx, cy, r, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
      return shape;
    }

    // Build shape from the first (outer) chain
    const shape = this._chainToShape(chains[0], entities);

    // Additional chains become holes
    for (let i = 1; i < chains.length; i++) {
      const holePath = this._chainToPath(chains[i], entities);
      if (holePath) shape.holes.push(holePath);
    }

    // Add standalone circles as holes
    for (const c of circles) {
      const hole = new THREE.Path();
      const cx = c.center?.x || c.cx || 0;
      const cy = c.center?.y || c.cy || 0;
      const r = c.radius || c.r || 10;
      hole.absarc(cx, cy, r, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }

    return shape;
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /** Find closest parameter on a path for twist calculation */
  _findClosestParamOnPath(point, path, steps) {
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pathPoint = path.getPointAt(t);
      const dist = point.distanceTo(pathPoint);
      if (dist < bestDist) {
        bestDist = dist;
        bestT = t;
      }
    }
    return bestT;
  }

  /** Resample a set of 2D points to have exactly 'count' points */
  _resamplePoints(points, count) {
    const resampled = [];
    const totalLength = this._polylineLength(points);
    if (totalLength < EPSILON) return points;

    const segmentLength = totalLength / (count - 1);
    let accumulated = 0;
    let pointIdx = 0;

    resampled.push(points[0].clone());

    for (let i = 1; i < count - 1; i++) {
      const targetDist = segmentLength * i;
      while (pointIdx < points.length - 1 && accumulated + points[pointIdx].distanceTo(points[pointIdx + 1]) < targetDist) {
        accumulated += points[pointIdx].distanceTo(points[pointIdx + 1]);
        pointIdx++;
      }
      if (pointIdx >= points.length - 1) {
        resampled.push(points[points.length - 1].clone());
        continue;
      }
      const segLen = points[pointIdx].distanceTo(points[pointIdx + 1]);
      const t = segLen > EPSILON ? (targetDist - accumulated) / segLen : 0;
      resampled.push(new THREE.Vector2(
        points[pointIdx].x + (points[pointIdx + 1].x - points[pointIdx].x) * t,
        points[pointIdx].y + (points[pointIdx + 1].y - points[pointIdx].y) * t
      ));
    }

    resampled.push(points[points.length - 1].clone());
    return resampled;
  }

  /** Compute total length of a polyline */
  _polylineLength(points) {
    let len = 0;
    for (let i = 0; i < points.length - 1; i++) {
      len += points[i].distanceTo(points[i + 1]);
    }
    return len;
  }

  /** Extract edges from geometry as pairs of vertex indices */
  _extractEdges(geometry) {
    const edges = [];
    const edgeSet = new Set();
    const indexAttr = geometry.index;
    const posAttr = geometry.getAttribute('position');

    const addEdge = (a, b) => {
      const key = Math.min(a, b) + '_' + Math.max(a, b);
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([a, b]);
      }
    };

    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        const a = indexAttr.getX(i);
        const b = indexAttr.getX(i + 1);
        const c = indexAttr.getX(i + 2);
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        addEdge(i, i + 1);
        addEdge(i + 1, i + 2);
        addEdge(i + 2, i);
      }
    }

    return edges;
  }

  /** Compute normal of a triangle given vertex indices */
  _computeTriangleNormal(tri, vertices) {
    const a = vertices[tri[0]];
    const b = vertices[tri[1]];
    const c = vertices[tri[2]];
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    return safeNormalize(new THREE.Vector3().crossVectors(ab, ac), new THREE.Vector3(0, 0, 1));
  }

  /** Compute fillet arc points between two face normals */
  _computeFilletArc(edgeStart, edgeEnd, n1, n2, radius, segments) {
    const arcPoints = [];
    const edgeDir = safeNormalize(new THREE.Vector3().subVectors(edgeEnd, edgeStart), new THREE.Vector3(0, 0, 1));

    // Bisector between the two normals
    const bisector = safeNormalize(new THREE.Vector3().addVectors(n1, n2), new THREE.Vector3(0, 1, 0));

    // Angle between normals
    const dot = Math.max(-1, Math.min(1, n1.dot(n2)));
    if (dot > 0.999 || dot < -0.999) {
      return [];
    }
    const angle = Math.acos(dot);
    const sinHalf = Math.sin(angle / 2);
    if (sinHalf < 1e-4) {
      return [];
    }

    // Center of the fillet arc (offset from edge along bisector)
    const offsetDist = radius / sinHalf;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const theta = -angle / 2 + angle * t;

      // Rotate bisector around edge direction by theta
      const rotated = bisector.clone();
      const rotMatrix = new THREE.Matrix4().makeRotationAxis(edgeDir, theta);
      rotated.applyMatrix4(rotMatrix);

      arcPoints.push(rotated.multiplyScalar(radius));
    }

    return arcPoints;
  }

  /** Build a fillet strip geometry along an edge */
  _buildFilletStrip(edgeStart, edgeEnd, arcPoints, segments) {
    if (!arcPoints || arcPoints.length === 0) return new THREE.BufferGeometry();
    const positions = [];
    const edgeDir = safeNormalize(new THREE.Vector3().subVectors(edgeEnd, edgeStart), new THREE.Vector3(0, 0, 1));
    const edgeLength = edgeStart.distanceTo(edgeEnd);

    // Sample points along the edge
    const edgeSteps = Math.max(2, Math.ceil(edgeLength / 5));
    for (let e = 0; e <= edgeSteps; e++) {
      const t = e / edgeSteps;
      const basePoint = new THREE.Vector3().lerpVectors(edgeStart, edgeEnd, t);

      for (const arcOffset of arcPoints) {
        const p = basePoint.clone().add(arcOffset);
        positions.push(p.x, p.y, p.z);
      }
    }

    // Build indices
    const indices = [];
    const arcCount = arcPoints.length;
    for (let e = 0; e < edgeSteps; e++) {
      for (let a = 0; a < arcCount - 1; a++) {
        const i0 = e * arcCount + a;
        const i1 = e * arcCount + a + 1;
        const i2 = (e + 1) * arcCount + a;
        const i3 = (e + 1) * arcCount + a + 1;

        indices.push(i0, i1, i2);
        indices.push(i1, i3, i2);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  /** Build a chamfer strip (single flat face) along an edge */
  _buildChamferStrip(edgeStart, edgeEnd, n1, n2, distance) {
    const positions = [];
    const edgeDir = safeNormalize(new THREE.Vector3().subVectors(edgeEnd, edgeStart), new THREE.Vector3(0, 0, 1));
    const edgeLength = edgeStart.distanceTo(edgeEnd);
    const edgeSteps = Math.max(2, Math.ceil(edgeLength / 5));

    for (let e = 0; e <= edgeSteps; e++) {
      const t = e / edgeSteps;
      const basePoint = new THREE.Vector3().lerpVectors(edgeStart, edgeEnd, t);

      // Two points: offset along n1 and n2 by chamfer distance
      const p1 = basePoint.clone().add(n1.clone().multiplyScalar(distance));
      const p2 = basePoint.clone().add(n2.clone().multiplyScalar(distance));
      positions.push(p1.x, p1.y, p1.z);
      positions.push(p2.x, p2.y, p2.z);
    }

    const indices = [];
    for (let e = 0; e < edgeSteps; e++) {
      const i0 = e * 2;
      const i1 = e * 2 + 1;
      const i2 = (e + 1) * 2;
      const i3 = (e + 1) * 2 + 1;
      indices.push(i0, i1, i2);
      indices.push(i1, i3, i2);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  /** Find boundary edges where excluded faces meet non-excluded faces */
  _findBoundaryEdges(indexAttr, excludeSet) {
    const edgeCount = new Map();
    const edges = [];

    for (let i = 0; i < indexAttr.count; i += 3) {
      const faceIdx = Math.floor(i / 3);
      const isExcluded = excludeSet.has(faceIdx);

      for (let j = 0; j < 3; j++) {
        const a = indexAttr.getX(i + j);
        const b = indexAttr.getX(i + (j + 1) % 3);
        const key = Math.min(a, b) + '_' + Math.max(a, b);
        if (!edgeCount.has(key)) {
          edgeCount.set(key, { excluded: 0, included: 0, edge: [a, b] });
        }
        const ec = edgeCount.get(key);
        if (isExcluded) ec.excluded++;
        else ec.included++;
      }
    }

    for (const [key, info] of edgeCount) {
      if (info.excluded > 0 && info.included > 0) {
        edges.push(info.edge);
      }
    }

    return edges;
  }

  /** Merge multiple geometries into one */
  _mergeGeometries(geometries) {
    if (geometries.length === 0) return new THREE.BufferGeometry();
    if (geometries.length === 1) return geometries[0].clone();

    const positions = [];
    const normals = [];
    const indices = [];
    let vertexOffset = 0;

    for (const geom of geometries) {
      if (!geom) continue;
      // Ensure the geometry is non-indexed or handle both
      const isIndexed = !!geom.index;
      const nonIndexed = isIndexed ? geom.toNonIndexed() : geom;
      nonIndexed.computeVertexNormals();

      const posAttr = nonIndexed.getAttribute('position');
      const normAttr = nonIndexed.getAttribute('normal');

      if (posAttr) {
        for (let i = 0; i < posAttr.count; i++) {
          positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
          if (normAttr) {
            normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
          }
        }
        vertexOffset += posAttr.count;
      }

      if (isIndexed && nonIndexed !== geom && typeof nonIndexed.dispose === 'function') {
        nonIndexed.dispose();
      }
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    return merged;
  }

  /** Build chains of connected entities for shape creation */
  _buildEntityChains(entities) {
    if (entities.length === 0) return [];

    const chains = [];
    const used = new Set();

    // Build adjacency from entity endpoints
    const getEndpoints = (entity) => {
      switch (entity.type) {
        case 'line':
          return [
            { x: entity.p1?.x ?? entity.start?.x ?? entity.x1 ?? 0, y: entity.p1?.y ?? entity.start?.y ?? entity.y1 ?? 0 },
            { x: entity.p2?.x ?? entity.end?.x ?? entity.x2 ?? 0, y: entity.p2?.y ?? entity.end?.y ?? entity.y2 ?? 0 },
          ];
        case 'arc':
          return [
            this._arcEndpoint(entity, 'start'),
            this._arcEndpoint(entity, 'end'),
          ];
        case 'rect':
          // Rectangle has 4 corners: treat as 4 lines
          return [
            { x: entity.x1 ?? entity.corner1?.x ?? 0, y: entity.y1 ?? entity.corner1?.y ?? 0 },
            { x: entity.x2 ?? entity.corner2?.x ?? 0, y: entity.y2 ?? entity.corner2?.y ?? 0 },
          ];
        case 'spline':
          if (entity.controlPoints && entity.controlPoints.length > 0) {
            return [entity.controlPoints[0], entity.controlPoints[entity.controlPoints.length - 1]];
          }
          return [];
        default:
          return [];
      }
    };

    // Greedily build chains
    const tolerance = 0.01;
    const pointsMatch = (a, b) =>
      Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance;

    while (used.size < entities.length) {
      // Find first unused entity
      let startIdx = -1;
      for (let i = 0; i < entities.length; i++) {
        if (!used.has(i) && entities[i].type !== 'point') {
          startIdx = i;
          break;
        }
      }
      if (startIdx === -1) break;

      const chain = [startIdx];
      used.add(startIdx);

      let endpoints = getEndpoints(entities[startIdx]);
      if (endpoints.length < 2) continue;

      let currentEnd = endpoints[1];
      let changed = true;

      // Extend chain forward
      while (changed) {
        changed = false;
        for (let i = 0; i < entities.length; i++) {
          if (used.has(i) || entities[i].type === 'point') continue;
          const eps = getEndpoints(entities[i]);
          if (eps.length < 2) continue;

          if (pointsMatch(currentEnd, eps[0])) {
            chain.push(i);
            used.add(i);
            currentEnd = eps[1];
            changed = true;
            break;
          } else if (pointsMatch(currentEnd, eps[1])) {
            chain.push(i);
            used.add(i);
            currentEnd = eps[0];
            changed = true;
            break;
          }
        }
      }

      chains.push(chain.map(i => entities[i]));
    }

    return chains;
  }

  /** Convert a chain of entities to a THREE.Shape */
  _chainToShape(chain, allEntities) {
    const shape = new THREE.Shape();
    const points = this._extractPointsFromEntities(chain);

    if (points.length < 2) return shape;

    shape.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < chain.length; i++) {
      const entity = chain[i];
      switch (entity.type) {
        case 'line':
          shape.lineTo(
            entity.p2?.x ?? entity.end?.x ?? entity.x2 ?? 0,
            entity.p2?.y ?? entity.end?.y ?? entity.y2 ?? 0
          );
          break;
        case 'arc': {
          const cx = entity.center?.x ?? entity.cx ?? 0;
          const cy = entity.center?.y ?? entity.cy ?? 0;
          const r = entity.radius ?? entity.r ?? 10;
          const startAngle = entity.startAngle ?? 0;
          const endAngle = entity.endAngle ?? Math.PI * 2;
          shape.absarc(cx, cy, r, startAngle, endAngle, false);
          break;
        }
        case 'rect': {
          const x1 = entity.x1 ?? entity.corner1?.x ?? 0;
          const y1 = entity.y1 ?? entity.corner1?.y ?? 0;
          const x2 = entity.x2 ?? entity.corner2?.x ?? 0;
          const y2 = entity.y2 ?? entity.corner2?.y ?? 0;
          shape.lineTo(x2, y1);
          shape.lineTo(x2, y2);
          shape.lineTo(x1, y2);
          shape.lineTo(x1, y1);
          break;
        }
        case 'spline': {
          if (entity.controlPoints && entity.controlPoints.length > 0) {
            const splinePoints = entity.controlPoints.map(p =>
              new THREE.Vector2(p.x, p.y)
            );
            shape.splineThru(splinePoints.slice(1));
          }
          break;
        }
        case 'ellipse': {
          const cx = entity.center?.x ?? entity.cx ?? 0;
          const cy = entity.center?.y ?? entity.cy ?? 0;
          const rx = entity.radiusX ?? entity.rx ?? 10;
          const ry = entity.radiusY ?? entity.ry ?? 5;
          shape.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0);
          break;
        }
        default: {
          // Generic: use extracted points
          const ep = this._extractPointsFromEntity(entity);
          for (const p of ep) {
            shape.lineTo(p.x, p.y);
          }
        }
      }
    }

    shape.closePath();
    return shape;
  }

  /** Convert a chain of entities to a THREE.Path (for holes) */
  _chainToPath(chain, allEntities) {
    const path = new THREE.Path();
    const points = this._extractPointsFromEntities(chain);
    if (points.length < 2) return null;

    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      path.lineTo(points[i].x, points[i].y);
    }
    path.closePath();
    return path;
  }

  /** Extract all endpoints from a list of entities */
  _extractPointsFromEntities(entities) {
    const points = [];
    const tolerance = 0.01;

    for (const entity of entities) {
      const eps = this._extractPointsFromEntity(entity);
      for (const p of eps) {
        // Only add if not duplicate of last point
        if (points.length === 0 ||
          Math.abs(p.x - points[points.length - 1].x) > tolerance ||
          Math.abs(p.y - points[points.length - 1].y) > tolerance) {
          points.push(p);
        }
      }
    }

    return points;
  }

  /** Extract points from a single entity */
  _extractPointsFromEntity(entity) {
    switch (entity.type) {
      case 'line':
        return [
          { x: entity.p1?.x ?? entity.start?.x ?? entity.x1 ?? 0, y: entity.p1?.y ?? entity.start?.y ?? entity.y1 ?? 0 },
          { x: entity.p2?.x ?? entity.end?.x ?? entity.x2 ?? 0, y: entity.p2?.y ?? entity.end?.y ?? entity.y2 ?? 0 },
        ];
      case 'arc': {
        const cx = entity.center?.x ?? entity.cx ?? 0;
        const cy = entity.center?.y ?? entity.cy ?? 0;
        const r = entity.radius ?? entity.r ?? 10;
        const sa = entity.startAngle ?? 0;
        const ea = entity.endAngle ?? Math.PI * 2;
        const points = [];
        const steps = 32;
        for (let i = 0; i <= steps; i++) {
          const angle = sa + (ea - sa) * (i / steps);
          points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
        }
        return points;
      }
      case 'circle': {
        const cx = entity.center?.x ?? entity.cx ?? 0;
        const cy = entity.center?.y ?? entity.cy ?? 0;
        const r = entity.radius ?? entity.r ?? 10;
        const points = [];
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const angle = (Math.PI * 2 * i) / steps;
          points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
        }
        return points;
      }
      case 'rect': {
        const x1 = entity.x1 ?? entity.corner1?.x ?? 0;
        const y1 = entity.y1 ?? entity.corner1?.y ?? 0;
        const x2 = entity.x2 ?? entity.corner2?.x ?? 0;
        const y2 = entity.y2 ?? entity.corner2?.y ?? 0;
        return [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 },
        ];
      }
      case 'spline': {
        if (entity.controlPoints) {
          return entity.controlPoints.map(p => ({ x: p.x, y: p.y }));
        }
        return [];
      }
      case 'ellipse': {
        const cx = entity.center?.x ?? entity.cx ?? 0;
        const cy = entity.center?.y ?? entity.cy ?? 0;
        const rx = entity.radiusX ?? entity.rx ?? 10;
        const ry = entity.radiusY ?? entity.ry ?? 5;
        const points = [];
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const angle = (Math.PI * 2 * i) / steps;
          points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
        }
        return points;
      }
      default:
        return [];
    }
  }

  /** Get endpoint of an arc */
  _arcEndpoint(arc, which) {
    const cx = arc.center?.x ?? arc.cx ?? 0;
    const cy = arc.center?.y ?? arc.cy ?? 0;
    const r = arc.radius ?? arc.r ?? 10;
    const angle = which === 'start'
      ? (arc.startAngle ?? 0)
      : (arc.endAngle ?? Math.PI * 2);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  // ==========================================================================
  // B-Rep Topology and Modeling Operations
  // ==========================================================================

  /**
   * Convert a B-Rep SolidBody to Three.js BufferGeometry
   */
  solidToBufferGeometry(solidBody, options = {}) {
    return solidToBufferGeometry(solidBody, options);
  }

  /**
   * Convert a Three.js BufferGeometry to a topological B-Rep SolidBody
   */
  bufferGeometryToSolid(geometry, options = {}) {
    return bufferGeometryToSolid(geometry, options);
  }

  /**
   * Create a rectangular B-Rep SolidBody box
   */
  createBRepBox(dx = 20, dy = 20, dz = 20, center = new THREE.Vector3(0, 0, 0)) {
    return createSolidBox(dx, dy, dz, center);
  }

  /**
   * Create a cylindrical B-Rep SolidBody
   */
  createBRepCylinder(radius = 10, height = 30, segments = 32, center = new THREE.Vector3(0, 0, 0)) {
    return createSolidCylinder(radius, height, segments, center);
  }

  /**
   * Extrude a 2D profile / shape into a closed topological B-Rep SolidBody
   */
  extrudeBRep(pointsOrShape, depth = 20, direction = new THREE.Vector3(0, 0, 1), options = {}) {
    return extrudeSolid(pointsOrShape, depth, direction, options);
  }

  /**
   * Revolve a 2D profile / shape into a B-Rep SolidBody (full 360 or partial)
   */
  revolveBRep(pointsOrShape, axis = new THREE.Vector3(0, 1, 0), angle = Math.PI * 2, options = {}) {
    return revolveSolid(pointsOrShape, axis, angle, options);
  }

  /**
   * Sweep a 2D profile along a 3D path into a B-Rep SolidBody
   */
  sweepBRep(profileOrShape, pathOrPoints, options = {}) {
    return sweepSolid(profileOrShape, pathOrPoints, options);
  }

  /**
   * Loft multiple 2D/3D profile cross-sections into a B-Rep SolidBody
   */
  loftBRep(profilesOrShapes, options = {}) {
    return loftSolid(profilesOrShapes, options);
  }

  /**
   * Fillet B-Rep solid edges
   */
  filletBRep(solidBody, targetEdgeIndices = [], radius = 2, options = {}) {
    return filletSolid(solidBody, targetEdgeIndices, radius, options);
  }

  /**
   * Chamfer B-Rep solid edges
   */
  chamferBRep(solidBody, targetEdgeIndices = [], distance = 2, options = {}) {
    return chamferSolid(solidBody, targetEdgeIndices, distance, options);
  }

  /**
   * Shell B-Rep solid with uniform wall thickness
   */
  shellBRep(solidBody, thickness = 2, excludeFaceIds = [], options = {}) {
    return shellSolid(solidBody, thickness, excludeFaceIds, options);
  }

  /**
   * B-Rep Boolean Union
   */
  booleanUnionBRep(solidA, solidB) {
    return brepBooleanUnion(solidA, solidB);
  }

  /**
   * B-Rep Boolean Difference
   */
  booleanSubtractBRep(solidA, solidB) {
    return brepBooleanSubtract(solidA, solidB);
  }

  /**
   * B-Rep Boolean Intersection
   */
  booleanIntersectBRep(solidA, solidB) {
    return brepBooleanIntersect(solidA, solidB);
  }

  /**
   * Extract B-Rep feature edges
   */
  extractBRepEdges(solidOrGeom, featureAngleDeg = 25) {
    const solid = solidOrGeom instanceof SolidBody ? solidOrGeom : bufferGeometryToSolid(solidOrGeom);
    return extractBRepEdges(solid, featureAngleDeg);
  }
}

// Re-export Topology and B-Rep classes and functions
export {
  Vertex,
  Edge,
  CoEdge,
  Loop,
  Face,
  Shell,
  SolidBody,
  Curve,
  LineCurve,
  ArcCurve,
  NurbsCurve,
  Surface,
  PlaneSurface,
  CylinderSurface,
  ConeSurface,
  TorusSurface,
  SphereSurface,
  CURVE_TYPES,
  SURFACE_TYPES,
} from './Topology.js';

export {
  createSolidBox,
  createSolidCylinder,
  extrudeSolid,
  revolveSolid,
  sweepSolid,
  loftSolid,
  filletSolid,
  chamferSolid,
  shellSolid,
  solidToBufferGeometry,
  bufferGeometryToSolid,
  extractBRepEdges,
} from './BRep.js';

// Export singleton instance
export const geometryEngine = new GeometryEngine();
export default GeometryEngine;
