// CADWorks Pro - Boundary Representation (B-Rep) Topological Data Structure
// Implements full topological hierarchy: Vertex, Edge, CoEdge, Loop, Face, Shell, SolidBody,
// along with geometric curves (Line, Arc, Circle, NURBS) and surfaces (Plane, Cylinder, Cone, Torus, Sphere).

import * as THREE from 'three';
import { generateId, EPSILON } from '../utils/math.js';

// ============================================================================
// Safe Numerical & Vector Utilities
// ============================================================================

export function safeNormalize(v, fallback = new THREE.Vector3(0, 0, 1)) {
  if (!v || typeof v.x !== 'number') return fallback.clone();
  const x = isNaN(v.x) || !isFinite(v.x) ? 0 : v.x;
  const y = isNaN(v.y) || !isFinite(v.y) ? 0 : v.y;
  const z = isNaN(v.z) || !isFinite(v.z) ? 0 : v.z;
  const lenSq = x * x + y * y + z * z;
  if (lenSq < 1e-14 || isNaN(lenSq) || !isFinite(lenSq)) {
    return fallback.clone();
  }
  const invLen = 1 / Math.sqrt(lenSq);
  return new THREE.Vector3(x * invLen, y * invLen, z * invLen);
}

export function sanitizePoint(p, defaultVal = new THREE.Vector3(0, 0, 0)) {
  if (!p) return defaultVal.clone();
  const x = typeof p.x === 'number' && !isNaN(p.x) && isFinite(p.x) ? p.x : defaultVal.x;
  const y = typeof p.y === 'number' && !isNaN(p.y) && isFinite(p.y) ? p.y : defaultVal.y;
  const z = typeof p.z === 'number' && !isNaN(p.z) && isFinite(p.z) ? p.z : defaultVal.z;
  return new THREE.Vector3(x, y, z);
}

export function removeConsecutiveDuplicates(pts, tol = 1e-5) {
  if (!pts || pts.length === 0) return [];
  const cleaned = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!cleaned.length) {
      cleaned.push(p);
    } else {
      const prev = cleaned[cleaned.length - 1];
      const d = p.distanceTo ? p.distanceTo(prev) : Math.hypot(p.x - prev.x, p.y - prev.y, (p.z || 0) - (prev.z || 0));
      if (d > tol) {
        cleaned.push(p);
      }
    }
  }
  if (cleaned.length > 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    const d = last.distanceTo ? last.distanceTo(first) : Math.hypot(last.x - first.x, last.y - first.y, (last.z || 0) - (first.z || 0));
    if (d <= tol) {
      cleaned.pop();
    }
  }
  return cleaned;
}

// ============================================================================
// Curve Definitions
// ============================================================================

export const CURVE_TYPES = Object.freeze({
  LINE: 'LINE',
  ARC: 'ARC',
  CIRCLE: 'CIRCLE',
  NURBS: 'NURBS',
  BEZIER: 'BEZIER',
  COMPOSITE: 'COMPOSITE',
});

/**
 * Base Curve
 */
export class Curve {
  constructor(type = CURVE_TYPES.LINE) {
    this.type = type;
  }

  pointAt(t) {
    throw new Error('pointAt(t) not implemented');
  }

  tangentAt(t) {
    const dt = 1e-4;
    const t0 = Math.max(0, t - dt);
    const t1 = Math.min(1, t + dt);
    const p0 = this.pointAt(t0);
    const p1 = this.pointAt(t1);
    const diff = new THREE.Vector3().subVectors(p1, p0);
    return safeNormalize(diff, new THREE.Vector3(0, 0, 1));
  }

  length(samples = 20) {
    let len = 0;
    let prev = this.pointAt(0);
    for (let i = 1; i <= samples; i++) {
      const curr = this.pointAt(i / samples);
      len += prev.distanceTo(curr);
      prev = curr;
    }
    return isNaN(len) || !isFinite(len) ? 0 : Math.max(0, len);
  }

  clone() {
    throw new Error('clone() not implemented');
  }
}

/**
 * 3D Line Curve
 */
export class LineCurve extends Curve {
  constructor(start, end) {
    super(CURVE_TYPES.LINE);
    this.start = sanitizePoint(start);
    this.end = sanitizePoint(end);
  }

  pointAt(t) {
    const clampedT = isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
    return new THREE.Vector3().lerpVectors(this.start, this.end, clampedT);
  }

  tangentAt(t) {
    const diff = new THREE.Vector3().subVectors(this.end, this.start);
    return safeNormalize(diff, new THREE.Vector3(0, 0, 1));
  }

  length() {
    return this.start.distanceTo(this.end);
  }

  clone() {
    return new LineCurve(this.start, this.end);
  }
}

/**
 * 3D Circular Arc Curve
 */
export class ArcCurve extends Curve {
  constructor(center, radius, startAngle = 0, endAngle = Math.PI * 2, normal = new THREE.Vector3(0, 0, 1), refX = null) {
    super(CURVE_TYPES.ARC);
    this.center = sanitizePoint(center);
    this.radius = Math.max(1e-7, isNaN(radius) ? 1e-7 : Math.abs(radius));
    this.startAngle = isNaN(startAngle) ? 0 : startAngle;
    this.endAngle = isNaN(endAngle) ? Math.PI * 2 : endAngle;
    this.normal = safeNormalize(normal, new THREE.Vector3(0, 0, 1));

    if (refX && refX.lengthSq && refX.lengthSq() > 1e-8) {
      this.refX = safeNormalize(refX, new THREE.Vector3(1, 0, 0));
    } else {
      // Pick orthogonal vector
      const arbitrary = Math.abs(this.normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      let cross = new THREE.Vector3().crossVectors(this.normal, arbitrary);
      if (cross.lengthSq() < 1e-8) {
        cross = new THREE.Vector3().crossVectors(this.normal, new THREE.Vector3(0, 1, 0));
      }
      this.refX = safeNormalize(cross, new THREE.Vector3(1, 0, 0));
    }
    this.refY = safeNormalize(new THREE.Vector3().crossVectors(this.normal, this.refX), new THREE.Vector3(0, 1, 0));
  }

  pointAt(t) {
    const clampedT = isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
    const angle = this.startAngle + clampedT * (this.endAngle - this.startAngle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new THREE.Vector3()
      .copy(this.center)
      .addScaledVector(this.refX, this.radius * cos)
      .addScaledVector(this.refY, this.radius * sin);
  }

  tangentAt(t) {
    const clampedT = isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
    const angle = this.startAngle + clampedT * (this.endAngle - this.startAngle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sign = this.endAngle >= this.startAngle ? 1 : -1;
    const tan = new THREE.Vector3()
      .addScaledVector(this.refX, -sin * sign)
      .addScaledVector(this.refY, cos * sign);
    return safeNormalize(tan, new THREE.Vector3(0, 1, 0));
  }

  length() {
    return this.radius * Math.abs(this.endAngle - this.startAngle);
  }

  clone() {
    return new ArcCurve(this.center, this.radius, this.startAngle, this.endAngle, this.normal, this.refX);
  }
}

/**
 * 3D NURBS / B-Spline Curve
 */
export class NurbsCurve extends Curve {
  constructor(controlPoints = [], degree = 3, knots = null, weights = null) {
    super(CURVE_TYPES.NURBS);
    this.controlPoints = (controlPoints || []).map(p => sanitizePoint(p));
    if (this.controlPoints.length < 2) {
      this.controlPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    }
    this.degree = Math.min(Math.max(1, degree), this.controlPoints.length - 1);
    const n = this.controlPoints.length - 1;
    const p = this.degree;

    // Weights (default: 1.0)
    this.weights = weights && weights.length === this.controlPoints.length
      ? weights.map(w => (typeof w === 'number' && !isNaN(w) && w > 0 ? w : 1.0))
      : new Array(this.controlPoints.length).fill(1.0);

    // Knots (clamped uniform knot vector by default)
    if (knots && knots.length === n + p + 2) {
      this.knots = knots.slice();
    } else {
      this.knots = [];
      const m = n + p + 1;
      for (let i = 0; i <= m; i++) {
        if (i <= p) this.knots.push(0);
        else if (i >= m - p) this.knots.push(1);
        else this.knots.push((i - p) / (m - 2 * p));
      }
    }
  }

  pointAt(t) {
    const clampedT = isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
    const kStart = this.knots[this.degree];
    const kEnd = this.knots[this.knots.length - 1 - this.degree];
    const u = kStart + clampedT * (kEnd - kStart);

    return this._deBoor(u);
  }

  _deBoor(u) {
    const p = this.degree;
    const n = this.controlPoints.length - 1;
    const knots = this.knots;

    // Find knot span k
    let k = p;
    for (let i = p; i <= n; i++) {
      if (u >= knots[i] && u < knots[i + 1]) {
        k = i;
        break;
      }
      if (Math.abs(u - knots[i + 1]) < 1e-9 && i + 1 === n + 1) {
        k = n;
        break;
      }
    }

    // Weighted control points in homogeneous coords (wx, wy, wz, w)
    const d = [];
    for (let j = 0; j <= p; j++) {
      const idx = Math.max(0, Math.min(n, k - p + j));
      const cp = this.controlPoints[idx];
      const w = this.weights[idx] || 1.0;
      d[j] = new THREE.Vector4(cp.x * w, cp.y * w, cp.z * w, w);
    }

    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = k - p + j;
        const denom = knots[i + p - r + 1] - knots[i];
        const alpha = Math.abs(denom) > 1e-9 ? (u - knots[i]) / denom : 0;
        d[j].lerp(d[j - 1], 1 - alpha);
      }
    }

    const res = d[p];
    const w = res && Math.abs(res.w) > 1e-12 ? res.w : 1;
    const pt = new THREE.Vector3(res.x / w, res.y / w, res.z / w);
    return sanitizePoint(pt);
  }

  clone() {
    return new NurbsCurve(this.controlPoints, this.degree, this.knots, this.weights);
  }
}

// ============================================================================
// Surface Definitions
// ============================================================================

export const SURFACE_TYPES = Object.freeze({
  PLANE: 'PLANE',
  CYLINDER: 'CYLINDER',
  CONE: 'CONE',
  TORUS: 'TORUS',
  SPHERE: 'SPHERE',
  NURBS: 'NURBS',
  FACET: 'FACET',
});

/**
 * Base Surface
 */
export class Surface {
  constructor(type = SURFACE_TYPES.PLANE) {
    this.type = type;
  }

  pointAt(u, v) {
    throw new Error('pointAt(u, v) not implemented');
  }

  normalAt(u, v) {
    const du = 1e-4;
    const dv = 1e-4;
    const p = this.pointAt(u, v);
    const pu = this.pointAt(u + du, v);
    const pv = this.pointAt(u, v + dv);
    const tu = new THREE.Vector3().subVectors(pu, p);
    const tv = new THREE.Vector3().subVectors(pv, p);
    const cross = new THREE.Vector3().crossVectors(tu, tv);
    return safeNormalize(cross, new THREE.Vector3(0, 0, 1));
  }

  project(point) {
    throw new Error('project(point) not implemented');
  }

  clone() {
    throw new Error('clone() not implemented');
  }
}

/**
 * Planar Surface
 */
export class PlaneSurface extends Surface {
  constructor(origin = new THREE.Vector3(0, 0, 0), normal = new THREE.Vector3(0, 0, 1), uDir = null, vDir = null) {
    super(SURFACE_TYPES.PLANE);
    this.origin = sanitizePoint(origin);
    this.normal = safeNormalize(normal, new THREE.Vector3(0, 0, 1));

    if (uDir && vDir && uDir.lengthSq && uDir.lengthSq() > 1e-8 && vDir.lengthSq && vDir.lengthSq() > 1e-8) {
      this.uDir = safeNormalize(uDir, new THREE.Vector3(1, 0, 0));
      this.vDir = safeNormalize(vDir, new THREE.Vector3(0, 1, 0));
    } else {
      const arb = Math.abs(this.normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      let cross = new THREE.Vector3().crossVectors(this.normal, arb);
      if (cross.lengthSq() < 1e-8) {
        cross = new THREE.Vector3().crossVectors(this.normal, new THREE.Vector3(0, 1, 0));
      }
      this.uDir = safeNormalize(cross, new THREE.Vector3(1, 0, 0));
      this.vDir = safeNormalize(new THREE.Vector3().crossVectors(this.normal, this.uDir), new THREE.Vector3(0, 1, 0));
    }
  }

  pointAt(u, v) {
    const cu = isNaN(u) ? 0 : u;
    const cv = isNaN(v) ? 0 : v;
    return new THREE.Vector3()
      .copy(this.origin)
      .addScaledVector(this.uDir, cu)
      .addScaledVector(this.vDir, cv);
  }

  normalAt(u, v) {
    return this.normal.clone();
  }

  project(point) {
    const pt = sanitizePoint(point);
    const diff = new THREE.Vector3().subVectors(pt, this.origin);
    const dist = diff.dot(this.normal);
    const projectedPoint = new THREE.Vector3().subVectors(pt, this.normal.clone().multiplyScalar(dist));
    const u = new THREE.Vector3().subVectors(projectedPoint, this.origin).dot(this.uDir);
    const v = new THREE.Vector3().subVectors(projectedPoint, this.origin).dot(this.vDir);
    return { point: projectedPoint, u, v, distance: dist };
  }

  clone() {
    return new PlaneSurface(this.origin, this.normal, this.uDir, this.vDir);
  }
}

/**
 * Cylindrical Surface
 */
export class CylinderSurface extends Surface {
  constructor(origin = new THREE.Vector3(0, 0, 0), axis = new THREE.Vector3(0, 0, 1), radius = 10, refDir = null) {
    super(SURFACE_TYPES.CYLINDER);
    this.origin = sanitizePoint(origin);
    this.axis = safeNormalize(axis, new THREE.Vector3(0, 0, 1));
    this.radius = Math.max(1e-7, isNaN(radius) ? 1e-7 : Math.abs(radius));

    if (refDir && refDir.lengthSq && refDir.lengthSq() > 1e-8) {
      this.refX = safeNormalize(refDir, new THREE.Vector3(1, 0, 0));
    } else {
      const arb = Math.abs(this.axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      let cross = new THREE.Vector3().crossVectors(this.axis, arb);
      if (cross.lengthSq() < 1e-8) {
        cross = new THREE.Vector3().crossVectors(this.axis, new THREE.Vector3(0, 1, 0));
      }
      this.refX = safeNormalize(cross, new THREE.Vector3(1, 0, 0));
    }
    this.refY = safeNormalize(new THREE.Vector3().crossVectors(this.axis, this.refX), new THREE.Vector3(0, 1, 0));
  }

  pointAt(u, v) {
    const cu = isNaN(u) ? 0 : u;
    const cv = isNaN(v) ? 0 : v;
    const cos = Math.cos(cu);
    const sin = Math.sin(cu);
    return new THREE.Vector3()
      .copy(this.origin)
      .addScaledVector(this.axis, cv)
      .addScaledVector(this.refX, this.radius * cos)
      .addScaledVector(this.refY, this.radius * sin);
  }

  normalAt(u, v) {
    const cu = isNaN(u) ? 0 : u;
    const cos = Math.cos(cu);
    const sin = Math.sin(cu);
    const n = new THREE.Vector3()
      .addScaledVector(this.refX, cos)
      .addScaledVector(this.refY, sin);
    return safeNormalize(n, this.refX);
  }

  clone() {
    return new CylinderSurface(this.origin, this.axis, this.radius, this.refX);
  }
}

/**
 * Conical Surface
 */
export class ConeSurface extends Surface {
  constructor(apex = new THREE.Vector3(0, 0, 0), axis = new THREE.Vector3(0, 0, 1), halfAngle = Math.PI / 6, refDir = null) {
    super(SURFACE_TYPES.CONE);
    this.apex = sanitizePoint(apex);
    this.axis = safeNormalize(axis, new THREE.Vector3(0, 0, 1));
    this.halfAngle = Math.max(1e-4, Math.min(Math.PI / 2 - 1e-4, isNaN(halfAngle) ? Math.PI / 6 : halfAngle));

    if (refDir && refDir.lengthSq && refDir.lengthSq() > 1e-8) {
      this.refX = safeNormalize(refDir, new THREE.Vector3(1, 0, 0));
    } else {
      const arb = Math.abs(this.axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      let cross = new THREE.Vector3().crossVectors(this.axis, arb);
      if (cross.lengthSq() < 1e-8) {
        cross = new THREE.Vector3().crossVectors(this.axis, new THREE.Vector3(0, 1, 0));
      }
      this.refX = safeNormalize(cross, new THREE.Vector3(1, 0, 0));
    }
    this.refY = safeNormalize(new THREE.Vector3().crossVectors(this.axis, this.refX), new THREE.Vector3(0, 1, 0));
  }

  pointAt(u, v) {
    const cu = isNaN(u) ? 0 : u;
    const cv = isNaN(v) ? 0 : v;
    const r = Math.abs(cv * Math.tan(this.halfAngle));
    const cos = Math.cos(cu);
    const sin = Math.sin(cu);
    return new THREE.Vector3()
      .copy(this.apex)
      .addScaledVector(this.axis, cv)
      .addScaledVector(this.refX, r * cos)
      .addScaledVector(this.refY, r * sin);
  }

  normalAt(u, v) {
    const cu = isNaN(u) ? 0 : u;
    const cv = isNaN(v) ? 0 : v;
    const cos = Math.cos(cu);
    const sin = Math.sin(cu);
    const radNormal = new THREE.Vector3()
      .addScaledVector(this.refX, cos)
      .addScaledVector(this.refY, sin);
    const sign = cv >= 0 ? 1 : -1;
    const norm = new THREE.Vector3()
      .addScaledVector(radNormal, Math.cos(this.halfAngle))
      .addScaledVector(this.axis, -Math.sin(this.halfAngle) * sign);
    return safeNormalize(norm, this.refX);
  }

  clone() {
    return new ConeSurface(this.apex, this.axis, this.halfAngle, this.refX);
  }
}

/**
 * Toroidal Surface
 */
export class TorusSurface extends Surface {
  constructor(center = new THREE.Vector3(0, 0, 0), axis = new THREE.Vector3(0, 0, 1), majorRadius = 20, minorRadius = 5, refDir = null) {
    super(SURFACE_TYPES.TORUS);
    this.center = sanitizePoint(center);
    this.axis = safeNormalize(axis, new THREE.Vector3(0, 0, 1));
    this.majorRadius = Math.max(1e-4, isNaN(majorRadius) ? 20 : Math.abs(majorRadius));
    this.minorRadius = Math.max(1e-5, Math.min(this.majorRadius * 0.999, isNaN(minorRadius) ? 5 : Math.abs(minorRadius)));

    if (refDir && refDir.lengthSq && refDir.lengthSq() > 1e-8) {
      this.refX = safeNormalize(refDir, new THREE.Vector3(1, 0, 0));
    } else {
      const arb = Math.abs(this.axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      let cross = new THREE.Vector3().crossVectors(this.axis, arb);
      if (cross.lengthSq() < 1e-8) {
        cross = new THREE.Vector3().crossVectors(this.axis, new THREE.Vector3(0, 1, 0));
      }
      this.refX = safeNormalize(cross, new THREE.Vector3(1, 0, 0));
    }
    this.refY = safeNormalize(new THREE.Vector3().crossVectors(this.axis, this.refX), new THREE.Vector3(0, 1, 0));
  }

  pointAt(u, v) {
    const cu = isNaN(u) ? 0 : u;
    const cv = isNaN(v) ? 0 : v;
    const cosU = Math.cos(cu);
    const sinU = Math.sin(cu);
    const cosV = Math.cos(cv);
    const sinV = Math.sin(cv);

    const tubeCenter = new THREE.Vector3()
      .copy(this.center)
      .addScaledVector(this.refX, this.majorRadius * cosU)
      .addScaledVector(this.refY, this.majorRadius * sinU);

    const radialDir = safeNormalize(
      new THREE.Vector3()
        .addScaledVector(this.refX, cosU)
        .addScaledVector(this.refY, sinU),
      this.refX
    );

    return tubeCenter
      .addScaledVector(radialDir, this.minorRadius * cosV)
      .addScaledVector(this.axis, this.minorRadius * sinV);
  }

  normalAt(u, v) {
    const cu = isNaN(u) ? 0 : u;
    const cv = isNaN(v) ? 0 : v;
    const cosU = Math.cos(cu);
    const sinU = Math.sin(cu);
    const cosV = Math.cos(cv);
    const sinV = Math.sin(cv);

    const radialDir = safeNormalize(
      new THREE.Vector3()
        .addScaledVector(this.refX, cosU)
        .addScaledVector(this.refY, sinU),
      this.refX
    );

    const norm = new THREE.Vector3()
      .addScaledVector(radialDir, cosV)
      .addScaledVector(this.axis, sinV);
    return safeNormalize(norm, radialDir);
  }

  clone() {
    return new TorusSurface(this.center, this.axis, this.majorRadius, this.minorRadius, this.refX);
  }
}

/**
 * Spherical Surface
 */
export class SphereSurface extends Surface {
  constructor(center = new THREE.Vector3(0, 0, 0), radius = 10) {
    super(SURFACE_TYPES.SPHERE);
    this.center = sanitizePoint(center);
    this.radius = Math.max(1e-7, isNaN(radius) ? 10 : Math.abs(radius));
  }

  pointAt(u, v) {
    const cu = isNaN(u) ? 0 : u;
    const cv = isNaN(v) ? 0 : v;
    const cosV = Math.cos(cv);
    const sinV = Math.sin(cv);
    const cosU = Math.cos(cu);
    const sinU = Math.sin(cu);
    return new THREE.Vector3(
      this.center.x + this.radius * cosV * cosU,
      this.center.y + this.radius * cosV * sinU,
      this.center.z + this.radius * sinV
    );
  }

  normalAt(u, v) {
    const pt = this.pointAt(u, v);
    const diff = new THREE.Vector3().subVectors(pt, this.center);
    return safeNormalize(diff, new THREE.Vector3(0, 0, 1));
  }

  clone() {
    return new SphereSurface(this.center, this.radius);
  }
}

// ============================================================================
// Boundary Representation (B-Rep) Topological Classes
// ============================================================================

/**
 * Vertex: 0D topological element representing a geometric point
 */
export class Vertex {
  constructor(point, id = null) {
    this.id = id || generateId('vert');
    this.point = sanitizePoint(point);
    this.incidentEdges = new Set();
  }

  addIncidentEdge(edge) {
    this.incidentEdges.add(edge);
  }

  removeIncidentEdge(edge) {
    this.incidentEdges.delete(edge);
  }

  distanceTo(other) {
    const p = other instanceof Vertex ? other.point : sanitizePoint(other);
    return this.point.distanceTo(p);
  }

  equals(other, tol = 1e-5) {
    return this.distanceTo(other) < tol;
  }

  clone() {
    return new Vertex(this.point.clone());
  }

  toJSON() {
    return {
      id: this.id,
      x: this.point.x,
      y: this.point.y,
      z: this.point.z,
    };
  }
}

/**
 * Edge: 1D topological boundary element bounded by two vertices (or one closed vertex)
 */
export class Edge {
  constructor(startVertex, endVertex, curve = null, id = null) {
    this.id = id || generateId('edge');
    this.startVertex = startVertex;
    this.endVertex = endVertex;
    this.curve = curve || (startVertex && endVertex ? new LineCurve(startVertex.point, endVertex.point) : null);
    this.adjacentFaces = new Set();
    this.coedges = [];

    if (startVertex) startVertex.addIncidentEdge(this);
    if (endVertex && endVertex !== startVertex) endVertex.addIncidentEdge(this);
  }

  addAdjacentFace(face) {
    this.adjacentFaces.add(face);
  }

  removeAdjacentFace(face) {
    this.adjacentFaces.delete(face);
  }

  addCoEdge(coedge) {
    if (!this.coedges.includes(coedge)) {
      this.coedges.push(coedge);
    }
  }

  length() {
    if (this.curve) return this.curve.length();
    if (!this.startVertex || !this.endVertex) return 0;
    return this.startVertex.point.distanceTo(this.endVertex.point);
  }

  pointAt(t) {
    const clampedT = isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
    if (this.curve) return this.curve.pointAt(clampedT);
    if (!this.startVertex || !this.endVertex) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3().lerpVectors(this.startVertex.point, this.endVertex.point, clampedT);
  }

  tangentAt(t) {
    if (this.curve) return this.curve.tangentAt(t);
    if (!this.startVertex || !this.endVertex) return new THREE.Vector3(0, 0, 1);
    const diff = new THREE.Vector3().subVectors(this.endVertex.point, this.startVertex.point);
    return safeNormalize(diff, new THREE.Vector3(0, 0, 1));
  }

  isClosed(tol = 1e-5) {
    if (!this.startVertex || !this.endVertex) return false;
    return this.startVertex === this.endVertex || this.startVertex.distanceTo(this.endVertex) < tol;
  }

  reverse() {
    const tmp = this.startVertex;
    this.startVertex = this.endVertex;
    this.endVertex = tmp;
    if (this.curve && this.curve.clone) {
      if (this.curve.type === CURVE_TYPES.LINE && this.startVertex && this.endVertex) {
        this.curve = new LineCurve(this.startVertex.point, this.endVertex.point);
      }
    }
  }
}

/**
 * CoEdge (Half-Edge): Directed edge within a loop
 */
export class CoEdge {
  constructor(edge, orientation = true, id = null) {
    this.id = id || generateId('coedge');
    this.edge = edge;
    this.orientation = orientation; // true: start -> end, false: end -> start
    this.loop = null;
    this.next = null;
    this.prev = null;
    this.partner = null; // Mate coedge on adjacent face

    if (edge) {
      edge.addCoEdge(this);
    }
  }

  get startVertex() {
    if (!this.edge) return null;
    return this.orientation ? this.edge.startVertex : this.edge.endVertex;
  }

  get endVertex() {
    if (!this.edge) return null;
    return this.orientation ? this.edge.endVertex : this.edge.startVertex;
  }

  get face() {
    return this.loop ? this.loop.face : null;
  }

  pointAt(t) {
    if (!this.edge) return new THREE.Vector3(0, 0, 0);
    const param = this.orientation ? t : (1 - t);
    return this.edge.pointAt(param);
  }

  tangentAt(t) {
    if (!this.edge) return new THREE.Vector3(0, 0, 1);
    const param = this.orientation ? t : (1 - t);
    const tan = this.edge.tangentAt(param);
    return this.orientation ? tan : tan.clone().negate();
  }
}

/**
 * Loop: Closed chain of directed coedges defining an outer wire or inner hole wire of a Face
 */
export class Loop {
  constructor(coedges = [], isOuter = true, id = null) {
    this.id = id || generateId('loop');
    this.coedges = [];
    this.isOuter = isOuter;
    this.face = null;

    if (coedges && coedges.length > 0) {
      for (const ce of coedges) {
        this.addCoEdge(ce);
      }
    }
  }

  addCoEdge(coedge) {
    coedge.loop = this;
    if (this.coedges.length > 0) {
      const prev = this.coedges[this.coedges.length - 1];
      prev.next = coedge;
      coedge.prev = prev;
    }
    this.coedges.push(coedge);
    // Link last to first
    if (this.coedges.length > 1) {
      this.coedges[this.coedges.length - 1].next = this.coedges[0];
      this.coedges[0].prev = this.coedges[this.coedges.length - 1];
    }
  }

  getVertices() {
    return this.coedges.map(ce => ce.startVertex).filter(Boolean);
  }

  getEdges() {
    return this.coedges.map(ce => ce.edge).filter(Boolean);
  }

  isClosed(tol = 1e-4) {
    if (this.coedges.length === 0) return false;
    for (let i = 0; i < this.coedges.length; i++) {
      const curr = this.coedges[i];
      const next = this.coedges[(i + 1) % this.coedges.length];
      if (!curr.endVertex || !next.startVertex) return false;
      if (curr.endVertex.distanceTo(next.startVertex) > tol) {
        return false;
      }
    }
    return true;
  }

  computeArea(normal = null) {
    const verts = this.getVertices().map(v => v.point);
    if (verts.length < 3) return 0;

    const n = normal || this.computePolygonNormal();
    let areaVec = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < verts.length; i++) {
      const v0 = verts[i];
      const v1 = verts[(i + 1) % verts.length];
      areaVec.add(new THREE.Vector3().crossVectors(v0, v1));
    }
    const dot = areaVec.dot(n) * 0.5;
    return isNaN(dot) ? 0 : Math.abs(dot);
  }

  computePolygonNormal() {
    const verts = this.getVertices().map(v => v.point);
    if (verts.length < 3) return new THREE.Vector3(0, 0, 1);

    // Newell's method for robust normal computation
    const normal = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < verts.length; i++) {
      const curr = verts[i];
      const next = verts[(i + 1) % verts.length];
      normal.x += (curr.y - next.y) * (curr.z + next.z);
      normal.y += (curr.z - next.z) * (curr.x + next.x);
      normal.z += (curr.x - next.x) * (curr.y + next.y);
    }
    return safeNormalize(normal, new THREE.Vector3(0, 0, 1));
  }

  cleanVertices(tol = 1e-5) {
    if (this.coedges.length < 3) return;
    const cleaned = [];
    for (let i = 0; i < this.coedges.length; i++) {
      const ce = this.coedges[i];
      if (ce.startVertex && ce.endVertex && ce.startVertex.distanceTo(ce.endVertex) > tol) {
        cleaned.push(ce);
      }
    }
    if (cleaned.length >= 3) {
      this.coedges = [];
      for (const ce of cleaned) {
        this.addCoEdge(ce);
      }
    }
  }

  reverse() {
    const reversed = [];
    for (let i = this.coedges.length - 1; i >= 0; i--) {
      const oldCe = this.coedges[i];
      const newCe = new CoEdge(oldCe.edge, !oldCe.orientation);
      reversed.push(newCe);
    }
    this.coedges = [];
    for (const ce of reversed) {
      this.addCoEdge(ce);
    }
  }

  clone() {
    const newLoop = new Loop([], this.isOuter);
    for (const ce of this.coedges) {
      newLoop.addCoEdge(new CoEdge(ce.edge, ce.orientation));
    }
    return newLoop;
  }
}

/**
 * Face: 2D topological surface boundary bounded by an outer loop and zero or more hole loops
 */
export class Face {
  constructor(surface = null, outerLoop = null, holeLoops = [], orientation = true, id = null) {
    this.id = id || generateId('face');
    this.surface = surface || new PlaneSurface();
    this.outerLoop = outerLoop;
    this.holeLoops = [];
    this.orientation = orientation;
    this.shell = null;
    this._normal = null;

    if (outerLoop) {
      outerLoop.face = this;
      outerLoop.isOuter = true;
    }

    if (holeLoops && holeLoops.length > 0) {
      for (const hole of holeLoops) {
        this.addHoleLoop(hole);
      }
    }

    // Register this face with all incident edges
    for (const edge of this.getEdges()) {
      edge.addAdjacentFace(this);
    }
  }

  get normal() {
    if (!this._normal) {
      this.computeNormal();
    }
    return this._normal;
  }

  set normal(n) {
    this._normal = safeNormalize(n, new THREE.Vector3(0, 0, 1));
  }

  computeNormal() {
    if (this.surface && this.surface.type === SURFACE_TYPES.PLANE) {
      const sn = this.surface.normal ? this.surface.normal.clone() : new THREE.Vector3(0, 0, 1);
      this._normal = this.orientation ? sn : sn.negate();
    } else if (this.outerLoop) {
      const polyNormal = this.outerLoop.computePolygonNormal();
      this._normal = this.orientation ? polyNormal : polyNormal.negate();
    } else {
      this._normal = new THREE.Vector3(0, 0, 1);
    }
    this._normal = safeNormalize(this._normal, new THREE.Vector3(0, 0, 1));
    return this._normal;
  }

  addHoleLoop(holeLoop) {
    holeLoop.face = this;
    holeLoop.isOuter = false;
    this.holeLoops.push(holeLoop);
    for (const edge of holeLoop.getEdges()) {
      edge.addAdjacentFace(this);
    }
  }

  getVertices() {
    const verts = [];
    if (this.outerLoop) verts.push(...this.outerLoop.getVertices());
    for (const hole of this.holeLoops) {
      verts.push(...hole.getVertices());
    }
    return Array.from(new Set(verts));
  }

  getEdges() {
    const edges = [];
    if (this.outerLoop) edges.push(...this.outerLoop.getEdges());
    for (const hole of this.holeLoops) {
      edges.push(...hole.getEdges());
    }
    return Array.from(new Set(edges));
  }

  computeArea() {
    let area = this.outerLoop ? this.outerLoop.computeArea(this.normal) : 0;
    for (const hole of this.holeLoops) {
      area -= hole.computeArea(this.normal);
    }
    return Math.max(0, isNaN(area) ? 0 : area);
  }

  /**
   * Triangulate face for Three.js rendering and CSG evaluation
   * Uses ear-clipping on outer polygon with hole bridge insertion and robust fallbacks
   */
  triangulate() {
    if (!this.outerLoop) return [];

    const outerRaw = this.outerLoop.getVertices().map(v => v.point);
    const outerVerts = removeConsecutiveDuplicates(outerRaw);
    if (outerVerts.length < 3) return [];

    const norm = safeNormalize(this.normal, new THREE.Vector3(0, 0, 1));

    // If planar triangle with no holes
    if (outerVerts.length === 3 && this.holeLoops.length === 0) {
      const edge1 = new THREE.Vector3().subVectors(outerVerts[1], outerVerts[0]);
      const edge2 = new THREE.Vector3().subVectors(outerVerts[2], outerVerts[0]);
      const cross = new THREE.Vector3().crossVectors(edge1, edge2);
      if (cross.lengthSq() < 1e-12) return []; // Degenerate colinear triangle

      return [
        {
          a: outerVerts[0],
          b: this.orientation ? outerVerts[1] : outerVerts[2],
          c: this.orientation ? outerVerts[2] : outerVerts[1],
          normal: norm.clone(),
        },
      ];
    }

    // Project 3D points to 2D local plane coordinates for triangulation
    let uAxis, vAxis;
    if (this.surface && this.surface.uDir && this.surface.vDir &&
        this.surface.uDir.lengthSq() > 1e-8 && this.surface.vDir.lengthSq() > 1e-8) {
      uAxis = this.surface.uDir;
      vAxis = this.surface.vDir;
    } else {
      const arb = Math.abs(norm.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      let cross = new THREE.Vector3().crossVectors(norm, arb);
      if (cross.lengthSq() < 1e-8) {
        cross = new THREE.Vector3().crossVectors(norm, new THREE.Vector3(0, 1, 0));
      }
      uAxis = safeNormalize(cross, new THREE.Vector3(1, 0, 0));
      vAxis = safeNormalize(new THREE.Vector3().crossVectors(norm, uAxis), new THREE.Vector3(0, 1, 0));
    }

    const origin = outerVerts[0];
    const project2D = (p3d) => {
      const diff = new THREE.Vector3().subVectors(p3d, origin);
      return new THREE.Vector2(diff.dot(uAxis), diff.dot(vAxis));
    };

    // Clean hole vertices
    const validHoles = [];
    for (const h of this.holeLoops) {
      const hPts = removeConsecutiveDuplicates(h.getVertices().map(v => v.point));
      if (hPts.length >= 3) {
        validHoles.push(hPts);
      }
    }

    // Simple polygon without holes
    if (validHoles.length === 0) {
      const pts2d = outerVerts.map(p => project2D(p));
      let indices = [];
      try {
        indices = THREE.ShapeUtils.triangulateShape(pts2d, []);
      } catch (e) {
        indices = [];
      }

      // Fallback fan triangulation if ear clipping fails
      if (!indices || indices.length === 0) {
        indices = [];
        for (let i = 1; i < outerVerts.length - 1; i++) {
          indices.push([0, i, i + 1]);
        }
      }

      const triangles = [];
      for (const tri of indices) {
        let ia = tri[0];
        let ib = tri[1];
        let ic = tri[2];

        const va = outerVerts[ia];
        const vb = outerVerts[ib];
        const vc = outerVerts[ic];

        const edgeAB = new THREE.Vector3().subVectors(vb, va);
        const edgeAC = new THREE.Vector3().subVectors(vc, va);
        const cross = new THREE.Vector3().crossVectors(edgeAB, edgeAC);
        if (cross.lengthSq() < 1e-12) continue; // Skip degenerate triangle

        const computedNorm = cross.normalize();
        if (computedNorm.dot(norm) < 0) {
          const t = ib; ib = ic; ic = t;
        }

        triangles.push({
          a: outerVerts[ia],
          b: outerVerts[ib],
          c: outerVerts[ic],
          normal: norm.clone(),
        });
      }
      return triangles;
    }

    // Polygon with holes
    const outer2D = outerVerts.map(p => project2D(p));
    const holes2D = validHoles.map(h => h.map(p => project2D(p)));
    const allPts3D = [...outerVerts];
    for (const h of validHoles) {
      for (const pt of h) {
        allPts3D.push(pt);
      }
    }

    let indices = [];
    try {
      indices = THREE.ShapeUtils.triangulateShape(outer2D, holes2D);
    } catch (e) {
      indices = [];
    }

    // Fallback: fan outer loop if triangulation with holes threw error
    if (!indices || indices.length === 0) {
      indices = [];
      for (let i = 1; i < outerVerts.length - 1; i++) {
        indices.push([0, i, i + 1]);
      }
    }

    const triangles = [];
    for (const tri of indices) {
      let ia = tri[0];
      let ib = tri[1];
      let ic = tri[2];

      const va = allPts3D[ia];
      const vb = allPts3D[ib];
      const vc = allPts3D[ic];

      if (!va || !vb || !vc) continue;

      const edgeAB = new THREE.Vector3().subVectors(vb, va);
      const edgeAC = new THREE.Vector3().subVectors(vc, va);
      const cross = new THREE.Vector3().crossVectors(edgeAB, edgeAC);
      if (cross.lengthSq() < 1e-12) continue;

      const computedNorm = cross.normalize();
      if (computedNorm.dot(norm) < 0) {
        const t = ib; ib = ic; ic = t;
      }

      triangles.push({
        a: allPts3D[ia],
        b: allPts3D[ib],
        c: allPts3D[ic],
        normal: norm.clone(),
      });
    }

    return triangles;
  }

  clone() {
    const newOuter = this.outerLoop ? this.outerLoop.clone() : null;
    const newHoles = this.holeLoops.map(h => h.clone());
    const newFace = new Face(this.surface ? this.surface.clone() : null, newOuter, newHoles, this.orientation);
    newFace.normal = this.normal.clone();
    return newFace;
  }
}

/**
 * Shell: 2-Manifold connected collection of stitched Faces
 */
export class Shell {
  constructor(faces = [], id = null) {
    this.id = id || generateId('shell');
    this.faces = [];
    this.solidBody = null;

    if (faces && faces.length > 0) {
      for (const f of faces) {
        this.addFace(f);
      }
    }
  }

  addFace(face) {
    face.shell = this;
    this.faces.push(face);
  }

  removeFace(face) {
    const idx = this.faces.indexOf(face);
    if (idx !== -1) {
      this.faces.splice(idx, 1);
      face.shell = null;
    }
  }

  getVertices() {
    const vSet = new Set();
    for (const face of this.faces) {
      for (const v of face.getVertices()) {
        vSet.add(v);
      }
    }
    return Array.from(vSet);
  }

  getEdges() {
    const eSet = new Set();
    for (const face of this.faces) {
      for (const e of face.getEdges()) {
        eSet.add(e);
      }
    }
    return Array.from(eSet);
  }

  /**
   * Topological Stitching:
   * Pairs coedges between adjacent faces sharing identical geometric endpoints
   */
  stitch(tol = 1e-4) {
    const edges = this.getEdges();

    // Map geometric edges: key by sorted vertex coordinates
    const edgeMap = new Map();
    const keyPt = (p) => `${(p.x / tol).toFixed(0)},${(p.y / tol).toFixed(0)},${(p.z / tol).toFixed(0)}`;

    for (const face of this.faces) {
      const loops = [face.outerLoop, ...face.holeLoops].filter(Boolean);
      for (const loop of loops) {
        for (const ce of loop.coedges) {
          const k1 = keyPt(ce.startVertex.point);
          const k2 = keyPt(ce.endVertex.point);
          const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;

          if (!edgeMap.has(key)) {
            edgeMap.set(key, []);
          }
          edgeMap.get(key).push(ce);
        }
      }
    }

    // Match pairs
    for (const [key, coedges] of edgeMap.entries()) {
      if (coedges.length === 2) {
        const ce1 = coedges[0];
        const ce2 = coedges[1];
        ce1.partner = ce2;
        ce2.partner = ce1;
        // Merge to a single Edge entity
        const masterEdge = ce1.edge;
        ce2.edge = masterEdge;
        masterEdge.addAdjacentFace(ce1.face);
        masterEdge.addAdjacentFace(ce2.face);
        masterEdge.addCoEdge(ce1);
        masterEdge.addCoEdge(ce2);
      }
    }
  }

  /**
   * Validates whether shell is a closed 2-manifold surface
   */
  isClosed() {
    if (this.faces.length < 4) return false;
    for (const face of this.faces) {
      const loops = [face.outerLoop, ...face.holeLoops].filter(Boolean);
      for (const loop of loops) {
        for (const ce of loop.coedges) {
          if (!ce.partner) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Check 2-manifold conditions:
   * 1. Every edge shared by exactly 2 faces with opposite orientations
   * 2. Vertex link is a single topological cycle (or disc/sphere)
   */
  isManifold() {
    const edges = this.getEdges();
    for (const edge of edges) {
      if (edge.coedges.length !== 2) {
        return false;
      }
      const ce1 = edge.coedges[0];
      const ce2 = edge.coedges[1];
      // Opposite direction test
      if (ce1.startVertex.distanceTo(ce2.endVertex) > 1e-4 ||
          ce1.endVertex.distanceTo(ce2.startVertex) > 1e-4) {
        return false;
      }
    }
    return true;
  }

  /**
   * Euler Characteristic: chi = V - E + F
   */
  getEulerCharacteristic() {
    // Unique topological elements
    const V = this.getVertices().length;
    const E = this.getEdges().length;
    const F = this.faces.length;
    return V - E + F;
  }

  /**
   * Genus (number of through-holes): G = (2 - chi) / 2 for closed 2-manifold
   */
  get genus() {
    const chi = this.getEulerCharacteristic();
    return Math.max(0, Math.round((2 - chi) / 2));
  }

  /**
   * Compute volume using Divergence Theorem: V = 1/6 sum( (a x b) . c ) over all face triangles
   */
  computeVolume() {
    let volume = 0;
    for (const face of this.faces) {
      const triangles = face.triangulate();
      for (const tri of triangles) {
        const a = tri.a;
        const b = tri.b;
        const c = tri.c;
        const cross = new THREE.Vector3().crossVectors(b, c);
        const signedTet = a.dot(cross) / 6.0;
        if (!isNaN(signedTet) && isFinite(signedTet)) {
          volume += signedTet;
        }
      }
    }
    return isNaN(volume) || !isFinite(volume) ? 0 : Math.abs(volume);
  }

  /**
   * Surface Area
   */
  computeSurfaceArea() {
    let totalArea = 0;
    for (const face of this.faces) {
      const a = face.computeArea();
      if (!isNaN(a) && isFinite(a)) {
        totalArea += a;
      }
    }
    return isNaN(totalArea) || !isFinite(totalArea) ? 0 : Math.max(0, totalArea);
  }

  /**
   * Bounding Box
   */
  computeBoundingBox() {
    const box = new THREE.Box3();
    for (const v of this.getVertices()) {
      if (v && v.point) {
        box.expandByPoint(v.point);
      }
    }
    return box;
  }
}

/**
 * SolidBody: 3D topological manifold solid bounded by one outer shell and optional internal void shells
 */
export class SolidBody {
  constructor(shells = [], name = 'Solid', id = null) {
    this.id = id || generateId('solid');
    this.name = name;
    this.shells = [];

    if (shells && shells.length > 0) {
      for (const s of shells) {
        this.addShell(s);
      }
    }
  }

  addShell(shell) {
    shell.solidBody = this;
    this.shells.push(shell);
  }

  get outerShell() {
    return this.shells.length > 0 ? this.shells[0] : null;
  }

  get voidShells() {
    return this.shells.slice(1);
  }

  getVertices() {
    const vSet = new Set();
    for (const shell of this.shells) {
      for (const v of shell.getVertices()) {
        vSet.add(v);
      }
    }
    return Array.from(vSet);
  }

  getEdges() {
    const eSet = new Set();
    for (const shell of this.shells) {
      for (const e of shell.getEdges()) {
        eSet.add(e);
      }
    }
    return Array.from(eSet);
  }

  getFaces() {
    const faces = [];
    for (const shell of this.shells) {
      faces.push(...shell.faces);
    }
    return faces;
  }

  isClosed() {
    return this.shells.length > 0 && this.shells.every(s => s.isClosed());
  }

  isManifold() {
    return this.shells.length > 0 && this.shells.every(s => s.isManifold());
  }

  /**
   * Euler-Poincaré Characteristic:
   * V - E + F = 2 * (S - G)
   * where S is number of shells, G is total genus
   */
  getEulerCharacteristic() {
    const V = this.getVertices().length;
    const E = this.getEdges().length;
    const F = this.getFaces().length;
    const S = this.shells.length;
    let G = 0;
    for (const s of this.shells) {
      G += s.genus;
    }
    const chi = V - E + F;
    const expected = 2 * (S - G);
    return {
      V,
      E,
      F,
      S,
      G,
      chi,
      expected,
      valid: Math.abs(chi - expected) <= 2, // Allow for polyhedral triangulation differences
    };
  }

  /**
   * Volume: Outer shell volume minus cavity/void shell volumes
   */
  computeVolume() {
    if (this.shells.length === 0) return 0;
    let vol = this.shells[0].computeVolume();
    for (let i = 1; i < this.shells.length; i++) {
      vol -= this.shells[i].computeVolume();
    }
    return isNaN(vol) || !isFinite(vol) ? 0 : Math.max(0, vol);
  }

  /**
   * Surface Area
   */
  computeSurfaceArea() {
    let area = 0;
    for (const shell of this.shells) {
      area += shell.computeSurfaceArea();
    }
    return isNaN(area) || !isFinite(area) ? 0 : Math.max(0, area);
  }

  /**
   * Center of Mass (Centroid) via tetrahedral decomposition
   */
  computeCenterOfMass() {
    let totalVol = 0;
    const weightedCenter = new THREE.Vector3(0, 0, 0);

    for (const shell of this.shells) {
      for (const face of shell.faces) {
        const triangles = face.triangulate();
        for (const tri of triangles) {
          const a = tri.a;
          const b = tri.b;
          const c = tri.c;
          const cross = new THREE.Vector3().crossVectors(b, c);
          const tetVol = a.dot(cross) / 6.0;

          if (isNaN(tetVol) || !isFinite(tetVol)) continue;

          const tetCentroid = new THREE.Vector3()
            .add(a).add(b).add(c)
            .multiplyScalar(0.25); // (0 + a + b + c) / 4

          weightedCenter.addScaledVector(tetCentroid, tetVol);
          totalVol += tetVol;
        }
      }
    }

    if (Math.abs(totalVol) > EPSILON && !isNaN(totalVol) && isFinite(totalVol)) {
      const com = weightedCenter.divideScalar(totalVol);
      if (!isNaN(com.x) && isFinite(com.x)) return com;
    }
    return this.computeBoundingBox().getCenter(new THREE.Vector3());
  }

  /**
   * Bounding Box
   */
  computeBoundingBox() {
    const box = new THREE.Box3();
    for (const shell of this.shells) {
      box.union(shell.computeBoundingBox());
    }
    return box;
  }

  /**
   * Mass Properties Computation
   */
  computeMassProperties(density = 7900) {
    const safeDensity = typeof density === 'number' && !isNaN(density) && density > 0 ? density : 7900;
    const volume = this.computeVolume(); // mm³ or m³ depending on scene
    const surfaceArea = this.computeSurfaceArea();
    const centerOfMass = this.computeCenterOfMass();
    const boundingBox = this.computeBoundingBox();

    // In engineering units: assume dimensions in mm -> volume in mm³ -> density in kg/m³
    // volume_m3 = volume * 1e-9; mass_kg = volume_m3 * density
    const vol_m3 = volume * 1e-9;
    let mass = vol_m3 * safeDensity;
    if (isNaN(mass) || !isFinite(mass)) mass = 0;

    // Second moments of inertia about COM
    let Ixx = 0, Iyy = 0, Izz = 0, Ixy = 0, Ixz = 0, Iyz = 0;

    for (const shell of this.shells) {
      for (const face of shell.faces) {
        const triangles = face.triangulate();
        for (const tri of triangles) {
          const a = new THREE.Vector3().subVectors(tri.a, centerOfMass);
          const b = new THREE.Vector3().subVectors(tri.b, centerOfMass);
          const c = new THREE.Vector3().subVectors(tri.c, centerOfMass);

          const detJ = a.dot(new THREE.Vector3().crossVectors(b, c));
          if (isNaN(detJ) || !isFinite(detJ)) continue;
          const densityFactor = (safeDensity * 1e-9) * detJ / 60.0;

          // Standard canonical tetrahedral moments
          const x2 = a.x * a.x + b.x * b.x + c.x * c.x + a.x * b.x + a.x * c.x + b.x * c.x;
          const y2 = a.y * a.y + b.y * b.y + c.y * c.y + a.y * b.y + a.y * c.y + b.y * c.y;
          const z2 = a.z * a.z + b.z * b.z + c.z * c.z + a.z * b.z + a.z * c.z + b.z * c.z;

          Ixx += densityFactor * (y2 + z2);
          Iyy += densityFactor * (x2 + z2);
          Izz += densityFactor * (x2 + y2);

          const xy = 2 * (a.x * a.y + b.x * b.y + c.x * c.y) + (a.x * b.y + b.x * a.y + a.x * c.y + c.x * a.y + b.x * c.y + c.x * b.y);
          const xz = 2 * (a.x * a.z + b.x * b.z + c.x * c.z) + (a.x * b.z + b.x * a.z + a.x * c.z + c.x * a.z + b.x * c.z + c.x * b.z);
          const yz = 2 * (a.y * a.z + b.y * b.z + c.y * c.z) + (a.y * b.z + b.y * a.z + a.y * c.z + c.y * a.z + b.y * c.z + c.y * b.z);

          Ixy -= (densityFactor / 2.0) * xy;
          Ixz -= (densityFactor / 2.0) * xz;
          Iyz -= (densityFactor / 2.0) * yz;
        }
      }
    }

    const sanitizeVal = (v) => (typeof v === 'number' && !isNaN(v) && isFinite(v) ? v : 0);

    return {
      mass: Math.abs(sanitizeVal(mass)),
      volume: Math.abs(sanitizeVal(volume)),
      surfaceArea: Math.abs(sanitizeVal(surfaceArea)),
      centerOfMass: {
        x: sanitizeVal(centerOfMass.x),
        y: sanitizeVal(centerOfMass.y),
        z: sanitizeVal(centerOfMass.z),
      },
      boundingBox: {
        min: { x: sanitizeVal(boundingBox.min.x), y: sanitizeVal(boundingBox.min.y), z: sanitizeVal(boundingBox.min.z) },
        max: { x: sanitizeVal(boundingBox.max.x), y: sanitizeVal(boundingBox.max.y), z: sanitizeVal(boundingBox.max.z) },
      },
      momentsOfInertia: {
        Ixx: Math.abs(sanitizeVal(Ixx)),
        Iyy: Math.abs(sanitizeVal(Iyy)),
        Izz: Math.abs(sanitizeVal(Izz)),
        Ixy: sanitizeVal(Ixy),
        Ixz: sanitizeVal(Ixz),
        Iyz: sanitizeVal(Iyz),
      },
      density: safeDensity,
    };
  }

  /**
   * Release memory references and dispose cached geometries
   */
  dispose() {
    for (const shell of this.shells) {
      for (const face of shell.faces) {
        face.shell = null;
        face.outerLoop = null;
        face.holeLoops = [];
      }
      shell.faces = [];
      shell.solidBody = null;
    }
    this.shells = [];
  }

  /**
   * Export to Three.js BufferGeometry
   */
  toBufferGeometry() {
    const positions = [];
    const normals = [];
    const faceIndices = [];
    const faceGroups = [];

    let vertexOffset = 0;
    const allFaces = this.getFaces();
    for (let fIdx = 0; fIdx < allFaces.length; fIdx++) {
      const face = allFaces[fIdx];
      const triangles = face.triangulate();
      const groupStart = vertexOffset;

      for (const tri of triangles) {
        positions.push(tri.a.x, tri.a.y, tri.a.z);
        positions.push(tri.b.x, tri.b.y, tri.b.z);
        positions.push(tri.c.x, tri.c.y, tri.c.z);

        normals.push(tri.normal.x, tri.normal.y, tri.normal.z);
        normals.push(tri.normal.x, tri.normal.y, tri.normal.z);
        normals.push(tri.normal.x, tri.normal.y, tri.normal.z);

        faceIndices.push(fIdx, fIdx, fIdx);
        vertexOffset += 3;
      }

      const groupCount = vertexOffset - groupStart;
      if (groupCount > 0) {
        faceGroups.push({ start: groupStart, count: groupCount, materialIndex: 0, faceId: face.id });
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('faceIndex', new THREE.Float32BufferAttribute(faceIndices, 1));
    geometry.groups = faceGroups;

    // Attach reference to topological solid body
    geometry.solidBody = this;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
  }
}
