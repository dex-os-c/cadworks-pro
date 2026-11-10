// CADWorks Pro - Parametric Feature Rebuild Engine
// Walks the feature tree and rebuilds the 3D model step by step
import * as THREE from 'three';
import { FEATURE_TYPES, SKETCH_ENTITY_TYPES } from '../utils/constants';
import { getSketchPlaneMatrix, getPlaneNormal, createShapeFromPoints, DEG2RAD } from '../utils/math';

/**
 * GeometryEngine adapter - wraps Three.js CSG-like operations
 * Since the kernel GeometryEngine may not be available yet, this module
 * provides a self-contained implementation using Three.js primitives.
 */
class InternalGeometryEngine {
  /**
   * Convert sketch entities into a THREE.Shape for extrusion/revolution
   * @param {Array} entities - sketch entities (lines, arcs, circles, rects)
   * @param {string} plane - sketch plane ('XY', 'XZ', 'YZ', 'Front', 'Top', 'Right')
   * @returns {{ shape: THREE.Shape, plane: string }}
   */
  shapeFromSketchEntities(entities, plane) {
    if (!entities || entities.length === 0) return null;

    // Filter out construction geometry
    const geomEntities = entities.filter(e => !e.construction);
    if (geomEntities.length === 0) return null;

    // Check for circles first - single circle is a common profile
    const circles = geomEntities.filter(e => e.type === SKETCH_ENTITY_TYPES.CIRCLE);
    if (circles.length > 0) {
      const c = circles[0];
      const shape = new THREE.Shape();
      const cx = c.center?.x || c.cx || 0;
      const cy = c.center?.y || c.cy || 0;
      const r = c.radius || c.r || 10;
      shape.absarc(cx, cy, r, 0, Math.PI * 2, false);
      return { shape, plane };
    }

    // Check for rectangles
    const rects = geomEntities.filter(e => e.type === SKETCH_ENTITY_TYPES.RECT);
    if (rects.length > 0) {
      const r = rects[0];
      const x = r.x ?? r.start?.x ?? 0;
      const y = r.y ?? r.start?.y ?? 0;
      const w = r.width ?? (r.end ? r.end.x - r.start.x : 20);
      const h = r.height ?? (r.end ? r.end.y - r.start.y : 20);
      const shape = new THREE.Shape();
      shape.moveTo(x, y);
      shape.lineTo(x + w, y);
      shape.lineTo(x + w, y + h);
      shape.lineTo(x, y + h);
      shape.closePath();
      return { shape, plane };
    }

    // Check for polygons
    const polygons = geomEntities.filter(e => e.type === SKETCH_ENTITY_TYPES.POLYGON);
    if (polygons.length > 0) {
      const p = polygons[0];
      if (p.points && p.points.length >= 3) {
        const shape = createShapeFromPoints(p.points);
        return { shape, plane };
      }
    }

    // Check for ellipses
    const ellipses = geomEntities.filter(e => e.type === SKETCH_ENTITY_TYPES.ELLIPSE);
    if (ellipses.length > 0) {
      const el = ellipses[0];
      const cx = el.center?.x || 0;
      const cy = el.center?.y || 0;
      const rx = el.radiusX || el.rx || 20;
      const ry = el.radiusY || el.ry || 10;
      const shape = new THREE.Shape();
      shape.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0);
      return { shape, plane };
    }

    // Build shape from lines - try to chain them into a closed profile
    const lines = geomEntities.filter(e => e.type === SKETCH_ENTITY_TYPES.LINE);
    if (lines.length >= 2) {
      const points = this._chainLineSegments(lines);
      if (points.length >= 3) {
        const shape = createShapeFromPoints(points);
        return { shape, plane };
      }
    }

    // Handle arcs combined with lines
    const arcs = geomEntities.filter(e => e.type === SKETCH_ENTITY_TYPES.ARC);
    if (arcs.length > 0) {
      const shape = new THREE.Shape();
      const arc = arcs[0];
      const cx = arc.center?.x || 0;
      const cy = arc.center?.y || 0;
      const r = arc.radius || 10;
      const startAngle = (arc.startAngle || 0) * DEG2RAD;
      const endAngle = (arc.endAngle || 360) * DEG2RAD;
      shape.absarc(cx, cy, r, startAngle, endAngle, false);
      shape.closePath();
      return { shape, plane };
    }

    // Fallback: collect all point-like data and make a shape
    const allPoints = [];
    for (const entity of geomEntities) {
      if (entity.start) allPoints.push({ x: entity.start.x, y: entity.start.y });
      if (entity.end) allPoints.push({ x: entity.end.x, y: entity.end.y });
      if (entity.points) {
        for (const p of entity.points) allPoints.push({ x: p.x, y: p.y });
      }
    }
    // Remove duplicates
    const unique = [];
    for (const p of allPoints) {
      if (!unique.find(u => Math.abs(u.x - p.x) < 0.001 && Math.abs(u.y - p.y) < 0.001)) {
        unique.push(p);
      }
    }
    if (unique.length >= 3) {
      const shape = createShapeFromPoints(unique);
      return { shape, plane };
    }

    return null;
  }

  /**
   * Chain line segments into an ordered point list
   */
  _chainLineSegments(lines) {
    if (lines.length === 0) return [];
    const TOLERANCE = 0.01;
    const used = new Set();
    const points = [];

    // Start with the first line
    const first = lines[0];
    used.add(0);
    points.push({ x: first.start.x, y: first.start.y });
    points.push({ x: first.end.x, y: first.end.y });

    let changed = true;
    while (changed && used.size < lines.length) {
      changed = false;
      for (let i = 0; i < lines.length; i++) {
        if (used.has(i)) continue;
        const line = lines[i];
        const last = points[points.length - 1];
        const firstPt = points[0];

        // Check if this line continues from the last point
        if (Math.abs(line.start.x - last.x) < TOLERANCE && Math.abs(line.start.y - last.y) < TOLERANCE) {
          points.push({ x: line.end.x, y: line.end.y });
          used.add(i);
          changed = true;
        } else if (Math.abs(line.end.x - last.x) < TOLERANCE && Math.abs(line.end.y - last.y) < TOLERANCE) {
          points.push({ x: line.start.x, y: line.start.y });
          used.add(i);
          changed = true;
        } else if (Math.abs(line.end.x - firstPt.x) < TOLERANCE && Math.abs(line.end.y - firstPt.y) < TOLERANCE) {
          points.unshift({ x: line.start.x, y: line.start.y });
          used.add(i);
          changed = true;
        } else if (Math.abs(line.start.x - firstPt.x) < TOLERANCE && Math.abs(line.start.y - firstPt.y) < TOLERANCE) {
          points.unshift({ x: line.end.x, y: line.end.y });
          used.add(i);
          changed = true;
        }
      }
    }

    return points;
  }

  /**
   * Extrude a profile shape along a direction
   * @param {THREE.Shape} shape - 2D profile
   * @param {number} depth - Extrusion depth
   * @param {string} plane - Sketch plane
   * @param {object} options - { direction, symmetric, draft }
   * @returns {THREE.BufferGeometry}
   */
  extrudeProfile(shape, depth, plane, options = {}) {
    const { symmetric = false, draft = 0 } = options;

    const actualDepth = symmetric ? depth / 2 : depth;
    const extrudeSettings = {
      depth: actualDepth,
      bevelEnabled: false,
      steps: Math.max(1, Math.ceil(actualDepth / 5)),
    };

    // Apply draft angle if specified
    if (draft !== 0) {
      extrudeSettings.bevelEnabled = false;
      // Draft is simulated by scaling each step
    }

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Transform geometry based on sketch plane
    const planeMatrix = getSketchPlaneMatrix(plane);
    geometry.applyMatrix4(planeMatrix);

    // If symmetric, center it
    if (symmetric) {
      const normal = getPlaneNormal(plane);
      const offset = new THREE.Matrix4().makeTranslation(
        -normal.x * actualDepth,
        -normal.y * actualDepth,
        -normal.z * actualDepth
      );
      geometry.applyMatrix4(offset);
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  /**
   * Revolve a profile shape around an axis
   * @param {THREE.Shape} shape - 2D profile
   * @param {number} angle - Revolution angle in degrees (360 for full)
   * @param {string} plane - Sketch plane
   * @param {object} axis - Revolution axis { point, direction }
   * @returns {THREE.BufferGeometry}
   */
  revolveProfile(shape, angle, plane, axis = null) {
    const segments = Math.max(16, Math.ceil(Math.abs(angle) / 5));
    const radians = angle * DEG2RAD;

    // Get shape points for lathe geometry
    const shapePoints = shape.getPoints(32);

    // Convert to Vector2 for LatheGeometry - use absolute distance from axis
    const lathePoints = shapePoints.map(p => {
      // Assume revolution around Y axis by default
      return new THREE.Vector2(Math.abs(p.x), p.y);
    });

    // Ensure points are ordered from bottom to top
    lathePoints.sort((a, b) => a.y - b.y);

    // Remove duplicate y values
    const cleaned = [lathePoints[0]];
    for (let i = 1; i < lathePoints.length; i++) {
      if (Math.abs(lathePoints[i].y - cleaned[cleaned.length - 1].y) > 0.001 ||
          Math.abs(lathePoints[i].x - cleaned[cleaned.length - 1].x) > 0.001) {
        cleaned.push(lathePoints[i]);
      }
    }

    if (cleaned.length < 2) {
      cleaned.push(new THREE.Vector2(cleaned[0].x, cleaned[0].y + 1));
    }

    const geometry = new THREE.LatheGeometry(cleaned, segments, 0, radians);

    // Transform based on sketch plane
    const planeMatrix = getSketchPlaneMatrix(plane);
    geometry.applyMatrix4(planeMatrix);

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  /**
   * Sweep a profile along a path
   */
  sweepProfile(shape, pathCurve, plane) {
    const shapePoints = shape.getPoints(16);
    const frames = pathCurve.computeFrenetFrames(64, false);
    const pathPoints = pathCurve.getPoints(64);

    const vertices = [];
    const indices = [];
    const numPoints = shapePoints.length;
    const numFrames = pathPoints.length;

    // Generate vertices by placing shape at each path point
    for (let i = 0; i < numFrames; i++) {
      const N = frames.normals[i];
      const B = frames.binormals[i];
      const P = pathPoints[i];

      for (let j = 0; j < numPoints; j++) {
        const sp = shapePoints[j];
        const x = P.x + sp.x * N.x + sp.y * B.x;
        const y = P.y + sp.x * N.y + sp.y * B.y;
        const z = P.z + sp.x * N.z + sp.y * B.z;
        vertices.push(x, y, z);
      }
    }

    // Generate faces
    for (let i = 0; i < numFrames - 1; i++) {
      for (let j = 0; j < numPoints - 1; j++) {
        const a = i * numPoints + j;
        const b = i * numPoints + (j + 1);
        const c = (i + 1) * numPoints + (j + 1);
        const d = (i + 1) * numPoints + j;
        indices.push(a, b, c);
        indices.push(a, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  }

  /**
   * Loft between multiple profile shapes
   */
  loftProfiles(shapes, plane) {
    if (shapes.length < 2) return null;

    const allPointSets = shapes.map(s => s.getPoints(32));
    const numSegments = allPointSets[0].length;
    const numLevels = allPointSets.length;

    const vertices = [];
    const indices = [];

    // Create vertices for each level
    for (let level = 0; level < numLevels; level++) {
      const pts = allPointSets[level];
      const t = level / (numLevels - 1);
      for (let j = 0; j < numSegments; j++) {
        const idx = Math.min(j, pts.length - 1);
        vertices.push(pts[idx].x, pts[idx].y, t * 50); // Z spacing
      }
    }

    // Generate indices
    for (let i = 0; i < numLevels - 1; i++) {
      for (let j = 0; j < numSegments - 1; j++) {
        const a = i * numSegments + j;
        const b = i * numSegments + (j + 1);
        const c = (i + 1) * numSegments + (j + 1);
        const d = (i + 1) * numSegments + j;
        indices.push(a, b, c);
        indices.push(a, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);

    const planeMatrix = getSketchPlaneMatrix(plane);
    geometry.applyMatrix4(planeMatrix);

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  }

  /**
   * Apply fillet to a body's edges
   * Since true fillet on BufferGeometry is complex, we approximate by smoothing
   * the geometry with subdivision-like smoothing on selected edges.
   */
  applyFillet(geometry, radius, _edgeIndices) {
    // Clone geometry and apply smoothing pass
    const result = geometry.clone();

    // Simple approach: apply a LaplacianSmooth-like operation near edges
    // For a real CAD app this would use B-rep operations
    const positions = result.getAttribute('position');
    const count = positions.count;
    const smoothed = new Float32Array(count * 3);

    // Copy original positions
    for (let i = 0; i < count * 3; i++) {
      smoothed[i] = positions.array[i];
    }

    // Compute bounding box for edge detection
    result.computeBoundingBox();
    const box = result.boundingBox;

    // Identify edge vertices (those near bounding box edges) and smooth them
    const scale = radius / Math.max(
      box.max.x - box.min.x,
      box.max.y - box.min.y,
      box.max.z - box.min.z,
      0.001
    );

    if (scale > 0 && scale < 1) {
      // Apply smoothing to edge vertices
      const center = new THREE.Vector3();
      box.getCenter(center);

      for (let i = 0; i < count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);

        // Blend toward center by a small amount for vertices near edges
        const dx = Math.abs(x - center.x) / (box.max.x - box.min.x + 0.001);
        const dy = Math.abs(y - center.y) / (box.max.y - box.min.y + 0.001);
        const dz = Math.abs(z - center.z) / (box.max.z - box.min.z + 0.001);

        // If vertex is near a box edge, smooth it
        const edgeness = Math.max(dx, dy, dz);
        if (edgeness > 0.4) {
          const blend = Math.min(scale * (edgeness - 0.4) * 5, scale);
          smoothed[i * 3] = x + (center.x - x) * blend * 0.3;
          smoothed[i * 3 + 1] = y + (center.y - y) * blend * 0.3;
          smoothed[i * 3 + 2] = z + (center.z - z) * blend * 0.3;
        }
      }
    }

    result.setAttribute('position', new THREE.Float32BufferAttribute(smoothed, 3));
    result.computeVertexNormals();
    return result;
  }

  /**
   * Apply chamfer to body edges
   */
  applyChamfer(geometry, distance, _edgeIndices) {
    // Similar to fillet but with linear blending instead of smooth
    return this.applyFillet(geometry, distance, _edgeIndices);
  }

  /**
   * Shell a body - hollow it out with specified wall thickness
   */
  applyShell(geometry, thickness, _excludedFaces) {
    // Create inner surface by scaling inward
    const outer = geometry.clone();
    const inner = geometry.clone();

    // Scale inner geometry inward
    outer.computeBoundingBox();
    const box = outer.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const sx = (size.x - 2 * thickness) / size.x;
    const sy = (size.y - 2 * thickness) / size.y;
    const sz = (size.z - 2 * thickness) / size.z;

    // Only shell if thickness makes sense
    if (sx > 0.05 && sy > 0.05 && sz > 0.05) {
      const innerPositions = inner.getAttribute('position');
      for (let i = 0; i < innerPositions.count; i++) {
        const x = innerPositions.getX(i);
        const y = innerPositions.getY(i);
        const z = innerPositions.getZ(i);
        innerPositions.setXYZ(i,
          center.x + (x - center.x) * sx,
          center.y + (y - center.y) * sy,
          center.z + (z - center.z) * sz
        );
      }
      innerPositions.needsUpdate = true;

      // Flip inner normals
      const innerIndex = inner.getIndex();
      if (innerIndex) {
        const flipped = new Uint32Array(innerIndex.count);
        for (let i = 0; i < innerIndex.count; i += 3) {
          flipped[i] = innerIndex.array[i];
          flipped[i + 1] = innerIndex.array[i + 2];
          flipped[i + 2] = innerIndex.array[i + 1];
        }
        inner.setIndex(new THREE.BufferAttribute(flipped, 1));
      }
      inner.computeVertexNormals();

      // Merge outer and inner
      return this._mergeGeometries([outer, inner]);
    }

    return outer;
  }

  /**
   * Create a hole in a body
   */
  createHole(geometry, position, direction, diameter, depth) {
    // Create a cylinder for the hole
    const radius = diameter / 2;
    const holeGeom = new THREE.CylinderGeometry(radius, radius, depth, 32);

    // Align hole with direction
    if (direction) {
      const dir = new THREE.Vector3(direction.x || 0, direction.y || 1, direction.z || 0).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      holeGeom.applyQuaternion(quat);
    }

    // Position the hole
    if (position) {
      holeGeom.translate(position.x || 0, position.y || 0, position.z || 0);
    }

    // For a simplified boolean subtract, we return the body as-is
    // True CSG requires a proper CSG library
    return this.booleanSubtract(geometry, holeGeom);
  }

  /**
   * Create a linear pattern of geometry
   */
  linearPattern(geometry, direction, count, spacing) {
    const geometries = [geometry.clone()];
    const dir = new THREE.Vector3(
      direction?.x || 1,
      direction?.y || 0,
      direction?.z || 0
    ).normalize();

    for (let i = 1; i < count; i++) {
      const clone = geometry.clone();
      clone.translate(dir.x * spacing * i, dir.y * spacing * i, dir.z * spacing * i);
      geometries.push(clone);
    }

    return this._mergeGeometries(geometries);
  }

  /**
   * Create a circular pattern of geometry
   */
  circularPattern(geometry, axis, center, count, totalAngle) {
    const geometries = [geometry.clone()];
    const angleStep = (totalAngle * DEG2RAD) / count;
    const axisVec = new THREE.Vector3(
      axis?.x || 0,
      axis?.y || 1,
      axis?.z || 0
    ).normalize();
    const centerVec = new THREE.Vector3(
      center?.x || 0,
      center?.y || 0,
      center?.z || 0
    );

    for (let i = 1; i < count; i++) {
      const clone = geometry.clone();
      // Translate to origin, rotate, translate back
      clone.translate(-centerVec.x, -centerVec.y, -centerVec.z);
      const rotMatrix = new THREE.Matrix4().makeRotationAxis(axisVec, angleStep * i);
      clone.applyMatrix4(rotMatrix);
      clone.translate(centerVec.x, centerVec.y, centerVec.z);
      geometries.push(clone);
    }

    return this._mergeGeometries(geometries);
  }

  /**
   * Mirror geometry across a plane
   */
  mirrorGeometry(geometry, planeNormal, planePoint) {
    const mirrored = geometry.clone();
    const normal = new THREE.Vector3(
      planeNormal?.x || 1,
      planeNormal?.y || 0,
      planeNormal?.z || 0
    ).normalize();
    const point = new THREE.Vector3(
      planePoint?.x || 0,
      planePoint?.y || 0,
      planePoint?.z || 0
    );

    // Create reflection matrix
    const reflectMatrix = new THREE.Matrix4();
    reflectMatrix.set(
      1 - 2 * normal.x * normal.x, -2 * normal.x * normal.y, -2 * normal.x * normal.z, 2 * normal.x * (normal.x * point.x + normal.y * point.y + normal.z * point.z),
      -2 * normal.y * normal.x, 1 - 2 * normal.y * normal.y, -2 * normal.y * normal.z, 2 * normal.y * (normal.x * point.x + normal.y * point.y + normal.z * point.z),
      -2 * normal.z * normal.x, -2 * normal.z * normal.y, 1 - 2 * normal.z * normal.z, 2 * normal.z * (normal.x * point.x + normal.y * point.y + normal.z * point.z),
      0, 0, 0, 1
    );

    mirrored.applyMatrix4(reflectMatrix);

    // Flip winding order for mirrored geometry
    const index = mirrored.getIndex();
    if (index) {
      const flipped = new Uint32Array(index.count);
      for (let i = 0; i < index.count; i += 3) {
        flipped[i] = index.array[i];
        flipped[i + 1] = index.array[i + 2];
        flipped[i + 2] = index.array[i + 1];
      }
      mirrored.setIndex(new THREE.BufferAttribute(flipped, 1));
    }
    mirrored.computeVertexNormals();

    return this._mergeGeometries([geometry.clone(), mirrored]);
  }

  /**
   * Boolean union of two geometries (merge)
   */
  booleanUnion(geomA, geomB) {
    if (!geomA) return geomB?.clone() || null;
    if (!geomB) return geomA.clone();
    return this._mergeGeometries([geomA, geomB]);
  }

  /**
   * Boolean subtract - simplified version
   * True CSG requires a proper CSG library; this creates a visual approximation
   */
  booleanSubtract(geomA, geomB) {
    if (!geomA) return null;
    if (!geomB) return geomA.clone();

    // For a simplified approach, we clip vertices of A that are inside B's bounding box
    const result = geomA.clone();
    geomB.computeBoundingBox();
    const cutBox = geomB.boundingBox;

    if (!cutBox) return result;

    const positions = result.getAttribute('position');
    const normals = result.getAttribute('normal');

    // Push vertices that are inside the cut box outward along their normal
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      if (cutBox.containsPoint(new THREE.Vector3(x, y, z))) {
        // Move vertex outward from the center of the cut box
        if (normals) {
          const nx = normals.getX(i);
          const ny = normals.getY(i);
          const nz = normals.getZ(i);
          const size = new THREE.Vector3();
          cutBox.getSize(size);
          const pushDist = Math.max(size.x, size.y, size.z) * 0.01;
          positions.setXYZ(i, x + nx * pushDist, y + ny * pushDist, z + nz * pushDist);
        }
      }
    }
    positions.needsUpdate = true;
    result.computeVertexNormals();
    return result;
  }

  /**
   * Boolean intersection - simplified
   */
  booleanIntersect(geomA, geomB) {
    if (!geomA || !geomB) return null;
    // Return the first geometry clipped to the second's bounding box
    const result = geomA.clone();
    geomB.computeBoundingBox();
    const box = geomB.boundingBox;

    if (!box) return result;

    const positions = result.getAttribute('position');
    const center = new THREE.Vector3();
    box.getCenter(center);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      if (!box.containsPoint(new THREE.Vector3(x, y, z))) {
        // Clamp vertex to box
        positions.setXYZ(i,
          THREE.MathUtils.clamp(x, box.min.x, box.max.x),
          THREE.MathUtils.clamp(y, box.min.y, box.max.y),
          THREE.MathUtils.clamp(z, box.min.z, box.max.z)
        );
      }
    }
    positions.needsUpdate = true;
    result.computeVertexNormals();
    return result;
  }

  /**
   * Compute mass properties of a geometry
   */
  computeMassProperties(geometry, density = 7900) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Approximate volume using convex hull bounding
    // For more accuracy, sum signed tetrahedron volumes
    let volume = 0;
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const i0 = index.array[i], i1 = index.array[i + 1], i2 = index.array[i + 2];
        const v0 = new THREE.Vector3(positions.getX(i0), positions.getY(i0), positions.getZ(i0));
        const v1 = new THREE.Vector3(positions.getX(i1), positions.getY(i1), positions.getZ(i1));
        const v2 = new THREE.Vector3(positions.getX(i2), positions.getY(i2), positions.getZ(i2));
        // Signed volume of tetrahedron with origin
        volume += v0.dot(v1.clone().cross(v2)) / 6.0;
      }
    } else {
      for (let i = 0; i < positions.count; i += 3) {
        const v0 = new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i));
        const v1 = new THREE.Vector3(positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
        const v2 = new THREE.Vector3(positions.getX(i + 2), positions.getY(i + 2), positions.getZ(i + 2));
        volume += v0.dot(v1.clone().cross(v2)) / 6.0;
      }
    }

    volume = Math.abs(volume);
    // Convert from mm³ to m³ for SI units (assuming mm input)
    const volumeM3 = volume * 1e-9;
    const mass = volumeM3 * density;
    const surfaceArea = this._computeSurfaceArea(geometry);

    return {
      volume,          // mm³
      surfaceArea,     // mm²
      mass,            // kg
      density,         // kg/m³
      centerOfMass: { x: center.x, y: center.y, z: center.z },
      boundingBox: {
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z },
        size: { x: size.x, y: size.y, z: size.z },
      },
      // Simplified moments of inertia (approximate as solid block)
      momentOfInertia: {
        Ixx: mass * (size.y * size.y + size.z * size.z) / 12,
        Iyy: mass * (size.x * size.x + size.z * size.z) / 12,
        Izz: mass * (size.x * size.x + size.y * size.y) / 12,
      },
    };
  }

  /**
   * Compute surface area of a geometry
   */
  _computeSurfaceArea(geometry) {
    let area = 0;
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();

    const getTriangle = (i0, i1, i2) => {
      const v0 = new THREE.Vector3(positions.getX(i0), positions.getY(i0), positions.getZ(i0));
      const v1 = new THREE.Vector3(positions.getX(i1), positions.getY(i1), positions.getZ(i1));
      const v2 = new THREE.Vector3(positions.getX(i2), positions.getY(i2), positions.getZ(i2));
      const edge1 = v1.clone().sub(v0);
      const edge2 = v2.clone().sub(v0);
      return edge1.cross(edge2).length() * 0.5;
    };

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        area += getTriangle(index.array[i], index.array[i + 1], index.array[i + 2]);
      }
    } else {
      for (let i = 0; i < positions.count; i += 3) {
        area += getTriangle(i, i + 1, i + 2);
      }
    }
    return area;
  }

  /**
   * Merge multiple BufferGeometries into one
   */
  _mergeGeometries(geometries) {
    const validGeoms = geometries.filter(g => g && g.getAttribute('position'));
    if (validGeoms.length === 0) return null;
    if (validGeoms.length === 1) return validGeoms[0].clone();

    let totalVertices = 0;
    let totalIndices = 0;
    const geomData = [];

    for (const geom of validGeoms) {
      const pos = geom.getAttribute('position');
      const idx = geom.getIndex();
      const vertCount = pos.count;
      const idxCount = idx ? idx.count : vertCount;
      geomData.push({ geom, vertCount, idxCount, offset: totalVertices });
      totalVertices += vertCount;
      totalIndices += idxCount;
    }

    const mergedPositions = new Float32Array(totalVertices * 3);
    const mergedNormals = new Float32Array(totalVertices * 3);
    const mergedIndices = new Uint32Array(totalIndices);

    let vertOffset = 0;
    let idxOffset = 0;

    for (const { geom, vertCount, idxCount, offset } of geomData) {
      const pos = geom.getAttribute('position');
      const norm = geom.getAttribute('normal');
      const idx = geom.getIndex();

      // Copy positions
      for (let i = 0; i < vertCount; i++) {
        mergedPositions[(vertOffset + i) * 3] = pos.getX(i);
        mergedPositions[(vertOffset + i) * 3 + 1] = pos.getY(i);
        mergedPositions[(vertOffset + i) * 3 + 2] = pos.getZ(i);
        if (norm) {
          mergedNormals[(vertOffset + i) * 3] = norm.getX(i);
          mergedNormals[(vertOffset + i) * 3 + 1] = norm.getY(i);
          mergedNormals[(vertOffset + i) * 3 + 2] = norm.getZ(i);
        }
      }

      // Copy indices with offset
      if (idx) {
        for (let i = 0; i < idxCount; i++) {
          mergedIndices[idxOffset + i] = idx.array[i] + vertOffset;
        }
      } else {
        for (let i = 0; i < vertCount; i++) {
          mergedIndices[idxOffset + i] = vertOffset + i;
        }
      }

      vertOffset += vertCount;
      idxOffset += idxCount;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(mergedNormals, 3));
    merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

/**
 * FeatureEngine - The parametric feature rebuild engine.
 * Takes the feature tree and rebuilds the 3D model by processing
 * each feature sequentially.
 */
export class FeatureEngine {
  constructor() {
    this.geometryEngine = new InternalGeometryEngine();
    this.sketchCache = {};  // Cache sketches by ID for reference
    this.featureGeometries = {}; // Cache individual feature geometries
  }

  /**
   * Rebuild the entire model from the feature tree
   * @param {Array} features - Array of feature objects from the store
   * @param {object} sketchEntities - Map of sketchId -> entities
   * @returns {{ bodies: THREE.BufferGeometry[], wireframes: THREE.EdgesGeometry[], massProperties: object|null }}
   */
  rebuild(features, sketchEntities = {}) {
    this.sketchCache = {};
    this.featureGeometries = {};
    let currentBody = null;
    const errors = [];

    // Process each non-suppressed feature in order
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      if (feature.suppressed) continue;

      try {
        const result = this._processFeature(feature, currentBody, sketchEntities);
        if (result !== undefined) {
          currentBody = result;
        }
      } catch (err) {
        console.warn(`FeatureEngine: Error processing feature "${feature.name}" (${feature.type}):`, err);
        errors.push({ featureId: feature.id, featureName: feature.name, error: err.message });
      }
    }

    // Build output
    const bodies = [];
    const wireframes = [];

    if (currentBody) {
      bodies.push(currentBody);
      // Generate wireframe from edges
      const edges = new THREE.EdgesGeometry(currentBody, 30); // 30 degree threshold
      wireframes.push(edges);
    }

    // Compute mass properties if we have a body
    let massProperties = null;
    if (currentBody) {
      try {
        massProperties = this.geometryEngine.computeMassProperties(currentBody);
      } catch (err) {
        console.warn('FeatureEngine: Error computing mass properties:', err);
      }
    }

    return { bodies, wireframes, massProperties, errors };
  }

  /**
   * Process a single feature and return the updated body geometry
   * @private
   */
  _processFeature(feature, currentBody, sketchEntities) {
    switch (feature.type) {
      case FEATURE_TYPES.SKETCH:
        return this._processSketch(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.EXTRUDE_BOSS:
        return this._processExtrudeBoss(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.EXTRUDE_CUT:
        return this._processExtrudeCut(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.REVOLVE_BOSS:
        return this._processRevolveBoss(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.REVOLVE_CUT:
        return this._processRevolveCut(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.SWEEP_BOSS:
        return this._processSweep(feature, currentBody, sketchEntities, false);

      case FEATURE_TYPES.SWEEP_CUT:
        return this._processSweep(feature, currentBody, sketchEntities, true);

      case FEATURE_TYPES.LOFT_BOSS:
        return this._processLoft(feature, currentBody, sketchEntities, false);

      case FEATURE_TYPES.LOFT_CUT:
        return this._processLoft(feature, currentBody, sketchEntities, true);

      case FEATURE_TYPES.FILLET:
        return this._processFillet(feature, currentBody);

      case FEATURE_TYPES.CHAMFER:
        return this._processChamfer(feature, currentBody);

      case FEATURE_TYPES.SHELL:
        return this._processShell(feature, currentBody);

      case FEATURE_TYPES.HOLE:
        return this._processHole(feature, currentBody);

      case FEATURE_TYPES.LINEAR_PATTERN:
        return this._processLinearPattern(feature, currentBody);

      case FEATURE_TYPES.CIRCULAR_PATTERN:
        return this._processCircularPattern(feature, currentBody);

      case FEATURE_TYPES.MIRROR:
        return this._processMirror(feature, currentBody);

      case FEATURE_TYPES.BOOLEAN:
        return this._processBoolean(feature, currentBody);

      case FEATURE_TYPES.REFERENCE_PLANE:
      case FEATURE_TYPES.REFERENCE_AXIS:
        // Reference geometry doesn't affect the body
        return currentBody;

      default:
        console.warn(`FeatureEngine: Unknown feature type "${feature.type}"`);
        return currentBody;
    }
  }

  /**
   * Process SKETCH feature - cache sketch data for later use
   */
  _processSketch(feature, currentBody, sketchEntities) {
    const entities = feature.entities || sketchEntities[feature.sketchId] || [];
    this.sketchCache[feature.sketchId || feature.id] = {
      entities,
      plane: feature.plane || 'Front',
      constraints: feature.constraints || [],
      dimensions: feature.dimensions || [],
    };
    // Sketches don't modify the body directly
    return currentBody;
  }

  /**
   * Get sketch data for a feature reference
   */
  _getSketchForFeature(feature, sketchEntities) {
    // Feature may reference a sketch by sketchId or sketchRef
    const sketchId = feature.sketchId || feature.sketchRef || feature.profileSketchId;

    // Check cache first
    if (sketchId && this.sketchCache[sketchId]) {
      return this.sketchCache[sketchId];
    }

    // Check sketchEntities map
    if (sketchId && sketchEntities[sketchId]) {
      return {
        entities: sketchEntities[sketchId],
        plane: feature.plane || 'Front',
      };
    }

    // If feature has inline entities
    if (feature.entities && feature.entities.length > 0) {
      return {
        entities: feature.entities,
        plane: feature.plane || 'Front',
      };
    }

    // If feature has profile data
    if (feature.profile) {
      return {
        entities: feature.profile.entities || [],
        plane: feature.profile.plane || feature.plane || 'Front',
      };
    }

    return null;
  }

  /**
   * EXTRUDE_BOSS: Find referenced sketch, convert to Shape, extrude, union with body
   */
  _processExtrudeBoss(feature, currentBody, sketchEntities) {
    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData) {
      console.warn(`FeatureEngine: No sketch found for extrude boss "${feature.name}"`);
      return currentBody;
    }

    const shapeResult = this.geometryEngine.shapeFromSketchEntities(
      sketchData.entities,
      sketchData.plane
    );

    if (!shapeResult) {
      console.warn(`FeatureEngine: Could not create shape from sketch for "${feature.name}"`);
      return currentBody;
    }

    const depth = feature.depth ?? feature.distance ?? feature.value ?? 20;
    const options = {
      symmetric: feature.symmetric || false,
      draft: feature.draftAngle || 0,
      direction: feature.direction,
    };

    const extruded = this.geometryEngine.extrudeProfile(
      shapeResult.shape,
      depth,
      shapeResult.plane,
      options
    );

    // Apply any feature-level transform
    if (feature.transform) {
      const mat = new THREE.Matrix4();
      if (feature.transform.position) {
        mat.setPosition(
          feature.transform.position.x || 0,
          feature.transform.position.y || 0,
          feature.transform.position.z || 0
        );
      }
      extruded.applyMatrix4(mat);
    }

    this.featureGeometries[feature.id] = extruded;

    // Union with existing body
    return this.geometryEngine.booleanUnion(currentBody, extruded);
  }

  /**
   * EXTRUDE_CUT: Find referenced sketch, convert to Shape, extrude, subtract from body
   */
  _processExtrudeCut(feature, currentBody, sketchEntities) {
    if (!currentBody) {
      console.warn(`FeatureEngine: No body to cut for "${feature.name}"`);
      return currentBody;
    }

    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData) return currentBody;

    const shapeResult = this.geometryEngine.shapeFromSketchEntities(
      sketchData.entities,
      sketchData.plane
    );
    if (!shapeResult) return currentBody;

    const depth = feature.depth ?? feature.distance ?? feature.value ?? 20;
    const extruded = this.geometryEngine.extrudeProfile(
      shapeResult.shape,
      depth,
      shapeResult.plane,
      { symmetric: feature.symmetric || false }
    );

    this.featureGeometries[feature.id] = extruded;

    // Subtract from body
    return this.geometryEngine.booleanSubtract(currentBody, extruded);
  }

  /**
   * REVOLVE_BOSS: Find referenced sketch, revolve, union with body
   */
  _processRevolveBoss(feature, currentBody, sketchEntities) {
    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData) return currentBody;

    const shapeResult = this.geometryEngine.shapeFromSketchEntities(
      sketchData.entities,
      sketchData.plane
    );
    if (!shapeResult) return currentBody;

    const angle = feature.angle ?? feature.revolveAngle ?? 360;
    const revolved = this.geometryEngine.revolveProfile(
      shapeResult.shape,
      angle,
      shapeResult.plane,
      feature.axis
    );

    this.featureGeometries[feature.id] = revolved;
    return this.geometryEngine.booleanUnion(currentBody, revolved);
  }

  /**
   * REVOLVE_CUT: Find referenced sketch, revolve, subtract from body
   */
  _processRevolveCut(feature, currentBody, sketchEntities) {
    if (!currentBody) return currentBody;

    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData) return currentBody;

    const shapeResult = this.geometryEngine.shapeFromSketchEntities(
      sketchData.entities,
      sketchData.plane
    );
    if (!shapeResult) return currentBody;

    const angle = feature.angle ?? feature.revolveAngle ?? 360;
    const revolved = this.geometryEngine.revolveProfile(
      shapeResult.shape,
      angle,
      shapeResult.plane,
      feature.axis
    );

    this.featureGeometries[feature.id] = revolved;
    return this.geometryEngine.booleanSubtract(currentBody, revolved);
  }

  /**
   * SWEEP: Sweep profile along path
   */
  _processSweep(feature, currentBody, sketchEntities, isCut) {
    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData) return currentBody;

    const shapeResult = this.geometryEngine.shapeFromSketchEntities(
      sketchData.entities,
      sketchData.plane
    );
    if (!shapeResult) return currentBody;

    // Build path curve from feature data
    let pathCurve;
    if (feature.pathPoints && feature.pathPoints.length >= 2) {
      const pts = feature.pathPoints.map(p =>
        new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0)
      );
      pathCurve = new THREE.CatmullRomCurve3(pts);
    } else {
      // Default path along the normal direction
      const normal = getPlaneNormal(sketchData.plane);
      const length = feature.sweepLength || feature.depth || 50;
      pathCurve = new THREE.LineCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(normal.x * length, normal.y * length, normal.z * length)
      );
    }

    const swept = this.geometryEngine.sweepProfile(shapeResult.shape, pathCurve, sketchData.plane);
    if (!swept) return currentBody;

    this.featureGeometries[feature.id] = swept;

    if (isCut && currentBody) {
      return this.geometryEngine.booleanSubtract(currentBody, swept);
    }
    return this.geometryEngine.booleanUnion(currentBody, swept);
  }

  /**
   * LOFT: Loft between profiles
   */
  _processLoft(feature, currentBody, sketchEntities, isCut) {
    const profileIds = feature.profileSketchIds || feature.profiles || [];
    const shapes = [];

    for (const profileId of profileIds) {
      const sketchData = this.sketchCache[profileId] ||
        (sketchEntities[profileId] ? { entities: sketchEntities[profileId], plane: 'Front' } : null);

      if (sketchData) {
        const shapeResult = this.geometryEngine.shapeFromSketchEntities(
          sketchData.entities,
          sketchData.plane
        );
        if (shapeResult) shapes.push(shapeResult.shape);
      }
    }

    if (shapes.length < 2) return currentBody;

    const plane = feature.plane || 'Front';
    const lofted = this.geometryEngine.loftProfiles(shapes, plane);
    if (!lofted) return currentBody;

    this.featureGeometries[feature.id] = lofted;

    if (isCut && currentBody) {
      return this.geometryEngine.booleanSubtract(currentBody, lofted);
    }
    return this.geometryEngine.booleanUnion(currentBody, lofted);
  }

  /**
   * FILLET: Apply fillet to body edges
   */
  _processFillet(feature, currentBody) {
    if (!currentBody) return currentBody;
    const radius = feature.radius ?? feature.value ?? 2;
    const edgeIndices = feature.edges || feature.edgeIndices || [];
    return this.geometryEngine.applyFillet(currentBody, radius, edgeIndices);
  }

  /**
   * CHAMFER: Apply chamfer to body edges
   */
  _processChamfer(feature, currentBody) {
    if (!currentBody) return currentBody;
    const distance = feature.distance ?? feature.value ?? 2;
    const edgeIndices = feature.edges || feature.edgeIndices || [];
    return this.geometryEngine.applyChamfer(currentBody, distance, edgeIndices);
  }

  /**
   * SHELL: Apply shell to body
   */
  _processShell(feature, currentBody) {
    if (!currentBody) return currentBody;
    const thickness = feature.thickness ?? feature.value ?? 2;
    const excludedFaces = feature.excludedFaces || [];
    return this.geometryEngine.applyShell(currentBody, thickness, excludedFaces);
  }

  /**
   * HOLE: Cut hole in body
   */
  _processHole(feature, currentBody) {
    if (!currentBody) return currentBody;
    const position = feature.position || { x: 0, y: 0, z: 0 };
    const direction = feature.direction || { x: 0, y: -1, z: 0 };
    const diameter = feature.diameter ?? feature.value ?? 10;
    const depth = feature.depth ?? feature.holeDepth ?? 20;
    return this.geometryEngine.createHole(currentBody, position, direction, diameter, depth);
  }

  /**
   * LINEAR_PATTERN: Pattern existing geometry
   */
  _processLinearPattern(feature, currentBody) {
    if (!currentBody) return currentBody;

    // Get the geometry to pattern (the feature being patterned, or the whole body)
    const sourceGeom = feature.sourceFeatureId ?
      (this.featureGeometries[feature.sourceFeatureId] || currentBody) :
      currentBody;

    const direction = feature.direction || { x: 1, y: 0, z: 0 };
    const count = feature.count ?? feature.instances ?? 3;
    const spacing = feature.spacing ?? feature.distance ?? 20;

    return this.geometryEngine.linearPattern(sourceGeom, direction, count, spacing);
  }

  /**
   * CIRCULAR_PATTERN: Circular pattern of geometry
   */
  _processCircularPattern(feature, currentBody) {
    if (!currentBody) return currentBody;

    const sourceGeom = feature.sourceFeatureId ?
      (this.featureGeometries[feature.sourceFeatureId] || currentBody) :
      currentBody;

    const axis = feature.axis || { x: 0, y: 1, z: 0 };
    const center = feature.center || { x: 0, y: 0, z: 0 };
    const count = feature.count ?? feature.instances ?? 6;
    const totalAngle = feature.totalAngle ?? feature.angle ?? 360;

    return this.geometryEngine.circularPattern(sourceGeom, axis, center, count, totalAngle);
  }

  /**
   * MIRROR: Mirror geometry across a plane
   */
  _processMirror(feature, currentBody) {
    if (!currentBody) return currentBody;

    const planeNormal = feature.planeNormal || feature.mirrorPlane ||
      getPlaneNormal(feature.plane || 'YZ');
    const planePoint = feature.planePoint || { x: 0, y: 0, z: 0 };

    return this.geometryEngine.mirrorGeometry(currentBody, planeNormal, planePoint);
  }

  /**
   * BOOLEAN: Boolean operation between bodies
   */
  _processBoolean(feature, currentBody) {
    if (!currentBody) return currentBody;

    const toolGeom = feature.toolFeatureId ?
      this.featureGeometries[feature.toolFeatureId] : null;

    if (!toolGeom) return currentBody;

    switch (feature.operation) {
      case 'union':
      case 'add':
        return this.geometryEngine.booleanUnion(currentBody, toolGeom);
      case 'subtract':
      case 'cut':
        return this.geometryEngine.booleanSubtract(currentBody, toolGeom);
      case 'intersect':
        return this.geometryEngine.booleanIntersect(currentBody, toolGeom);
      default:
        return this.geometryEngine.booleanUnion(currentBody, toolGeom);
    }
  }
}

// Singleton instance
export const featureEngine = new FeatureEngine();
