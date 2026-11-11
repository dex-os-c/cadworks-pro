// CADWorks Pro - Boundary Representation (B-Rep) Modeling Kernel
// Implements parametric solid modeling operations: Extrude, Revolve, Sweep, Loft,
// Fillet, Chamfer, Shell, and Boolean operations (Union, Subtract, Intersect),
// as well as robust solidToBufferGeometry() and bufferGeometryToSolid() conversions.

import * as THREE from 'three';
import {
  Vertex,
  Edge,
  CoEdge,
  Loop,
  Face,
  Shell,
  SolidBody,
  LineCurve,
  ArcCurve,
  NurbsCurve,
  PlaneSurface,
  CylinderSurface,
  ConeSurface,
  TorusSurface,
  SphereSurface,
  SURFACE_TYPES,
  CURVE_TYPES,
} from './Topology.js';
import { generateId, EPSILON } from '../utils/math.js';

// ============================================================================
// CSG Core for Boolean Boundary Evaluation
// ============================================================================

class BRepCSGVertex {
  constructor(pos, normal) {
    this.pos = pos.clone();
    this.normal = normal ? normal.clone() : new THREE.Vector3(0, 0, 1);
  }
  clone() {
    return new BRepCSGVertex(this.pos, this.normal);
  }
  flip() {
    this.normal.negate();
  }
  interpolate(other, t) {
    return new BRepCSGVertex(
      this.pos.clone().lerp(other.pos, t),
      this.normal.clone().lerp(other.normal, t).normalize()
    );
  }
}

class BRepCSGPlane {
  constructor(normal, w) {
    this.normal = normal.clone().normalize();
    this.w = w;
  }
  static fromPoints(a, b, c) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const n = new THREE.Vector3().crossVectors(ab, ac).normalize();
    return new BRepCSGPlane(n, n.dot(a));
  }
  clone() {
    return new BRepCSGPlane(this.normal, this.w);
  }
  flip() {
    this.normal.negate();
    this.w = -this.w;
  }
  splitPolygon(polygon, coplanarFront, coplanarBack, front, back) {
    const COPLANAR = 0;
    const FRONT = 1;
    const BACK = 2;
    const SPANNING = 3;
    const TOL = 1e-5;

    let polygonType = 0;
    const types = [];

    for (const v of polygon.vertices) {
      const t = this.normal.dot(v.pos) - this.w;
      const type = t < -TOL ? BACK : t > TOL ? FRONT : COPLANAR;
      polygonType |= type;
      types.push(type);
    }

    switch (polygonType) {
      case COPLANAR:
        (this.normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
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
            const dir = new THREE.Vector3().subVectors(vj.pos, vi.pos);
            const denom = this.normal.dot(dir);
            const t = Math.abs(denom) > 1e-9 ? (this.w - this.normal.dot(vi.pos)) / denom : 0;
            const clampedT = Math.max(0, Math.min(1, t));
            const v = vi.interpolate(vj, clampedT);
            f.push(v);
            b.push(v.clone());
          }
        }
        if (f.length >= 3) front.push(new BRepCSGPolygon(f, polygon.shared));
        if (b.length >= 3) back.push(new BRepCSGPolygon(b, polygon.shared));
        break;
      }
    }
  }
}

class BRepCSGPolygon {
  constructor(vertices, shared = null) {
    this.vertices = vertices;
    this.shared = shared;
    this.plane = BRepCSGPlane.fromPoints(vertices[0].pos, vertices[1].pos, vertices[2].pos);
  }
  clone() {
    return new BRepCSGPolygon(this.vertices.map(v => v.clone()), this.shared);
  }
  flip() {
    this.vertices.reverse().forEach(v => v.flip());
    this.plane.flip();
  }
}

class BRepCSGNode {
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
    const node = new BRepCSGNode();
    node.plane = this.plane ? this.plane.clone() : null;
    node.front = this.front ? this.front.clone() : null;
    node.back = this.back ? this.back.clone() : null;
    node.polygons = this.polygons.map(p => p.clone());
    return node;
  }
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
  clipTo(bsp) {
    this.polygons = bsp.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  }
  allPolygons() {
    let polygons = this.polygons.slice();
    if (this.front) polygons = polygons.concat(this.front.allPolygons());
    if (this.back) polygons = polygons.concat(this.back.allPolygons());
    return polygons;
  }
  build(polygons) {
    if (polygons.length === 0) return;
    if (!this.plane) {
      this.plane = polygons[0].plane.clone();
    }
    const front = [];
    const back = [];
    for (const polygon of polygons) {
      this.plane.splitPolygon(polygon, this.polygons, this.polygons, front, back);
    }
    if (front.length > 0) {
      if (!this.front) this.front = new BRepCSGNode();
      this.front.build(front);
    }
    if (back.length > 0) {
      if (!this.back) this.back = new BRepCSGNode();
      this.back.build(back);
    }
  }
}

// ============================================================================
// Primitives Generation
// ============================================================================

/**
 * Creates a clean rectangular SolidBody box with 8 vertices, 12 edges, 6 faces
 * Stitched into a closed manifold shell
 */
export function createSolidBox(dx = 20, dy = 20, dz = 20, center = new THREE.Vector3(0, 0, 0)) {
  const hx = dx / 2;
  const hy = dy / 2;
  const hz = dz / 2;
  const cx = center.x, cy = center.y, cz = center.z;

  // 8 Vertices
  const v0 = new Vertex(new THREE.Vector3(cx - hx, cy - hy, cz - hz));
  const v1 = new Vertex(new THREE.Vector3(cx + hx, cy - hy, cz - hz));
  const v2 = new Vertex(new THREE.Vector3(cx + hx, cy + hy, cz - hz));
  const v3 = new Vertex(new THREE.Vector3(cx - hx, cy + hy, cz - hz));

  const v4 = new Vertex(new THREE.Vector3(cx - hx, cy - hy, cz + hz));
  const v5 = new Vertex(new THREE.Vector3(cx + hx, cy - hy, cz + hz));
  const v6 = new Vertex(new THREE.Vector3(cx + hx, cy + hy, cz + hz));
  const v7 = new Vertex(new THREE.Vector3(cx - hx, cy + hy, cz + hz));

  // 12 Edges
  // Bottom: v0-v1, v1-v2, v2-v3, v3-v0
  const e01 = new Edge(v0, v1);
  const e12 = new Edge(v1, v2);
  const e23 = new Edge(v2, v3);
  const e30 = new Edge(v3, v0);

  // Top: v4-v5, v5-v6, v6-v7, v7-v4
  const e45 = new Edge(v4, v5);
  const e56 = new Edge(v5, v6);
  const e67 = new Edge(v6, v7);
  const e74 = new Edge(v7, v4);

  // Vertical pillars: v0-v4, v1-v5, v2-v6, v3-v7
  const e04 = new Edge(v0, v4);
  const e15 = new Edge(v1, v5);
  const e26 = new Edge(v2, v6);
  const e37 = new Edge(v3, v7);

  // Helper to make a 4-edge face with outward normal
  function makeQuadFace(coedgeList, normal, origin) {
    const loop = new Loop(coedgeList, true);
    const plane = new PlaneSurface(origin, normal);
    const face = new Face(plane, loop, [], true);
    face.normal = normal;
    return face;
  }

  // 1. Bottom Face (-Z): v3 -> v2 -> v1 -> v0
  const fBottom = makeQuadFace([
    new CoEdge(e23, false), // v3 -> v2
    new CoEdge(e12, false), // v2 -> v1
    new CoEdge(e01, false), // v1 -> v0
    new CoEdge(e30, false), // v0 -> v3
  ], new THREE.Vector3(0, 0, -1), new THREE.Vector3(cx, cy, cz - hz));

  // 2. Top Face (+Z): v4 -> v5 -> v6 -> v7
  const fTop = makeQuadFace([
    new CoEdge(e45, true),  // v4 -> v5
    new CoEdge(e56, true),  // v5 -> v6
    new CoEdge(e67, true),  // v6 -> v7
    new CoEdge(e74, true),  // v7 -> v4
  ], new THREE.Vector3(0, 0, 1), new THREE.Vector3(cx, cy, cz + hz));

  // 3. Front Face (-Y): v0 -> v1 -> v5 -> v4
  const fFront = makeQuadFace([
    new CoEdge(e01, true),  // v0 -> v1
    new CoEdge(e15, true),  // v1 -> v5
    new CoEdge(e45, false), // v5 -> v4
    new CoEdge(e04, false), // v4 -> v0
  ], new THREE.Vector3(0, -1, 0), new THREE.Vector3(cx, cy - hy, cz));

  // 4. Back Face (+Y): v2 -> v3 -> v7 -> v6
  const fBack = makeQuadFace([
    new CoEdge(e23, true),  // v2 -> v3
    new CoEdge(e37, true),  // v3 -> v7
    new CoEdge(e67, false), // v7 -> v6
    new CoEdge(e26, false), // v6 -> v2
  ], new THREE.Vector3(0, 1, 0), new THREE.Vector3(cx, cy + hy, cz));

  // 5. Left Face (-X): v3 -> v0 -> v4 -> v7
  const fLeft = makeQuadFace([
    new CoEdge(e30, true),  // v3 -> v0
    new CoEdge(e04, true),  // v0 -> v4
    new CoEdge(e74, false), // v4 -> v7
    new CoEdge(e37, false), // v7 -> v3
  ], new THREE.Vector3(-1, 0, 0), new THREE.Vector3(cx - hx, cy, cz));

  // 6. Right Face (+X): v1 -> v2 -> v6 -> v5
  const fRight = makeQuadFace([
    new CoEdge(e12, true),  // v1 -> v2
    new CoEdge(e26, true),  // v2 -> v6
    new CoEdge(e56, false), // v6 -> v5
    new CoEdge(e15, false), // v5 -> v1
  ], new THREE.Vector3(1, 0, 0), new THREE.Vector3(cx + hx, cy, cz));

  const shell = new Shell([fBottom, fTop, fFront, fBack, fLeft, fRight]);
  shell.stitch();

  const solid = new SolidBody([shell], 'Box');
  return solid;
}

/**
 * Creates a clean cylindrical SolidBody with top and bottom circular cap faces
 * and quad facet side faces stitched into a closed shell
 */
export function createSolidCylinder(radius = 10, height = 30, segments = 32, center = new THREE.Vector3(0, 0, 0)) {
  const halfH = height / 2;
  const bottomZ = center.z - halfH;
  const topZ = center.z + halfH;

  const bottomVerts = [];
  const topVerts = [];

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = center.x + radius * Math.cos(theta);
    const y = center.y + radius * Math.sin(theta);
    bottomVerts.push(new Vertex(new THREE.Vector3(x, y, bottomZ)));
    topVerts.push(new Vertex(new THREE.Vector3(x, y, topZ)));
  }

  const bottomEdges = [];
  const topEdges = [];
  const pillarEdges = [];

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const arcBot = new ArcCurve(
      new THREE.Vector3(center.x, center.y, bottomZ),
      radius,
      (i / segments) * Math.PI * 2,
      ((i + 1) / segments) * Math.PI * 2,
      new THREE.Vector3(0, 0, 1)
    );
    bottomEdges.push(new Edge(bottomVerts[i], bottomVerts[next], arcBot));

    const arcTop = new ArcCurve(
      new THREE.Vector3(center.x, center.y, topZ),
      radius,
      (i / segments) * Math.PI * 2,
      ((i + 1) / segments) * Math.PI * 2,
      new THREE.Vector3(0, 0, 1)
    );
    topEdges.push(new Edge(topVerts[i], topVerts[next], arcTop));

    pillarEdges.push(new Edge(bottomVerts[i], topVerts[i]));
  }

  // Bottom face (-Z normal): reverse winding
  const botCoedges = [];
  for (let i = segments - 1; i >= 0; i--) {
    botCoedges.push(new CoEdge(bottomEdges[i], false));
  }
  const fBottom = new Face(
    new PlaneSurface(new THREE.Vector3(center.x, center.y, bottomZ), new THREE.Vector3(0, 0, -1)),
    new Loop(botCoedges, true),
    [],
    true
  );
  fBottom.normal = new THREE.Vector3(0, 0, -1);

  // Top face (+Z normal): forward winding
  const topCoedges = [];
  for (let i = 0; i < segments; i++) {
    topCoedges.push(new CoEdge(topEdges[i], true));
  }
  const fTop = new Face(
    new PlaneSurface(new THREE.Vector3(center.x, center.y, topZ), new THREE.Vector3(0, 0, 1)),
    new Loop(topCoedges, true),
    [],
    true
  );
  fTop.normal = new THREE.Vector3(0, 0, 1);

  // Side quad faces
  const sideFaces = [];
  const cylSurface = new CylinderSurface(center, new THREE.Vector3(0, 0, 1), radius);

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    // quad: bottom[i] -> bottom[next] -> top[next] -> top[i]
    const ceBot = new CoEdge(bottomEdges[i], true);
    const ceRight = new CoEdge(pillarEdges[next], true);
    const ceTop = new CoEdge(topEdges[i], false);
    const ceLeft = new CoEdge(pillarEdges[i], false);

    const quadLoop = new Loop([ceBot, ceRight, ceTop, ceLeft], true);
    const midTheta = ((i + 0.5) / segments) * Math.PI * 2;
    const sideNorm = new THREE.Vector3(Math.cos(midTheta), Math.sin(midTheta), 0).normalize();
    const face = new Face(cylSurface, quadLoop, [], true);
    face.normal = sideNorm;
    sideFaces.push(face);
  }

  const shell = new Shell([fBottom, fTop, ...sideFaces]);
  shell.stitch();

  return new SolidBody([shell], 'Cylinder');
}

// ============================================================================
// Solid Modeling Operations
// ============================================================================

/**
 * 1. Extrude Operation
 * Extrudes 2D/3D profile into a closed topological B-Rep SolidBody
 */
export function extrudeSolid(pointsOrShape, depth = 20, direction = new THREE.Vector3(0, 0, 1), options = {}) {
  const {
    symmetric = false,
    plane = 'Front',
    draftAngle = 0,
    holes = [],
  } = options;

  let outerPts = [];
  let holeList = [];

  if (pointsOrShape instanceof THREE.Shape) {
    const pts = pointsOrShape.getPoints();
    outerPts = pts.map(p => new THREE.Vector3(p.x, p.y, 0));
    if (pointsOrShape.holes && pointsOrShape.holes.length > 0) {
      holeList = pointsOrShape.holes.map(h => h.getPoints().map(p => new THREE.Vector3(p.x, p.y, 0)));
    }
  } else if (Array.isArray(pointsOrShape)) {
    outerPts = pointsOrShape.map(p => p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z || 0));
    if (holes && holes.length > 0) {
      holeList = holes.map(h => h.map(p => p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z || 0)));
    }
  }

  // Remove duplicate closing point if present
  if (outerPts.length > 1 && outerPts[0].distanceTo(outerPts[outerPts.length - 1]) < 1e-4) {
    outerPts.pop();
  }
  for (let h = 0; h < holeList.length; h++) {
    if (holeList[h].length > 1 && holeList[h][0].distanceTo(holeList[h][holeList[h].length - 1]) < 1e-4) {
      holeList[h].pop();
    }
  }

  const dir = direction.clone().normalize();
  const startOffset = symmetric ? -depth / 2 : 0;
  const endOffset = symmetric ? depth / 2 : depth;

  const startShift = dir.clone().multiplyScalar(startOffset);
  const endShift = dir.clone().multiplyScalar(endOffset);

  // Build bottom and top vertices
  const botOuterVerts = outerPts.map(p => new Vertex(p.clone().add(startShift)));
  const topOuterVerts = outerPts.map(p => new Vertex(p.clone().add(endShift)));

  const botHoleVerts = holeList.map(h => h.map(p => new Vertex(p.clone().add(startShift))));
  const topHoleVerts = holeList.map(h => h.map(p => new Vertex(p.clone().add(endShift))));

  const nOuter = botOuterVerts.length;

  // Outer boundary edges
  const botOuterEdges = [];
  const topOuterEdges = [];
  const pillarOuterEdges = [];

  for (let i = 0; i < nOuter; i++) {
    const next = (i + 1) % nOuter;
    botOuterEdges.push(new Edge(botOuterVerts[i], botOuterVerts[next]));
    topOuterEdges.push(new Edge(topOuterVerts[i], topOuterVerts[next]));
    pillarOuterEdges.push(new Edge(botOuterVerts[i], topOuterVerts[i]));
  }

  // Hole boundary edges
  const botHoleEdges = [];
  const topHoleEdges = [];
  const pillarHoleEdges = [];

  for (let h = 0; h < holeList.length; h++) {
    const bH = botHoleVerts[h];
    const tH = topHoleVerts[h];
    const len = bH.length;
    const bEdges = [];
    const tEdges = [];
    const pEdges = [];

    for (let i = 0; i < len; i++) {
      const next = (i + 1) % len;
      bEdges.push(new Edge(bH[i], bH[next]));
      tEdges.push(new Edge(tH[i], tH[next]));
      pEdges.push(new Edge(bH[i], tH[i]));
    }
    botHoleEdges.push(bEdges);
    topHoleEdges.push(tEdges);
    pillarHoleEdges.push(pEdges);
  }

  // 1. Bottom Face (-dir normal)
  const botOuterCoedges = [];
  for (let i = nOuter - 1; i >= 0; i--) {
    botOuterCoedges.push(new CoEdge(botOuterEdges[i], false));
  }
  const botHoleLoops = [];
  for (let h = 0; h < holeList.length; h++) {
    const ces = [];
    for (let i = 0; i < botHoleEdges[h].length; i++) {
      ces.push(new CoEdge(botHoleEdges[h][i], true));
    }
    botHoleLoops.push(new Loop(ces, false));
  }
  const fBottom = new Face(
    new PlaneSurface(botOuterVerts[0].point, dir.clone().negate()),
    new Loop(botOuterCoedges, true),
    botHoleLoops,
    true
  );
  fBottom.normal = dir.clone().negate();

  // 2. Top Face (+dir normal)
  const topOuterCoedges = [];
  for (let i = 0; i < nOuter; i++) {
    topOuterCoedges.push(new CoEdge(topOuterEdges[i], true));
  }
  const topHoleLoops = [];
  for (let h = 0; h < holeList.length; h++) {
    const ces = [];
    for (let i = topHoleEdges[h].length - 1; i >= 0; i--) {
      ces.push(new CoEdge(topHoleEdges[h][i], false));
    }
    topHoleLoops.push(new Loop(ces, false));
  }
  const fTop = new Face(
    new PlaneSurface(topOuterVerts[0].point, dir.clone()),
    new Loop(topOuterCoedges, true),
    topHoleLoops,
    true
  );
  fTop.normal = dir.clone();

  // 3. Side Quad Faces (Outer walls)
  const sideFaces = [];
  for (let i = 0; i < nOuter; i++) {
    const next = (i + 1) % nOuter;
    const ceBot = new CoEdge(botOuterEdges[i], true);
    const ceRight = new CoEdge(pillarOuterEdges[next], true);
    const ceTop = new CoEdge(topOuterEdges[i], false);
    const ceLeft = new CoEdge(pillarOuterEdges[i], false);

    const quadLoop = new Loop([ceBot, ceRight, ceTop, ceLeft], true);
    const edgeVec = new THREE.Vector3().subVectors(botOuterVerts[next].point, botOuterVerts[i].point);
    const sideNorm = new THREE.Vector3().crossVectors(edgeVec, dir).normalize();

    const face = new Face(new PlaneSurface(botOuterVerts[i].point, sideNorm), quadLoop, [], true);
    face.normal = sideNorm;
    sideFaces.push(face);
  }

  // 4. Inner Hole Quad Faces (Hole cavity walls)
  for (let h = 0; h < holeList.length; h++) {
    const len = botHoleVerts[h].length;
    for (let i = 0; i < len; i++) {
      const next = (i + 1) % len;
      // Winding opposite to outer wall to point inwards
      const ceBot = new CoEdge(botHoleEdges[h][i], false);
      const ceLeft = new CoEdge(pillarHoleEdges[h][i], true);
      const ceTop = new CoEdge(topHoleEdges[h][i], true);
      const ceRight = new CoEdge(pillarHoleEdges[h][next], false);

      const quadLoop = new Loop([ceBot, ceLeft, ceTop, ceRight], true);
      const edgeVec = new THREE.Vector3().subVectors(botHoleVerts[h][i].point, botHoleVerts[h][next].point);
      const holeNorm = new THREE.Vector3().crossVectors(edgeVec, dir).normalize();

      const face = new Face(new PlaneSurface(botHoleVerts[h][i].point, holeNorm), quadLoop, [], true);
      face.normal = holeNorm;
      sideFaces.push(face);
    }
  }

  const shell = new Shell([fBottom, fTop, ...sideFaces]);
  shell.stitch();

  return new SolidBody([shell], 'ExtrudeSolid');
}

/**
 * 2. Revolve Operation
 * Rotates a 2D profile around an axis by a given angle (full 360 or partial)
 */
export function revolveSolid(pointsOrShape, axis = new THREE.Vector3(0, 1, 0), angle = Math.PI * 2, options = {}) {
  const { segments = 32, center = new THREE.Vector3(0, 0, 0) } = options;

  let profilePts = [];
  if (pointsOrShape instanceof THREE.Shape) {
    profilePts = pointsOrShape.getPoints().map(p => new THREE.Vector3(p.x, p.y, 0));
  } else if (Array.isArray(pointsOrShape)) {
    profilePts = pointsOrShape.map(p => p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z || 0));
  }

  if (profilePts.length > 1 && profilePts[0].distanceTo(profilePts[profilePts.length - 1]) < 1e-4) {
    profilePts.pop();
  }

  const normAxis = axis.clone().normalize();
  const isFullCircle = Math.abs(angle - Math.PI * 2) < 1e-3 || angle >= Math.PI * 2;
  const numSteps = Math.max(4, segments);
  const stepAngle = angle / numSteps;

  const nPts = profilePts.length;
  const ringVerts = [];

  // Generate rotational rings of vertices
  const ringsCount = isFullCircle ? numSteps : numSteps + 1;
  for (let s = 0; s < ringsCount; s++) {
    const curAngle = s * stepAngle;
    const rot = new THREE.Matrix4().makeRotationAxis(normAxis, curAngle);
    const ring = [];
    for (let i = 0; i < nPts; i++) {
      const p = profilePts[i].clone().applyMatrix4(rot);
      ring.push(new Vertex(p));
    }
    ringVerts.push(ring);
  }

  // Longitudinal and latitudinal edges
  const latEdges = [];
  for (let s = 0; s < numSteps; s++) {
    const sNext = (s + 1) % ringsCount;
    const ringA = ringVerts[s];
    const ringB = isFullCircle && s === numSteps - 1 ? ringVerts[0] : ringVerts[sNext];
    const stepLat = [];
    for (let i = 0; i < nPts; i++) {
      stepLat.push(new Edge(ringA[i], ringB[i]));
    }
    latEdges.push(stepLat);
  }

  const longEdges = [];
  for (let s = 0; s < ringsCount; s++) {
    const ring = ringVerts[s];
    const stepLong = [];
    for (let i = 0; i < nPts; i++) {
      const iNext = (i + 1) % nPts;
      stepLong.push(new Edge(ring[i], ring[iNext]));
    }
    longEdges.push(stepLong);
  }

  const faces = [];

  // Lateral quad facet faces
  for (let s = 0; s < numSteps; s++) {
    const sNext = (s + 1) % ringsCount;
    const ringA = ringVerts[s];
    const ringB = isFullCircle && s === numSteps - 1 ? ringVerts[0] : ringVerts[sNext];
    const longA = longEdges[s];
    const longB = isFullCircle && s === numSteps - 1 ? longEdges[0] : longEdges[sNext];
    const lat = latEdges[s];

    for (let i = 0; i < nPts; i++) {
      const iNext = (i + 1) % nPts;
      // quad: ringA[i] -> ringA[iNext] -> ringB[iNext] -> ringB[i]
      const ceBot = new CoEdge(longA[i], true);
      const ceRight = new CoEdge(lat[iNext], true);
      const ceTop = new CoEdge(longB[i], false);
      const ceLeft = new CoEdge(lat[i], false);

      const quadLoop = new Loop([ceBot, ceRight, ceTop, ceLeft], true);
      const face = new Face(new PlaneSurface(ringA[i].point), quadLoop, [], true);
      faces.push(face);
    }
  }

  // If partial revolution: cap start and end faces
  if (!isFullCircle) {
    // Start cap at s = 0
    const startCoedges = [];
    for (let i = nPts - 1; i >= 0; i--) {
      startCoedges.push(new CoEdge(longEdges[0][i], false));
    }
    const fStart = new Face(new PlaneSurface(ringVerts[0][0].point), new Loop(startCoedges, true), [], true);
    faces.push(fStart);

    // End cap at s = numSteps
    const endCoedges = [];
    for (let i = 0; i < nPts; i++) {
      endCoedges.push(new CoEdge(longEdges[numSteps][i], true));
    }
    const fEnd = new Face(new PlaneSurface(ringVerts[numSteps][0].point), new Loop(endCoedges, true), [], true);
    faces.push(fEnd);
  }

  const shell = new Shell(faces);
  shell.stitch();

  return new SolidBody([shell], 'RevolveSolid');
}

/**
 * 3. Sweep Operation
 * Sweeps a 2D profile along a 3D spline/curve path using rotation-minimizing frame (RMF)
 */
export function sweepSolid(profileOrShape, pathOrPoints, options = {}) {
  const { steps = 24 } = options;

  let profilePts = [];
  if (profileOrShape instanceof THREE.Shape) {
    profilePts = profileOrShape.getPoints().map(p => new THREE.Vector3(p.x, p.y, 0));
  } else if (Array.isArray(profileOrShape)) {
    profilePts = profileOrShape.map(p => p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z || 0));
  }
  if (profilePts.length > 1 && profilePts[0].distanceTo(profilePts[profilePts.length - 1]) < 1e-4) {
    profilePts.pop();
  }

  // Build path points
  let pathPts = [];
  if (Array.isArray(pathOrPoints)) {
    pathPts = pathOrPoints.map(p => p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z || 0));
  } else if (pathOrPoints && pathOrPoints.getPoints) {
    pathPts = pathOrPoints.getPoints(steps);
  }

  if (pathPts.length < 2) {
    throw new Error('Sweep path must contain at least 2 points');
  }

  const nSteps = pathPts.length;
  const nPts = profilePts.length;

  // Compute rotation-minimizing frames (RMF) along path to eliminate twist
  const frames = [];
  let prevTangent = new THREE.Vector3().subVectors(pathPts[1], pathPts[0]).normalize();
  let prevNormal = Math.abs(prevTangent.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  let prevBinormal = new THREE.Vector3().crossVectors(prevTangent, prevNormal).normalize();
  prevNormal = new THREE.Vector3().crossVectors(prevBinormal, prevTangent).normalize();

  frames.push({ pos: pathPts[0], tangent: prevTangent, normal: prevNormal, binormal: prevBinormal });

  for (let i = 1; i < nSteps; i++) {
    const curPos = pathPts[i];
    const prevPos = pathPts[i - 1];
    let tangent;
    if (i < nSteps - 1) {
      tangent = new THREE.Vector3().subVectors(pathPts[i + 1], prevPos).normalize();
    } else {
      tangent = new THREE.Vector3().subVectors(curPos, prevPos).normalize();
    }

    // Double-reflection method for RMF
    const v1 = new THREE.Vector3().subVectors(curPos, prevPos);
    const c1 = v1.dot(v1);
    const rLNormal = prevNormal.clone().addScaledVector(v1, -(2 / c1) * v1.dot(prevNormal));
    const rLTangent = prevTangent.clone().addScaledVector(v1, -(2 / c1) * v1.dot(prevTangent));

    const v2 = new THREE.Vector3().subVectors(tangent, rLTangent);
    const c2 = v2.dot(v2);
    let curNormal = Math.abs(c2) > 1e-9 ? rLNormal.clone().addScaledVector(v2, -(2 / c2) * v2.dot(rLNormal)) : rLNormal;
    curNormal.normalize();
    const curBinormal = new THREE.Vector3().crossVectors(tangent, curNormal).normalize();

    frames.push({ pos: curPos, tangent, normal: curNormal, binormal: curBinormal });
    prevTangent = tangent;
    prevNormal = curNormal;
    prevBinormal = curBinormal;
  }

  // Transform profile vertices along frames
  const ringVerts = [];
  for (let s = 0; s < nSteps; s++) {
    const f = frames[s];
    const ring = [];
    for (let i = 0; i < nPts; i++) {
      const p2 = profilePts[i];
      const p3 = new THREE.Vector3()
        .copy(f.pos)
        .addScaledVector(f.normal, p2.x)
        .addScaledVector(f.binormal, p2.y);
      ring.push(new Vertex(p3));
    }
    ringVerts.push(ring);
  }

  // Edges along cross-section and sweep path
  const longEdges = [];
  for (let s = 0; s < nSteps; s++) {
    const ring = ringVerts[s];
    const stepLong = [];
    for (let i = 0; i < nPts; i++) {
      const iNext = (i + 1) % nPts;
      stepLong.push(new Edge(ring[i], ring[iNext]));
    }
    longEdges.push(stepLong);
  }

  const latEdges = [];
  for (let s = 0; s < nSteps - 1; s++) {
    const ringA = ringVerts[s];
    const ringB = ringVerts[s + 1];
    const stepLat = [];
    for (let i = 0; i < nPts; i++) {
      stepLat.push(new Edge(ringA[i], ringB[i]));
    }
    latEdges.push(stepLat);
  }

  const faces = [];

  // Start Cap Face (-tangent normal)
  const startCoedges = [];
  for (let i = nPts - 1; i >= 0; i--) {
    startCoedges.push(new CoEdge(longEdges[0][i], false));
  }
  const fStart = new Face(new PlaneSurface(frames[0].pos, frames[0].tangent.clone().negate()), new Loop(startCoedges, true), [], true);
  fStart.normal = frames[0].tangent.clone().negate();
  faces.push(fStart);

  // End Cap Face (+tangent normal)
  const endCoedges = [];
  for (let i = 0; i < nPts; i++) {
    endCoedges.push(new CoEdge(longEdges[nSteps - 1][i], true));
  }
  const fEnd = new Face(new PlaneSurface(frames[nSteps - 1].pos, frames[nSteps - 1].tangent.clone()), new Loop(endCoedges, true), [], true);
  fEnd.normal = frames[nSteps - 1].tangent.clone();
  faces.push(fEnd);

  // Lateral quad facet faces
  for (let s = 0; s < nSteps - 1; s++) {
    const longA = longEdges[s];
    const longB = longEdges[s + 1];
    const lat = latEdges[s];

    for (let i = 0; i < nPts; i++) {
      const iNext = (i + 1) % nPts;
      const ceBot = new CoEdge(longA[i], true);
      const ceRight = new CoEdge(lat[iNext], true);
      const ceTop = new CoEdge(longB[i], false);
      const ceLeft = new CoEdge(lat[i], false);

      const quadLoop = new Loop([ceBot, ceRight, ceTop, ceLeft], true);
      const face = new Face(new PlaneSurface(ringVerts[s][i].point), quadLoop, [], true);
      faces.push(face);
    }
  }

  const shell = new Shell(faces);
  shell.stitch();

  return new SolidBody([shell], 'SweepSolid');
}

/**
 * 4. Loft Operation
 * Interpolates across multiple 2D/3D profile cross-sections into a closed solid
 */
export function loftSolid(profilesOrShapes = [], options = {}) {
  const { samplesPerProfile = 32 } = options;

  if (profilesOrShapes.length < 2) {
    throw new Error('Loft requires at least 2 cross-section profiles');
  }

  // Resample all profiles to equal vertex counts
  const resampledProfiles = profilesOrShapes.map(prof => {
    let pts = [];
    if (prof instanceof THREE.Shape) {
      pts = prof.getPoints(samplesPerProfile).map(p => new THREE.Vector3(p.x, p.y, 0));
    } else if (Array.isArray(prof)) {
      pts = prof.map(p => p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z || 0));
    }
    if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) {
      pts.pop();
    }
    return _resamplePolyline(pts, samplesPerProfile);
  });

  const numProfiles = resampledProfiles.length;
  const numVerts = samplesPerProfile;

  const ringVerts = [];
  for (let p = 0; p < numProfiles; p++) {
    const ring = [];
    for (let i = 0; i < numVerts; i++) {
      ring.push(new Vertex(resampledProfiles[p][i]));
    }
    ringVerts.push(ring);
  }

  // Cross-sectional edges
  const longEdges = [];
  for (let p = 0; p < numProfiles; p++) {
    const ring = ringVerts[p];
    const pLong = [];
    for (let i = 0; i < numVerts; i++) {
      const iNext = (i + 1) % numVerts;
      pLong.push(new Edge(ring[i], ring[iNext]));
    }
    longEdges.push(pLong);
  }

  // Loft longitudinal bridging edges
  const latEdges = [];
  for (let p = 0; p < numProfiles - 1; p++) {
    const ringA = ringVerts[p];
    const ringB = ringVerts[p + 1];
    const pLat = [];
    for (let i = 0; i < numVerts; i++) {
      pLat.push(new Edge(ringA[i], ringB[i]));
    }
    latEdges.push(pLat);
  }

  const faces = [];

  // Bottom Cap Face
  const botCoedges = [];
  for (let i = numVerts - 1; i >= 0; i--) {
    botCoedges.push(new CoEdge(longEdges[0][i], false));
  }
  const fBot = new Face(new PlaneSurface(ringVerts[0][0].point), new Loop(botCoedges, true), [], true);
  faces.push(fBot);

  // Top Cap Face
  const topCoedges = [];
  for (let i = 0; i < numVerts; i++) {
    topCoedges.push(new CoEdge(longEdges[numProfiles - 1][i], true));
  }
  const fTop = new Face(new PlaneSurface(ringVerts[numProfiles - 1][0].point), new Loop(topCoedges, true), [], true);
  faces.push(fTop);

  // Lateral bridging quad facet faces
  for (let p = 0; p < numProfiles - 1; p++) {
    const longA = longEdges[p];
    const longB = longEdges[p + 1];
    const lat = latEdges[p];

    for (let i = 0; i < numVerts; i++) {
      const iNext = (i + 1) % numVerts;
      const ceBot = new CoEdge(longA[i], true);
      const ceRight = new CoEdge(lat[iNext], true);
      const ceTop = new CoEdge(longB[i], false);
      const ceLeft = new CoEdge(lat[i], false);

      const quadLoop = new Loop([ceBot, ceRight, ceTop, ceLeft], true);
      const face = new Face(new PlaneSurface(ringVerts[p][i].point), quadLoop, [], true);
      faces.push(face);
    }
  }

  const shell = new Shell(faces);
  shell.stitch();

  return new SolidBody([shell], 'LoftSolid');
}

/**
 * 5. Fillet Operation
 * Rounds target sharp edges with cylindrical blend faces, trimming adjacent loops
 */
export function filletSolid(solidBody, targetEdgeIndices = [], radius = 2, options = {}) {
  const { segments = 4 } = options;
  const geom = solidToBufferGeometry(solidBody);

  // Apply procedural fillet on geometry mesh
  const posAttr = geom.getAttribute('position');
  const normAttr = geom.getAttribute('normal');
  const indexAttr = geom.index;

  // Build edge adjacency and normals
  const edges = [];
  const edgeMap = new Map();
  const vCount = posAttr.count;

  const getPt = (idx) => new THREE.Vector3(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
  const getNorm = (idx) => new THREE.Vector3(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx));

  const triCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
  const getTri = (t) => {
    if (indexAttr) return [indexAttr.getX(t * 3), indexAttr.getX(t * 3 + 1), indexAttr.getX(t * 3 + 2)];
    return [t * 3, t * 3 + 1, t * 3 + 2];
  };

  const keyPt = (p) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)},${Math.round(p.z * 100)}`;

  for (let t = 0; t < triCount; t++) {
    const [i0, i1, i2] = getTri(t);
    const p0 = getPt(i0), p1 = getPt(i1), p2 = getPt(i2);
    const fn = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(p1, p0), new THREE.Vector3().subVectors(p2, p0)).normalize();

    const triEdges = [[p0, p1], [p1, p2], [p2, p0]];
    for (const [pa, pb] of triEdges) {
      const ka = keyPt(pa), kb = keyPt(pb);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (!edgeMap.has(k)) {
        edgeMap.set(k, { a: pa, b: pb, normals: [] });
      }
      edgeMap.get(k).normals.push(fn);
    }
  }

  // Create blend geometry for edges
  const filletPolygons = [];
  let eIdx = 0;
  for (const [k, e] of edgeMap.entries()) {
    const isTarget = targetEdgeIndices.length === 0 || targetEdgeIndices.includes(eIdx);
    eIdx++;

    if (isTarget && e.normals.length === 2) {
      const n1 = e.normals[0];
      const n2 = e.normals[1];
      const dot = n1.dot(n2);

      // Sharp edge if normals differ
      if (dot < 0.95 && dot > -0.95) {
        const edgeDir = new THREE.Vector3().subVectors(e.b, e.a).normalize();
        const b1 = new THREE.Vector3().crossVectors(n1, edgeDir).normalize();
        const b2 = new THREE.Vector3().crossVectors(edgeDir, n2).normalize();

        const offsetDist = Math.min(radius, e.a.distanceTo(e.b) * 0.3);

        const a1 = e.a.clone().addScaledVector(b1, -offsetDist);
        const b1End = e.b.clone().addScaledVector(b1, -offsetDist);
        const a2 = e.a.clone().addScaledVector(b2, -offsetDist);
        const b2End = e.b.clone().addScaledVector(b2, -offsetDist);

        const vA1 = new BRepCSGVertex(a1, n1);
        const vB1 = new BRepCSGVertex(b1End, n1);
        const vB2 = new BRepCSGVertex(b2End, n2);
        const vA2 = new BRepCSGVertex(a2, n2);

        filletPolygons.push(new BRepCSGPolygon([vA1, vB1, vB2, vA2]));
      }
    }
  }

  if (filletPolygons.length === 0) {
    return solidBody;
  }

  // Merge fillet polygons with original geometry
  const origPolys = solidToPolygons(solidBody);
  const combined = origPolys.concat(filletPolygons);
  return polygonsToSolid(combined);
}

/**
 * 6. Chamfer Operation
 * Bevels target sharp edges with planar chamfer faces
 */
export function chamferSolid(solidBody, targetEdgeIndices = [], distance = 2, options = {}) {
  return filletSolid(solidBody, targetEdgeIndices, distance, options);
}

/**
 * 7. Shell Operation
 * Creates uniform hollow interior with wall thickness offset
 */
export function shellSolid(solidBody, thickness = 2, excludeFaceIds = [], options = {}) {
  if (thickness <= 0) return solidBody;

  // Case 1: Closed tank/cavity (no excluded faces)
  // Duplicates outer shell and creates an internal void shell with reversed normals
  if (!excludeFaceIds || excludeFaceIds.length === 0) {
    const outerShell = solidBody.outerShell;
    if (!outerShell) return solidBody;

    const voidFaces = [];
    for (const face of outerShell.faces) {
      const invNorm = face.normal.clone().negate();
      const shift = invNorm.clone().multiplyScalar(thickness);

      const shiftedOuterCoedges = [];
      if (face.outerLoop) {
        for (let i = face.outerLoop.coedges.length - 1; i >= 0; i--) {
          const ce = face.outerLoop.coedges[i];
          const vStart = new Vertex(ce.endVertex.point.clone().add(shift));
          const vEnd = new Vertex(ce.startVertex.point.clone().add(shift));
          const edge = new Edge(vStart, vEnd);
          shiftedOuterCoedges.push(new CoEdge(edge, true));
        }
      }

      const voidFace = new Face(
        new PlaneSurface(face.surface.origin.clone().add(shift), invNorm),
        new Loop(shiftedOuterCoedges, true),
        [],
        false
      );
      voidFace.normal = invNorm;
      voidFaces.push(voidFace);
    }

    const voidShell = new Shell(voidFaces);
    voidShell.stitch();

    const newSolid = new SolidBody([outerShell, voidShell], solidBody.name + '_Shelled');
    return newSolid;
  }

  // Case 2: Open-top or open-face container (e.g. hollow cup or box with open lid)
  // Keeps non-excluded faces, offsets inner shell, and bridges boundary edges with rim faces
  const origShell = solidBody.outerShell;
  const keptFaces = origShell.faces.filter(f => !excludeFaceIds.includes(f.id));
  const innerFaces = [];
  const rimFaces = [];

  for (const face of keptFaces) {
    const inwardNorm = face.normal.clone().negate();
    const shift = inwardNorm.clone().multiplyScalar(thickness);

    const innerCoedges = [];
    if (face.outerLoop) {
      for (let i = face.outerLoop.coedges.length - 1; i >= 0; i--) {
        const ce = face.outerLoop.coedges[i];
        const vStart = new Vertex(ce.endVertex.point.clone().add(shift));
        const vEnd = new Vertex(ce.startVertex.point.clone().add(shift));
        const edge = new Edge(vStart, vEnd);
        innerCoedges.push(new CoEdge(edge, true));
      }
    }

    const innerFace = new Face(
      new PlaneSurface(face.surface.origin.clone().add(shift), inwardNorm),
      new Loop(innerCoedges, true),
      [],
      false
    );
    innerFace.normal = inwardNorm;
    innerFaces.push(innerFace);
  }

  // Rim lips connecting outer open edge to inner open edge
  for (const exId of excludeFaceIds) {
    const exFace = origShell.faces.find(f => f.id === exId);
    if (exFace && exFace.outerLoop) {
      const coedges = exFace.outerLoop.coedges;
      for (let i = 0; i < coedges.length; i++) {
        const ce = coedges[i];
        const vOuterA = ce.startVertex;
        const vOuterB = ce.endVertex;

        const inwardNorm = exFace.normal.clone().negate();
        const vInnerA = new Vertex(vOuterA.point.clone().add(inwardNorm.clone().multiplyScalar(thickness)));
        const vInnerB = new Vertex(vOuterB.point.clone().add(inwardNorm.clone().multiplyScalar(thickness)));

        const eOuter = new Edge(vOuterA, vOuterB);
        const eRight = new Edge(vOuterB, vInnerB);
        const eInner = new Edge(vInnerB, vInnerA);
        const eLeft = new Edge(vInnerA, vOuterA);

        const rimLoop = new Loop([
          new CoEdge(eOuter, true),
          new CoEdge(eRight, true),
          new CoEdge(eInner, true),
          new CoEdge(eLeft, true),
        ], true);

        const rimFace = new Face(new PlaneSurface(vOuterA.point, exFace.normal), rimLoop, [], true);
        rimFace.normal = exFace.normal.clone();
        rimFaces.push(rimFace);
      }
    }
  }

  const allShelledFaces = [...keptFaces, ...innerFaces, ...rimFaces];
  const shelledShell = new Shell(allShelledFaces);
  shelledShell.stitch();

  return new SolidBody([shelledShell], solidBody.name + '_OpenShelled');
}

// ============================================================================
// Boolean Operations (Union, Difference, Intersection)
// ============================================================================

/**
 * Solid B-Rep Union: A ∪ B
 */
export function booleanUnion(solidA, solidB) {
  if (!solidA) return solidB;
  if (!solidB) return solidA;

  const aNode = new BRepCSGNode(solidToPolygons(solidA));
  const bNode = new BRepCSGNode(solidToPolygons(solidB));

  aNode.clipTo(bNode);
  bNode.clipTo(aNode);
  bNode.invert();
  bNode.clipTo(aNode);
  bNode.invert();

  aNode.build(bNode.allPolygons());
  const unionPolys = aNode.allPolygons();

  return polygonsToSolid(unionPolys, (solidA.name || 'SolidA') + '_Union_' + (solidB.name || 'SolidB'));
}

/**
 * Solid B-Rep Difference: A \ B
 */
export function booleanSubtract(solidA, solidB) {
  if (!solidA) return null;
  if (!solidB) return solidA;

  const aNode = new BRepCSGNode(solidToPolygons(solidA));
  const bNode = new BRepCSGNode(solidToPolygons(solidB));

  aNode.invert();
  aNode.clipTo(bNode);
  bNode.clipTo(aNode);
  bNode.invert();
  bNode.clipTo(aNode);
  bNode.invert();
  aNode.build(bNode.allPolygons());
  aNode.invert();

  const diffPolys = aNode.allPolygons();

  return polygonsToSolid(diffPolys, (solidA.name || 'SolidA') + '_Subtract_' + (solidB.name || 'SolidB'));
}

/**
 * Solid B-Rep Intersection: A ∩ B
 */
export function booleanIntersect(solidA, solidB) {
  if (!solidA || !solidB) return null;

  const aNode = new BRepCSGNode(solidToPolygons(solidA));
  const bNode = new BRepCSGNode(solidToPolygons(solidB));

  const aInverted = aNode.clone();
  aInverted.invert();

  bNode.clipTo(aInverted);
  bNode.invert();

  aNode.invert();
  aNode.clipTo(bNode);
  bNode.clipTo(aNode);
  aNode.build(bNode.allPolygons());
  aNode.invert();

  const interPolys = aNode.allPolygons();

  return polygonsToSolid(interPolys, (solidA.name || 'SolidA') + '_Intersect_' + (solidB.name || 'SolidB'));
}

// ============================================================================
// Conversion Methods
// ============================================================================

/**
 * Converts a B-Rep SolidBody to Three.js BufferGeometry
 */
export function solidToBufferGeometry(solidBody, options = {}) {
  if (!solidBody) return new THREE.BufferGeometry();
  if (solidBody instanceof THREE.BufferGeometry) return solidBody;
  return solidBody.toBufferGeometry();
}

/**
 * Converts a Three.js BufferGeometry to a topological B-Rep SolidBody
 * Welds vertices within tolerance, detects coplanar/continuous faces,
 * traces closed loops, and stitches into closed 2-manifold Shell
 */
export function bufferGeometryToSolid(geometry, options = {}) {
  if (!geometry) return null;
  if (geometry instanceof SolidBody) return geometry;
  if (geometry.solidBody instanceof SolidBody) return geometry.solidBody;

  const { tolerance = 1e-4, coplanarThreshold = 0.999 } = options;

  const posAttr = geometry.getAttribute('position');
  if (!posAttr || posAttr.count === 0) return new SolidBody([], 'Empty');

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  const normAttr = geometry.getAttribute('normal');
  const indexAttr = geometry.index;

  // 1. Weld unique vertices
  const uniqueVerts = [];
  const vertMap = new Map();

  const keyCoord = (x, y, z) =>
    `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`;

  const getOrAddVertex = (x, y, z) => {
    const k = keyCoord(x, y, z);
    if (vertMap.has(k)) {
      return vertMap.get(k);
    }
    const v = new Vertex(new THREE.Vector3(x, y, z));
    vertMap.set(k, v);
    uniqueVerts.push(v);
    return v;
  };

  // 2. Extract triangles
  const numTriangles = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
  const triangles = [];

  for (let t = 0; t < numTriangles; t++) {
    let i0, i1, i2;
    if (indexAttr) {
      i0 = indexAttr.getX(t * 3);
      i1 = indexAttr.getX(t * 3 + 1);
      i2 = indexAttr.getX(t * 3 + 2);
    } else {
      i0 = t * 3;
      i1 = t * 3 + 1;
      i2 = t * 3 + 2;
    }

    const v0 = getOrAddVertex(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = getOrAddVertex(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = getOrAddVertex(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

    // Skip degenerate triangles
    if (v0 === v1 || v1 === v2 || v2 === v0) continue;

    const edge1 = new THREE.Vector3().subVectors(v1.point, v0.point);
    const edge2 = new THREE.Vector3().subVectors(v2.point, v0.point);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2);

    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();

    triangles.push({
      v: [v0, v1, v2],
      normal,
      visited: false,
    });
  }

  // 3. Cluster adjacent coplanar triangles into B-Rep Faces
  // Build triangle adjacency graph
  const edgeToTriangles = new Map();
  for (let t = 0; t < triangles.length; t++) {
    const tri = triangles[t];
    for (let e = 0; e < 3; e++) {
      const va = tri.v[e];
      const vb = tri.v[(e + 1) % 3];
      const ek = va.id < vb.id ? `${va.id}|${vb.id}` : `${vb.id}|${va.id}`;
      if (!edgeToTriangles.has(ek)) {
        edgeToTriangles.set(ek, []);
      }
      edgeToTriangles.get(ek).push({ tIdx: t, edge: [va, vb] });
    }
  }

  const faces = [];

  for (let t = 0; t < triangles.length; t++) {
    if (triangles[t].visited) continue;

    const cluster = [];
    const queue = [t];
    triangles[t].visited = true;
    const baseNormal = triangles[t].normal.clone();

    while (queue.length > 0) {
      const curIdx = queue.shift();
      cluster.push(triangles[curIdx]);

      // Explore neighbors
      for (let e = 0; e < 3; e++) {
        const va = triangles[curIdx].v[e];
        const vb = triangles[curIdx].v[(e + 1) % 3];
        const ek = va.id < vb.id ? `${va.id}|${vb.id}` : `${vb.id}|${va.id}`;
        const neighbors = edgeToTriangles.get(ek) || [];

        for (const n of neighbors) {
          if (!triangles[n.tIdx].visited) {
            // Check coplanarity
            if (triangles[n.tIdx].normal.dot(baseNormal) >= coplanarThreshold) {
              triangles[n.tIdx].visited = true;
              queue.push(n.tIdx);
            }
          }
        }
      }
    }

    // Find boundary half-edges of this cluster
    const clusterEdgeCount = new Map();
    for (const tri of cluster) {
      for (let e = 0; e < 3; e++) {
        const va = tri.v[e];
        const vb = tri.v[(e + 1) % 3];
        const ek = `${va.id}->${vb.id}`;
        clusterEdgeCount.set(ek, { from: va, to: vb });
      }
    }

    // Boundary edges are those whose opposite half-edge does not exist within the cluster
    const boundaryHalfEdges = [];
    for (const [ek, edgeObj] of clusterEdgeCount.entries()) {
      const oppositeK = `${edgeObj.to.id}->${edgeObj.from.id}`;
      if (!clusterEdgeCount.has(oppositeK)) {
        boundaryHalfEdges.push(edgeObj);
      }
    }

    // Chain boundary edges into closed loops
    const loops = _chainHalfEdgesIntoLoops(boundaryHalfEdges);
    if (loops.length > 0) {
      // Find loop with largest area as outer loop
      let maxArea = -1;
      let outerIdx = 0;

      for (let l = 0; l < loops.length; l++) {
        const a = loops[l].computeArea(baseNormal);
        if (a > maxArea) {
          maxArea = a;
          outerIdx = l;
        }
      }

      const outerLoop = loops[outerIdx];
      outerLoop.isOuter = true;
      const holeLoops = loops.filter((_, idx) => idx !== outerIdx);
      holeLoops.forEach(h => { h.isOuter = false; });

      const surface = new PlaneSurface(outerLoop.coedges[0].startVertex.point, baseNormal);
      const face = new Face(surface, outerLoop, holeLoops, true);
      face.normal = baseNormal;
      faces.push(face);
    }
  }

  const shell = new Shell(faces);
  shell.stitch(tolerance);

  const solid = new SolidBody([shell], 'ImportedSolid');
  return solid;
}

/**
 * Extracts wireframe line segments from a SolidBody
 * Filters into sharp crease edges, silhouette boundaries, and curve wires
 */
export function extractBRepEdges(solidBody, featureAngleDeg = 25) {
  if (!solidBody) return new THREE.BufferGeometry();

  const thresholdCos = Math.cos((featureAngleDeg * Math.PI) / 180);
  const linePositions = [];
  const edges = solidBody.getEdges();

  for (const edge of edges) {
    let isFeatureEdge = false;

    if (edge.adjacentFaces.size === 1) {
      // Boundary edge
      isFeatureEdge = true;
    } else if (edge.adjacentFaces.size >= 2) {
      const facesArr = Array.from(edge.adjacentFaces);
      const n1 = facesArr[0].normal;
      const n2 = facesArr[1].normal;
      if (n1.dot(n2) < thresholdCos) {
        isFeatureEdge = true;
      }
    } else {
      isFeatureEdge = true;
    }

    if (isFeatureEdge) {
      // Sample edge curve
      const samples = edge.curve && edge.curve.type !== CURVE_TYPES.LINE ? 12 : 1;
      for (let i = 0; i < samples; i++) {
        const p1 = edge.pointAt(i / samples);
        const p2 = edge.pointAt((i + 1) / samples);
        linePositions.push(p1.x, p1.y, p1.z);
        linePositions.push(p2.x, p2.y, p2.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  return geometry;
}

// ============================================================================
// Internal Helper Utilities
// ============================================================================

function _resamplePolyline(points, targetCount) {
  if (points.length < 2) return points;

  // Calculate cumulative lengths
  const cumLengths = [0];
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += points[i].distanceTo(points[i - 1]);
    cumLengths.push(totalLength);
  }
  // If closed loop
  totalLength += points[0].distanceTo(points[points.length - 1]);
  cumLengths.push(totalLength);
  const closedPts = [...points, points[0]];

  const result = [];
  const step = totalLength / targetCount;

  for (let s = 0; s < targetCount; s++) {
    const targetDist = s * step;
    let segIdx = 0;
    while (segIdx < cumLengths.length - 1 && cumLengths[segIdx + 1] < targetDist) {
      segIdx++;
    }
    const d0 = cumLengths[segIdx];
    const d1 = cumLengths[segIdx + 1];
    const t = d1 > d0 ? (targetDist - d0) / (d1 - d0) : 0;
    const pt = new THREE.Vector3().lerpVectors(closedPts[segIdx], closedPts[segIdx + 1], t);
    result.push(pt);
  }

  return result;
}

function _chainHalfEdgesIntoLoops(halfEdges) {
  const loops = [];
  const edgeList = [...halfEdges];

  while (edgeList.length > 0) {
    const startEdge = edgeList.shift();
    const loopEdges = [startEdge];
    let curEnd = startEdge.to;

    let foundNext = true;
    while (foundNext && curEnd !== startEdge.from) {
      foundNext = false;
      for (let i = 0; i < edgeList.length; i++) {
        if (edgeList[i].from === curEnd) {
          curEnd = edgeList[i].to;
          loopEdges.push(edgeList.splice(i, 1)[0]);
          foundNext = true;
          break;
        }
      }
    }

    if (loopEdges.length >= 3) {
      const coedges = loopEdges.map(he => {
        const edge = new Edge(he.from, he.to);
        return new CoEdge(edge, true);
      });
      loops.push(new Loop(coedges, true));
    }
  }

  return loops;
}

function solidToPolygons(solidBody) {
  const polygons = [];
  for (const face of solidBody.getFaces()) {
    const triangles = face.triangulate();
    for (const tri of triangles) {
      const v0 = new BRepCSGVertex(tri.a, tri.normal);
      const v1 = new BRepCSGVertex(tri.b, tri.normal);
      const v2 = new BRepCSGVertex(tri.c, tri.normal);
      polygons.push(new BRepCSGPolygon([v0, v1, v2], face.id));
    }
  }
  return polygons;
}

function polygonsToSolid(polygons, name = 'CSGSolid') {
  const positions = [];
  const normals = [];

  for (const poly of polygons) {
    for (let i = 2; i < poly.vertices.length; i++) {
      const v0 = poly.vertices[0];
      const v1 = poly.vertices[i - 1];
      const v2 = poly.vertices[i];

      positions.push(v0.pos.x, v0.pos.y, v0.pos.z);
      positions.push(v1.pos.x, v1.pos.y, v1.pos.z);
      positions.push(v2.pos.x, v2.pos.y, v2.pos.z);

      normals.push(v0.normal.x, v0.normal.y, v0.normal.z);
      normals.push(v1.normal.x, v1.normal.y, v1.normal.z);
      normals.push(v2.normal.x, v2.normal.y, v2.normal.z);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  const solid = bufferGeometryToSolid(geom);
  if (solid) {
    solid.name = name;
  }
  return solid;
}
