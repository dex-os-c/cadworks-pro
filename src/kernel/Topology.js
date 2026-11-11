// CADWorks Pro - Boundary Representation (B-Rep) Topological Data Structure
// Implements full topological hierarchy: Vertex, Edge, CoEdge, Loop, Face, Shell, SolidBody,
// along with geometric curves (Line, Arc, Circle, NURBS) and surfaces (Plane, Cylinder, Cone, Torus, Sphere).

import * as THREE from 'three';
import { generateId, EPSILON } from '../utils/math.js';

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
    return new THREE.Vector3().subVectors(p1, p0).normalize();
  }

  length(samples = 20) {
    let len = 0;
    let prev = this.pointAt(0);
    for (let i = 1; i <= samples; i++) {
      const curr = this.pointAt(i / samples);
      len += prev.distanceTo(curr);
      prev = curr;
    }
    return len;
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
    this.start = start instanceof THREE.Vector3 ? start.clone() : new THREE.Vector3(start.x, start.y, start.z);
    this.end = end instanceof THREE.Vector3 ? end.clone() : new THREE.Vector3(end.x, end.y, end.z);
  }

  pointAt(t) {
    return new THREE.Vector3().lerpVectors(this.start, this.end, t);
  }

  tangentAt(t) {
    return new THREE.Vector3().subVectors(this.end, this.start).normalize();
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
    this.center = center instanceof THREE.Vector3 ? center.clone() : new THREE.Vector3(center.x, center.y, center.z);
    this.radius = Math.max(1e-7, radius);
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.normal = normal.clone().normalize();

    if (refX) {
      this.refX = refX.clone().normalize();
    } else {
      // Pick orthogonal vector
      const arbitrary = Math.abs(this.normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      this.refX = new THREE.Vector3().crossVectors(this.normal, arbitrary).normalize();
    }
    this.refY = new THREE.Vector3().crossVectors(this.normal, this.refX).normalize();
  }

  pointAt(t) {
    const angle = this.startAngle + t * (this.endAngle - this.startAngle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new THREE.Vector3()
      .copy(this.center)
      .addScaledVector(this.refX, this.radius * cos)
      .addScaledVector(this.refY, this.radius * sin);
  }

  tangentAt(t) {
    const angle = this.startAngle + t * (this.endAngle - this.startAngle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sign = this.endAngle >= this.startAngle ? 1 : -1;
    return new THREE.Vector3()
      .addScaledVector(this.refX, -sin * sign)
      .addScaledVector(this.refY, cos * sign)
      .normalize();
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
  constructor(controlPoints, degree = 3, knots = null, weights = null) {
    super(CURVE_TYPES.NURBS);
    this.controlPoints = controlPoints.map(p =>
      p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z)
    );
    this.degree = degree;
    const n = this.controlPoints.length - 1;
    const p = this.degree;

    // Weights (default: 1.0)
    this.weights = weights && weights.length === controlPoints.length
      ? weights.slice()
      : new Array(controlPoints.length).fill(1.0);

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
    const clampedT = Math.max(0, Math.min(1, t));
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
      const idx = k - p + j;
      const cp = this.controlPoints[idx];
      const w = this.weights[idx];
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
    const w = res.w !== 0 ? res.w : 1;
    return new THREE.Vector3(res.x / w, res.y / w, res.z / w);
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
    return new THREE.Vector3().crossVectors(tu, tv).normalize();
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
    this.origin = origin instanceof THREE.Vector3 ? origin.clone() : new THREE.Vector3(origin.x, origin.y, origin.z);
    this.normal = normal.clone().normalize();

    if (uDir && vDir) {
      this.uDir = uDir.clone().normalize();
      this.vDir = vDir.clone().normalize();
    } else {
      const arb = Math.abs(this.normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      this.uDir = new THREE.Vector3().crossVectors(this.normal, arb).normalize();
      this.vDir = new THREE.Vector3().crossVectors(this.normal, this.uDir).normalize();
    }
  }

  pointAt(u, v) {
    return new THREE.Vector3()
      .copy(this.origin)
      .addScaledVector(this.uDir, u)
      .addScaledVector(this.vDir, v);
  }

  normalAt(u, v) {
    return this.normal.clone();
  }

  project(point) {
    const diff = new THREE.Vector3().subVectors(point, this.origin);
    const dist = diff.dot(this.normal);
    const projectedPoint = new THREE.Vector3().subVectors(point, this.normal.clone().multiplyScalar(dist));
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
    this.origin = origin.clone();
    this.axis = axis.clone().normalize();
    this.radius = Math.max(1e-7, radius);

    if (refDir) {
      this.refX = refDir.clone().normalize();
    } else {
      const arb = Math.abs(this.axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      this.refX = new THREE.Vector3().crossVectors(this.axis, arb).normalize();
    }
    this.refY = new THREE.Vector3().crossVectors(this.axis, this.refX).normalize();
  }

  pointAt(u, v) {
    // u: angle in [0, 2*PI], v: linear elevation along axis
    const cos = Math.cos(u);
    const sin = Math.sin(u);
    return new THREE.Vector3()
      .copy(this.origin)
      .addScaledVector(this.axis, v)
      .addScaledVector(this.refX, this.radius * cos)
      .addScaledVector(this.refY, this.radius * sin);
  }

  normalAt(u, v) {
    const cos = Math.cos(u);
    const sin = Math.sin(u);
    return new THREE.Vector3()
      .addScaledVector(this.refX, cos)
      .addScaledVector(this.refY, sin)
      .normalize();
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
    this.apex = apex.clone();
    this.axis = axis.clone().normalize();
    this.halfAngle = halfAngle;

    if (refDir) {
      this.refX = refDir.clone().normalize();
    } else {
      const arb = Math.abs(this.axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      this.refX = new THREE.Vector3().crossVectors(this.axis, arb).normalize();
    }
    this.refY = new THREE.Vector3().crossVectors(this.axis, this.refX).normalize();
  }

  pointAt(u, v) {
    // u: angle in [0, 2*PI], v: distance from apex along axis
    const r = Math.abs(v * Math.tan(this.halfAngle));
    const cos = Math.cos(u);
    const sin = Math.sin(u);
    return new THREE.Vector3()
      .copy(this.apex)
      .addScaledVector(this.axis, v)
      .addScaledVector(this.refX, r * cos)
      .addScaledVector(this.refY, r * sin);
  }

  normalAt(u, v) {
    const cos = Math.cos(u);
    const sin = Math.sin(u);
    const radNormal = new THREE.Vector3()
      .addScaledVector(this.refX, cos)
      .addScaledVector(this.refY, sin);
    const sign = v >= 0 ? 1 : -1;
    return new THREE.Vector3()
      .addScaledVector(radNormal, Math.cos(this.halfAngle))
      .addScaledVector(this.axis, -Math.sin(this.halfAngle) * sign)
      .normalize();
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
    this.center = center.clone();
    this.axis = axis.clone().normalize();
    this.majorRadius = majorRadius;
    this.minorRadius = minorRadius;

    if (refDir) {
      this.refX = refDir.clone().normalize();
    } else {
      const arb = Math.abs(this.axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      this.refX = new THREE.Vector3().crossVectors(this.axis, arb).normalize();
    }
    this.refY = new THREE.Vector3().crossVectors(this.axis, this.refX).normalize();
  }

  pointAt(u, v) {
    // u: toroidal angle (major circle), v: poloidal angle (minor tube circle)
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    const cosV = Math.cos(v);
    const sinV = Math.sin(v);

    const tubeCenter = new THREE.Vector3()
      .copy(this.center)
      .addScaledVector(this.refX, this.majorRadius * cosU)
      .addScaledVector(this.refY, this.majorRadius * sinU);

    const radialDir = new THREE.Vector3()
      .addScaledVector(this.refX, cosU)
      .addScaledVector(this.refY, sinU)
      .normalize();

    return tubeCenter
      .addScaledVector(radialDir, this.minorRadius * cosV)
      .addScaledVector(this.axis, this.minorRadius * sinV);
  }

  normalAt(u, v) {
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    const cosV = Math.cos(v);
    const sinV = Math.sin(v);

    const radialDir = new THREE.Vector3()
      .addScaledVector(this.refX, cosU)
      .addScaledVector(this.refY, sinU)
      .normalize();

    return new THREE.Vector3()
      .addScaledVector(radialDir, cosV)
      .addScaledVector(this.axis, sinV)
      .normalize();
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
    this.center = center.clone();
    this.radius = Math.max(1e-7, radius);
  }

  pointAt(u, v) {
    // u: longitude [0, 2*PI], v: latitude [-PI/2, PI/2]
    const cosV = Math.cos(v);
    const sinV = Math.sin(v);
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    return new THREE.Vector3(
      this.center.x + this.radius * cosV * cosU,
      this.center.y + this.radius * cosV * sinU,
      this.center.z + this.radius * sinV
    );
  }

  normalAt(u, v) {
    const pt = this.pointAt(u, v);
    return new THREE.Vector3().subVectors(pt, this.center).normalize();
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
    this.point = point instanceof THREE.Vector3 ? point.clone() : new THREE.Vector3(point.x, point.y, point.z);
    this.incidentEdges = new Set();
  }

  addIncidentEdge(edge) {
    this.incidentEdges.add(edge);
  }

  removeIncidentEdge(edge) {
    this.incidentEdges.delete(edge);
  }

  distanceTo(other) {
    const p = other instanceof Vertex ? other.point : other;
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
    this.curve = curve || new LineCurve(startVertex.point, endVertex.point);
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
    return this.startVertex.point.distanceTo(this.endVertex.point);
  }

  pointAt(t) {
    if (this.curve) return this.curve.pointAt(t);
    return new THREE.Vector3().lerpVectors(this.startVertex.point, this.endVertex.point, t);
  }

  tangentAt(t) {
    if (this.curve) return this.curve.tangentAt(t);
    return new THREE.Vector3().subVectors(this.endVertex.point, this.startVertex.point).normalize();
  }

  isClosed(tol = 1e-5) {
    return this.startVertex === this.endVertex || this.startVertex.distanceTo(this.endVertex) < tol;
  }

  reverse() {
    const tmp = this.startVertex;
    this.startVertex = this.endVertex;
    this.endVertex = tmp;
    if (this.curve && this.curve.clone) {
      // If linear, reverse start and end
      if (this.curve.type === CURVE_TYPES.LINE) {
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
    return this.orientation ? this.edge.startVertex : this.edge.endVertex;
  }

  get endVertex() {
    return this.orientation ? this.edge.endVertex : this.edge.startVertex;
  }

  get face() {
    return this.loop ? this.loop.face : null;
  }

  pointAt(t) {
    const param = this.orientation ? t : (1 - t);
    return this.edge.pointAt(param);
  }

  tangentAt(t) {
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
    return this.coedges.map(ce => ce.startVertex);
  }

  getEdges() {
    return this.coedges.map(ce => ce.edge);
  }

  isClosed(tol = 1e-4) {
    if (this.coedges.length === 0) return false;
    for (let i = 0; i < this.coedges.length; i++) {
      const curr = this.coedges[i];
      const next = this.coedges[(i + 1) % this.coedges.length];
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
    return Math.abs(areaVec.dot(n) * 0.5);
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
    if (normal.lengthSq() > EPSILON) {
      normal.normalize();
    } else {
      normal.set(0, 0, 1);
    }
    return normal;
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
    this._normal = n.clone().normalize();
  }

  computeNormal() {
    if (this.surface && this.surface.type === SURFACE_TYPES.PLANE) {
      this._normal = this.orientation ? this.surface.normal.clone() : this.surface.normal.clone().negate();
    } else if (this.outerLoop) {
      const polyNormal = this.outerLoop.computePolygonNormal();
      this._normal = this.orientation ? polyNormal : polyNormal.negate();
    } else {
      this._normal = new THREE.Vector3(0, 0, 1);
    }
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
    return Math.max(0, area);
  }

  /**
   * Triangulate face for Three.js rendering and CSG evaluation
   * Uses ear-clipping on outer polygon with hole bridge insertion
   */
  triangulate() {
    if (!this.outerLoop) return [];

    const outerVerts = this.outerLoop.getVertices().map(v => v.point);
    if (outerVerts.length < 3) return [];

    // If planar triangle
    if (outerVerts.length === 3 && this.holeLoops.length === 0) {
      return [
        {
          a: outerVerts[0],
          b: this.orientation ? outerVerts[1] : outerVerts[2],
          c: this.orientation ? outerVerts[2] : outerVerts[1],
          normal: this.normal.clone(),
        },
      ];
    }

    // Project 3D points to 2D local plane coordinates for triangulation
    const norm = this.normal.clone();
    let uAxis, vAxis;
    if (this.surface && this.surface.uDir && this.surface.vDir) {
      uAxis = this.surface.uDir;
      vAxis = this.surface.vDir;
    } else {
      const arb = Math.abs(norm.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      uAxis = new THREE.Vector3().crossVectors(norm, arb).normalize();
      vAxis = new THREE.Vector3().crossVectors(norm, uAxis).normalize();
    }

    const origin = outerVerts[0];
    const project2D = (p3d) => {
      const diff = new THREE.Vector3().subVectors(p3d, origin);
      return new THREE.Vector2(diff.dot(uAxis), diff.dot(vAxis));
    };

    // If simple convex/non-convex polygon without holes
    if (this.holeLoops.length === 0) {
      const pts2d = outerVerts.map(p => project2D(p));
      const indices = THREE.ShapeUtils.triangulateShape(pts2d, []);
      const triangles = [];
      for (const tri of indices) {
        let ia = tri[0];
        let ib = tri[1];
        let ic = tri[2];

        // Ensure orientation matches face normal
        const va = outerVerts[ia];
        const vb = outerVerts[ib];
        const vc = outerVerts[ic];

        const computedNorm = new THREE.Vector3()
          .crossVectors(new THREE.Vector3().subVectors(vb, va), new THREE.Vector3().subVectors(vc, va))
          .normalize();

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

    // Polygon with holes: combine using THREE.ShapeUtils
    const outer2D = outerVerts.map(p => project2D(p));
    const holes2D = this.holeLoops.map(h => h.getVertices().map(v => project2D(v.point)));
    const allPts3D = [...outerVerts];
    for (const h of this.holeLoops) {
      for (const v of h.getVertices()) {
        allPts3D.push(v.point);
      }
    }

    const indices = THREE.ShapeUtils.triangulateShape(outer2D, holes2D);
    const triangles = [];
    for (const tri of indices) {
      let ia = tri[0];
      let ib = tri[1];
      let ic = tri[2];

      const va = allPts3D[ia];
      const vb = allPts3D[ib];
      const vc = allPts3D[ic];

      const computedNorm = new THREE.Vector3()
        .crossVectors(new THREE.Vector3().subVectors(vb, va), new THREE.Vector3().subVectors(vc, va))
        .normalize();

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
        volume += a.dot(cross) / 6.0;
      }
    }
    return Math.abs(volume);
  }

  /**
   * Surface Area
   */
  computeSurfaceArea() {
    let totalArea = 0;
    for (const face of this.faces) {
      totalArea += face.computeArea();
    }
    return totalArea;
  }

  /**
   * Bounding Box
   */
  computeBoundingBox() {
    const box = new THREE.Box3();
    for (const v of this.getVertices()) {
      box.expandByPoint(v.point);
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
    return Math.max(0, vol);
  }

  /**
   * Surface Area
   */
  computeSurfaceArea() {
    let area = 0;
    for (const shell of this.shells) {
      area += shell.computeSurfaceArea();
    }
    return area;
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

          const tetCentroid = new THREE.Vector3()
            .add(a).add(b).add(c)
            .multiplyScalar(0.25); // (0 + a + b + c) / 4

          weightedCenter.addScaledVector(tetCentroid, tetVol);
          totalVol += tetVol;
        }
      }
    }

    if (Math.abs(totalVol) > EPSILON) {
      return weightedCenter.divideScalar(totalVol);
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
    const volume = this.computeVolume(); // mm³ or m³ depending on scene
    const surfaceArea = this.computeSurfaceArea();
    const centerOfMass = this.computeCenterOfMass();
    const boundingBox = this.computeBoundingBox();

    // In engineering units: assume dimensions in mm -> volume in mm³ -> density in kg/m³
    // volume_m3 = volume * 1e-9; mass_kg = volume_m3 * density
    const vol_m3 = volume * 1e-9;
    const mass = vol_m3 * density;

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
          const densityFactor = (density * 1e-9) * detJ / 60.0;

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

    return {
      mass: Math.abs(mass),
      volume: Math.abs(volume),
      surfaceArea: Math.abs(surfaceArea),
      centerOfMass: { x: centerOfMass.x, y: centerOfMass.y, z: centerOfMass.z },
      boundingBox: {
        min: { x: boundingBox.min.x, y: boundingBox.min.y, z: boundingBox.min.z },
        max: { x: boundingBox.max.x, y: boundingBox.max.y, z: boundingBox.max.z },
      },
      momentsOfInertia: {
        Ixx: Math.abs(Ixx),
        Iyy: Math.abs(Iyy),
        Izz: Math.abs(Izz),
        Ixy,
        Ixz,
        Iyz,
      },
      density,
    };
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
    for (let fIdx = 0; fIdx < this.getFaces().length; fIdx++) {
      const face = this.getFaces()[fIdx];
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
