// CADWorks Pro - Industrial-Strength Multi-Body Assembly Mate Engine & Manager
// Features:
// - Comprehensive Kinematic Mates:
//   * Standard: Coincident, Concentric, Parallel, Perpendicular, Distance, Angle
//   * Advanced: Tangent (cylinder-plane, cylinder-cylinder), Width (centers tab between boundary faces),
//               Path (restrains component along 3D guide curve polyline)
// - Numerical Multi-Body Solver:
//   * Full 6-DOF per free component (3D translation + unit quaternion rotation)
//   * Quaternion rotation and translation satisfaction loop handling branching chains and closed loops
//   * Symmetric constraint relaxation for unpinned bodies
//   * Degeneracy-free quaternion orientation (handles 180° anti-parallel and colinear vectors)
// - Exploded View Generator:
//   * Calculates configurable exploded distances along kinematic motion axes
//   * Generates 3D leader lines with trajectory polyline segments
//   * Production-grade handling for 0, 1, and N components without division by zero

import * as THREE from 'three';
import { generateId } from '../utils/math.js';
import { MATE_TYPES } from '../utils/constants.js';

/**
 * Robust quaternion construction from two direction vectors.
 * Handles exact colinearity (0°), exact anti-parallelism (180°),
 * and degenerate zero-length vectors without producing NaNs or singularities.
 * @param {THREE.Vector3} vFrom - Source vector
 * @param {THREE.Vector3} vTo - Target vector
 * @returns {THREE.Quaternion}
 */
export function safeQuaternionFromVectors(vFrom, vTo) {
  const q = new THREE.Quaternion();
  if (!vFrom || !vTo) return q;

  const len1Sq = vFrom.lengthSq();
  const len2Sq = vTo.lengthSq();
  if (len1Sq < 1e-12 || len2Sq < 1e-12 || !Number.isFinite(len1Sq) || !Number.isFinite(len2Sq)) {
    return q; // Identity
  }

  const u1 = vFrom.clone().multiplyScalar(1 / Math.sqrt(len1Sq));
  const u2 = vTo.clone().multiplyScalar(1 / Math.sqrt(len2Sq));

  const dot = Math.max(-1.0, Math.min(1.0, u1.dot(u2)));

  // Case 1: Colinear in same direction (0 degrees)
  if (dot > 0.9999999) {
    return q; // Identity
  }

  // Case 2: Exactly or nearly opposite (180 degrees anti-parallel)
  if (dot < -0.9999999) {
    // Find an orthogonal axis to rotate 180 degrees around
    let ortho = new THREE.Vector3(1, 0, 0).cross(u1);
    if (ortho.lengthSq() < 1e-4) {
      ortho = new THREE.Vector3(0, 1, 0).cross(u1);
    }
    if (ortho.lengthSq() < 1e-4) {
      ortho = new THREE.Vector3(0, 0, 1).cross(u1);
    }
    ortho.normalize();
    q.setFromAxisAngle(ortho, Math.PI);
    return q;
  }

  // Standard case: cross product axis with angle
  const cross = new THREE.Vector3().crossVectors(u1, u2);
  const w = 1.0 + dot;
  q.set(cross.x, cross.y, cross.z, w).normalize();
  return q;
}

export class AssemblyComponent {
  constructor(id, name, geometry, isFixed = false) {
    this.id = id || generateId('comp');
    this.name = name || 'Component';
    this.baseGeometry = geometry ? geometry.clone() : new THREE.BoxGeometry(20, 20, 20);
    this.geometry = this.baseGeometry.clone();
    this.isFixed = !!isFixed;

    this.position = new THREE.Vector3(0, 0, 0);
    this.quaternion = new THREE.Quaternion(0, 0, 0, 1);
    this.scale = new THREE.Vector3(1, 1, 1);
    this.matrix = new THREE.Matrix4();
    this.updateMatrix();
  }

  updateMatrix() {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.geometry = this.baseGeometry.clone();
    this.geometry.applyMatrix4(this.matrix);
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingBox();
  }

  /**
   * Get world-space normal and center point of a reference face
   * @param {string|object} faceRef - 'top'|'bottom'|'front'|'back'|'right'|'left' or { point, normal }
   * @returns {{ point: THREE.Vector3, normal: THREE.Vector3 }}
   */
  getFaceReference(faceRef = 'top') {
    if (typeof faceRef === 'object' && faceRef !== null) {
      const p = (faceRef.point instanceof THREE.Vector3
        ? faceRef.point.clone()
        : new THREE.Vector3(faceRef.point?.x || 0, faceRef.point?.y || 0, faceRef.point?.z || 0)
      ).applyMatrix4(this.matrix);

      let n = faceRef.normal instanceof THREE.Vector3
        ? faceRef.normal.clone()
        : new THREE.Vector3(faceRef.normal?.x || 0, faceRef.normal?.y !== undefined ? faceRef.normal.y : 1, faceRef.normal?.z || 0);

      if (n.lengthSq() < 1e-8 || !Number.isFinite(n.lengthSq())) {
        n.set(0, 1, 0);
      }
      n.applyQuaternion(this.quaternion).normalize();
      return { point: p, normal: n };
    }

    if (!this.baseGeometry) {
      return { point: this.position.clone(), normal: new THREE.Vector3(0, 1, 0) };
    }

    this.baseGeometry.computeBoundingBox();
    const box = this.baseGeometry.boundingBox || new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10));
    const center = new THREE.Vector3();
    box.getCenter(center);

    let localNormal = new THREE.Vector3(0, 1, 0);
    let localPoint = center.clone();

    switch (String(faceRef || 'top').toLowerCase()) {
      case 'top':
        localNormal.set(0, 1, 0);
        localPoint.y = box.max.y;
        break;
      case 'bottom':
        localNormal.set(0, -1, 0);
        localPoint.y = box.min.y;
        break;
      case 'front':
        localNormal.set(0, 0, 1);
        localPoint.z = box.max.z;
        break;
      case 'back':
        localNormal.set(0, 0, -1);
        localPoint.z = box.min.z;
        break;
      case 'right':
        localNormal.set(1, 0, 0);
        localPoint.x = box.max.x;
        break;
      case 'left':
        localNormal.set(-1, 0, 0);
        localPoint.x = box.min.x;
        break;
      default:
        localNormal.set(0, 1, 0);
        localPoint.y = box.max.y;
        break;
    }

    const worldPoint = localPoint.clone().applyMatrix4(this.matrix);
    let worldNormal = localNormal.clone().applyQuaternion(this.quaternion);
    if (worldNormal.lengthSq() < 1e-8 || !Number.isFinite(worldNormal.lengthSq())) {
      worldNormal.set(0, 1, 0);
    } else {
      worldNormal.normalize();
    }
    return { point: worldPoint, normal: worldNormal };
  }

  /**
   * Get opposing face name for bounding-box faces
   */
  getOpposingFaceName(faceName = 'top') {
    switch (String(faceName || 'top').toLowerCase()) {
      case 'top': return 'bottom';
      case 'bottom': return 'top';
      case 'left': return 'right';
      case 'right': return 'left';
      case 'front': return 'back';
      case 'back': return 'front';
      default: return 'bottom';
    }
  }

  /**
   * Get world-space cylindrical axis reference
   * @param {string|object} axisRef - 'x'|'y'|'z'|'cylinder' or { point, axis, radius }
   * @returns {{ point: THREE.Vector3, axis: THREE.Vector3, radius: number }}
   */
  getAxisReference(axisRef = 'z') {
    if (!this.baseGeometry) {
      return { point: this.position.clone(), axis: new THREE.Vector3(0, 0, 1), radius: 10 };
    }

    this.baseGeometry.computeBoundingBox();
    const box = this.baseGeometry.boundingBox || new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10));
    const center = new THREE.Vector3();
    box.getCenter(center);

    let localAxis = new THREE.Vector3(0, 0, 1);
    let localPoint = center.clone();
    let radius = 10;

    if (typeof axisRef === 'object' && axisRef !== null) {
      if (axisRef.axis && axisRef.axis instanceof THREE.Vector3) localAxis.copy(axisRef.axis);
      else if (axisRef.axis) localAxis.set(axisRef.axis.x || 0, axisRef.axis.y || 0, axisRef.axis.z !== undefined ? axisRef.axis.z : 1);

      if (axisRef.point && axisRef.point instanceof THREE.Vector3) localPoint.copy(axisRef.point);
      else if (axisRef.point) localPoint.set(axisRef.point.x || 0, axisRef.point.y || 0, axisRef.point.z || 0);

      if (axisRef.radius !== undefined && Number.isFinite(axisRef.radius)) radius = axisRef.radius;
    } else {
      const name = String(axisRef || 'z').toLowerCase();
      if (name === 'x') {
        localAxis.set(1, 0, 0);
        radius = Math.min(box.max.y - box.min.y, box.max.z - box.min.z) * 0.5;
      } else if (name === 'y') {
        localAxis.set(0, 1, 0);
        radius = Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;
      } else {
        localAxis.set(0, 0, 1);
        radius = Math.min(box.max.x - box.min.x, box.max.y - box.min.y) * 0.5;
      }
    }

    if (localAxis.lengthSq() < 1e-8 || !Number.isFinite(localAxis.lengthSq())) {
      localAxis.set(0, 0, 1);
    }

    const worldPoint = localPoint.clone().applyMatrix4(this.matrix);
    let worldAxis = localAxis.clone().applyQuaternion(this.quaternion);
    if (worldAxis.lengthSq() < 1e-8 || !Number.isFinite(worldAxis.lengthSq())) {
      worldAxis.set(0, 0, 1);
    } else {
      worldAxis.normalize();
    }
    return { point: worldPoint, axis: worldAxis, radius: Math.max(1e-3, Number.isFinite(radius) ? radius : 10) };
  }

  /**
   * Get cylindrical surface reference
   */
  getCylinderReference(axisRef = 'z') {
    return this.getAxisReference(axisRef);
  }
}

export class AssemblyManager {
  constructor() {
    this.components = [];
    this.mates = [];
  }

  /**
   * Insert component into assembly
   */
  insertComponent(name, geometry, isFixed = null) {
    const shouldFix = isFixed !== null ? isFixed : this.components.length === 0;
    const comp = new AssemblyComponent(generateId('comp'), name, geometry, shouldFix);
    this.components.push(comp);
    return comp;
  }

  /**
   * Remove a component and clean up any dangling mates
   */
  removeComponent(componentId) {
    this.components = this.components.filter(c => c.id !== componentId);
    this.mates = this.mates.filter(m => m.comp1Id !== componentId && m.comp2Id !== componentId);
    this.solve();
  }

  /**
   * Add a kinematic mate between two components
   * @param {string} type - MATE_TYPES.* (coincident, concentric, parallel, perpendicular, distance, angle, tangent, width, path)
   * @param {string} comp1Id - Source component ID
   * @param {string|object|Array} ref1 - Reference face/axis/boundary
   * @param {string} comp2Id - Target component ID
   * @param {string|object|Array} ref2 - Reference face/axis/tab
   * @param {number} offset - Linear or angular offset value
   * @param {object} options - Advanced options (e.g. pathPoints, secondary references)
   */
  addMate(type, comp1Id, ref1, comp2Id, ref2, offset = 0, options = {}) {
    const mate = {
      id: generateId('mate'),
      type: type || MATE_TYPES.COINCIDENT,
      comp1Id,
      ref1: ref1 || 'top',
      comp2Id,
      ref2: ref2 || 'bottom',
      offset: Number.isFinite(offset) ? offset : 0,
      ref1Secondary: options.ref1Secondary || (Array.isArray(ref1) && ref1.length > 1 ? ref1[1] : null),
      ref2Secondary: options.ref2Secondary || (Array.isArray(ref2) && ref2.length > 1 ? ref2[1] : null),
      pathPoints: options.pathPoints || options.points || null,
      axis: options.axis || null,
      angle: options.angle !== undefined ? options.angle : offset,
    };

    if (Array.isArray(ref1)) mate.ref1 = ref1[0];
    if (Array.isArray(ref2)) mate.ref2 = ref2[0];

    this.mates.push(mate);
    this.solve();
    return mate;
  }

  removeMate(mateId) {
    this.mates = this.mates.filter(m => m.id !== mateId);
    this.solve();
  }

  /**
   * Numerically solve all assembly mates simultaneously using a multi-body
   * satisfaction loop with quaternion rotation and translation updates.
   * @param {number} maxIterations - Maximum satisfaction cycles
   * @param {number} tolerance - Residual convergence threshold
   * @returns {{ components: AssemblyComponent[], error: number, converged: boolean, iterations: number }}
   */
  solve(maxIterations = 50, tolerance = 1e-4) {
    if (!this.components || this.components.length === 0) {
      return {
        components: [],
        error: 0,
        converged: true,
        iterations: 0,
      };
    }

    if (!this.mates || this.mates.length === 0) {
      this.components.forEach(c => c.updateMatrix());
      return {
        components: this.components,
        error: 0,
        converged: true,
        iterations: 0,
      };
    }

    const compMap = new Map();
    this.components.forEach(c => compMap.set(c.id, c));
    let maxError = 0;
    let iter = 0;

    for (iter = 0; iter < maxIterations; iter++) {
      maxError = 0;

      for (const mate of this.mates) {
        // Robust null checks: handle mate referencing missing or deleted components
        const c1 = compMap.get(mate.comp1Id);
        const c2 = compMap.get(mate.comp2Id);
        if (!c1 || !c2) continue;
        if (c1.isFixed && c2.isFixed) continue;

        // Weights for symmetric displacement distribution
        let w1 = 0;
        let w2 = 0;
        if (c1.isFixed && !c2.isFixed) {
          w1 = 0;
          w2 = 1.0;
        } else if (!c1.isFixed && c2.isFixed) {
          w1 = 1.0;
          w2 = 0;
        } else {
          w1 = 0.5;
          w2 = 0.5;
        }

        const type = String(mate.type).toLowerCase();

        switch (type) {
          // ----------------------------------------------------
          // 1. COINCIDENT MATE (face-to-face contact or point/axis)
          // ----------------------------------------------------
          case MATE_TYPES.COINCIDENT:
          case 'coincident': {
            const f1 = c1.getFaceReference(mate.ref1);
            const f2 = c2.getFaceReference(mate.ref2);

            // Align normals to oppose each other safely
            const targetNormal2 = f1.normal.clone().negate();
            const rotDelta = safeQuaternionFromVectors(f2.normal, targetNormal2);
            this._applyRotationDelta(c1, c2, rotDelta, w1, w2);

            // Eliminate gap along normal
            const f1_u = c1.getFaceReference(mate.ref1);
            const f2_u = c2.getFaceReference(mate.ref2);
            const dist = f2_u.point.clone().sub(f1_u.point).dot(f1_u.normal);
            const gapError = Math.abs(dist + mate.offset);
            const angleError = f1_u.normal.angleTo(f2_u.normal.clone().negate());
            const mateError = Math.max(gapError, Number.isFinite(angleError) ? angleError : 0);
            if (mateError > maxError) maxError = mateError;

            const shift = f1_u.normal.clone().multiplyScalar(-(dist + mate.offset));
            this._applyTranslationDelta(c1, c2, shift, w1, w2);
            break;
          }

          // ----------------------------------------------------
          // 2. CONCENTRIC MATE (axis collinear alignment)
          // ----------------------------------------------------
          case MATE_TYPES.CONCENTRIC:
          case 'concentric': {
            const a1 = c1.getAxisReference(mate.ref1);
            const a2 = c2.getAxisReference(mate.ref2);

            // Align axis directions safely without 180 deg degeneracy
            const rotDelta = safeQuaternionFromVectors(a2.axis, a1.axis);
            this._applyRotationDelta(c1, c2, rotDelta, w1, w2);

            // Align axis points perpendicularly to axis
            const a1_u = c1.getAxisReference(mate.ref1);
            const a2_u = c2.getAxisReference(mate.ref2);
            const deltaP = a2_u.point.clone().sub(a1_u.point);
            const parallelProj = a1_u.axis.clone().multiplyScalar(deltaP.dot(a1_u.axis));
            const perpOffset = deltaP.sub(parallelProj);

            const perpError = perpOffset.length();
            const axisAngleError = a1_u.axis.angleTo(a2_u.axis);
            const mateError = Math.max(perpError, Number.isFinite(axisAngleError) ? axisAngleError : 0);
            if (mateError > maxError) maxError = mateError;

            const shift = perpOffset.clone().negate();
            this._applyTranslationDelta(c1, c2, shift, w1, w2);
            break;
          }

          // ----------------------------------------------------
          // 3. PARALLEL MATE (normals or axes parallel)
          // ----------------------------------------------------
          case MATE_TYPES.PARALLEL:
          case 'parallel': {
            const f1 = c1.getFaceReference(mate.ref1);
            const f2 = c2.getFaceReference(mate.ref2);

            // Align f2 normal with f1 normal or -f1 normal (closest orientation)
            const dot = f2.normal.dot(f1.normal);
            const targetN = dot >= 0 ? f1.normal.clone() : f1.normal.clone().negate();
            const rotDelta = safeQuaternionFromVectors(f2.normal, targetN);
            this._applyRotationDelta(c1, c2, rotDelta, w1, w2);

            const f1_u = c1.getFaceReference(mate.ref1);
            const f2_u = c2.getFaceReference(mate.ref2);
            const a1 = f1_u.normal.angleTo(f2_u.normal);
            const a2 = f1_u.normal.angleTo(f2_u.normal.clone().negate());
            const angleErr = Math.min(Number.isFinite(a1) ? a1 : 0, Number.isFinite(a2) ? a2 : 0);
            if (angleErr > maxError) maxError = angleErr;
            break;
          }

          // ----------------------------------------------------
          // 4. PERPENDICULAR MATE (normals or axes perpendicular)
          // ----------------------------------------------------
          case MATE_TYPES.PERPENDICULAR:
          case 'perpendicular': {
            const f1 = c1.getFaceReference(mate.ref1);
            const f2 = c2.getFaceReference(mate.ref2);

            // Make f2 normal perpendicular to f1 normal
            const dot = f2.normal.dot(f1.normal);
            let perpTarget = f2.normal.clone().sub(f1.normal.clone().multiplyScalar(dot));
            if (perpTarget.lengthSq() < 1e-6) {
              perpTarget = new THREE.Vector3(1, 0, 0).cross(f1.normal);
              if (perpTarget.lengthSq() < 1e-6) perpTarget = new THREE.Vector3(0, 1, 0).cross(f1.normal);
              if (perpTarget.lengthSq() < 1e-6) perpTarget = new THREE.Vector3(0, 0, 1).cross(f1.normal);
            }
            if (perpTarget.lengthSq() < 1e-8) {
              perpTarget.set(0, 1, 0);
            }
            perpTarget.normalize();

            const rotDelta = safeQuaternionFromVectors(f2.normal, perpTarget);
            this._applyRotationDelta(c1, c2, rotDelta, w1, w2);

            const f1_u = c1.getFaceReference(mate.ref1);
            const f2_u = c2.getFaceReference(mate.ref2);
            const perpErr = Math.abs(f1_u.normal.dot(f2_u.normal));
            if (perpErr > maxError) maxError = perpErr;
            break;
          }

          // ----------------------------------------------------
          // 5. DISTANCE MATE (planar offset distance)
          // ----------------------------------------------------
          case MATE_TYPES.DISTANCE:
          case 'distance': {
            const f1 = c1.getFaceReference(mate.ref1);
            const f2 = c2.getFaceReference(mate.ref2);

            const targetNormal2 = f1.normal.clone().negate();
            const rotDelta = safeQuaternionFromVectors(f2.normal, targetNormal2);
            this._applyRotationDelta(c1, c2, rotDelta, w1, w2);

            const f1_u = c1.getFaceReference(mate.ref1);
            const f2_u = c2.getFaceReference(mate.ref2);
            const currentDist = f2_u.point.clone().sub(f1_u.point).dot(f1_u.normal);
            const targetDist = mate.offset;
            const distError = Math.abs(currentDist - targetDist);
            const angleError = f1_u.normal.angleTo(f2_u.normal.clone().negate());
            const mateError = Math.max(distError, Number.isFinite(angleError) ? angleError : 0);
            if (mateError > maxError) maxError = mateError;

            const shift = f1_u.normal.clone().multiplyScalar(targetDist - currentDist);
            this._applyTranslationDelta(c1, c2, shift, w1, w2);
            break;
          }

          // ----------------------------------------------------
          // 6. ANGLE MATE (angular relation between faces or axes)
          // ----------------------------------------------------
          case MATE_TYPES.ANGLE:
          case 'angle': {
            const f1 = c1.getFaceReference(mate.ref1);
            const f2 = c2.getFaceReference(mate.ref2);

            const targetDeg = mate.angle !== undefined ? mate.angle : (mate.offset || 0);
            const targetRad = (targetDeg * Math.PI) / 180;
            const rawAngle = f1.normal.angleTo(f2.normal);
            const currentAngle = Number.isFinite(rawAngle) ? rawAngle : 0;

            const angleError = Math.abs(currentAngle - targetRad);
            if (angleError > maxError) maxError = angleError;

            let rotAxis = f1.normal.clone().cross(f2.normal);
            if (rotAxis.lengthSq() < 1e-6) {
              rotAxis = new THREE.Vector3(0, 1, 0).cross(f1.normal);
              if (rotAxis.lengthSq() < 1e-6) rotAxis = new THREE.Vector3(1, 0, 0).cross(f1.normal);
              if (rotAxis.lengthSq() < 1e-6) rotAxis = new THREE.Vector3(0, 0, 1).cross(f1.normal);
            }
            if (rotAxis.lengthSq() < 1e-8) {
              rotAxis.set(0, 1, 0);
            }
            rotAxis.normalize();

            const deltaAngle = targetRad - currentAngle;
            const rotDelta = new THREE.Quaternion().setFromAxisAngle(rotAxis, deltaAngle);
            this._applyRotationDelta(c1, c2, rotDelta, w1, w2);
            break;
          }

          // ----------------------------------------------------
          // 7. TANGENT MATE (cylinder surface tangent to plane/cylinder)
          // ----------------------------------------------------
          case MATE_TYPES.TANGENT:
          case 'tangent': {
            let cylComp = c1;
            let planeComp = c2;
            let cylRef = mate.ref1;
            let planeRef = mate.ref2;
            let inverted = false;

            if (mate.ref2 === 'cylinder' || mate.ref2 === 'z' || mate.ref2 === 'axis') {
              cylComp = c2;
              planeComp = c1;
              cylRef = mate.ref2;
              planeRef = mate.ref1;
              inverted = true;
            }

            const cyl = cylComp.getAxisReference(cylRef);
            const plane = planeComp.getFaceReference(planeRef);

            // 1. Cylinder axis must be perpendicular to plane normal
            const dot = cyl.axis.dot(plane.normal);
            let perpAxis = cyl.axis.clone().sub(plane.normal.clone().multiplyScalar(dot));
            if (perpAxis.lengthSq() > 1e-6) {
              perpAxis.normalize();
              const rotDelta = safeQuaternionFromVectors(cyl.axis, perpAxis);
              if (!inverted) this._applyRotationDelta(c1, c2, rotDelta, 1.0, 0);
              else this._applyRotationDelta(c1, c2, rotDelta, 0, 1.0);
            }

            // 2. Centerline distance from plane equals cylinder radius + offset
            const cyl_u = cylComp.getAxisReference(cylRef);
            const plane_u = planeComp.getFaceReference(planeRef);
            const d = cyl_u.point.clone().sub(plane_u.point).dot(plane_u.normal);
            const targetD = (d >= 0 ? 1 : -1) * (cyl_u.radius + mate.offset);

            const tanError = Math.abs(Math.abs(d) - cyl_u.radius - mate.offset);
            if (tanError > maxError) maxError = tanError;

            const shift = plane_u.normal.clone().multiplyScalar(targetD - d);
            if (!inverted) {
              this._applyTranslationDelta(c1, c2, shift.clone().negate(), w1, w2);
            } else {
              this._applyTranslationDelta(c1, c2, shift, w1, w2);
            }
            break;
          }

          // ----------------------------------------------------
          // 8. WIDTH MATE (centers tab symmetrically between two boundary faces)
          // ----------------------------------------------------
          case MATE_TYPES.WIDTH:
          case 'width': {
            const ref1A = mate.ref1 || 'left';
            const ref1B = mate.ref1Secondary || c1.getOpposingFaceName(ref1A);
            const f1A = c1.getFaceReference(ref1A);
            const f1B = c1.getFaceReference(ref1B);

            const ref2A = mate.ref2 || 'left';
            const ref2B = mate.ref2Secondary || c2.getOpposingFaceName(ref2A);
            const f2A = c2.getFaceReference(ref2A);
            const f2B = c2.getFaceReference(ref2B);

            const midBound = f1A.point.clone().add(f1B.point).multiplyScalar(0.5);
            const boundNormal = f1A.normal.clone();

            // Tab face normal parallel to boundary face normal
            const rotDelta = safeQuaternionFromVectors(f2A.normal, boundNormal);
            this._applyRotationDelta(c1, c2, rotDelta, w1, w2);

            // Tab midpoint centered between boundary faces along boundNormal
            const f2A_u = c2.getFaceReference(ref2A);
            const f2B_u = c2.getFaceReference(ref2B);
            const midTab = f2A_u.point.clone().add(f2B_u.point).multiplyScalar(0.5);

            const gapCenter = midTab.clone().sub(midBound).dot(boundNormal);
            const widthError = Math.abs(gapCenter + mate.offset);
            if (widthError > maxError) maxError = widthError;

            const shift = boundNormal.clone().multiplyScalar(-(gapCenter + mate.offset));
            this._applyTranslationDelta(c1, c2, shift, w1, w2);
            break;
          }

          // ----------------------------------------------------
          // 9. PATH MATE (restrains component along guide curve polyline)
          // ----------------------------------------------------
          case MATE_TYPES.PATH:
          case 'path': {
            let points = mate.pathPoints;
            if (!points || points.length < 2) {
              c1.baseGeometry.computeBoundingBox();
              const b = c1.baseGeometry.boundingBox || new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10));
              points = [
                new THREE.Vector3(b.min.x, b.max.y, 0).applyMatrix4(c1.matrix),
                new THREE.Vector3(b.max.x, b.max.y, 0).applyMatrix4(c1.matrix),
              ];
            } else {
              points = points.map(p => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z)));
            }

            const targetPoint = c2.position.clone();
            let closestPoint = points[0].clone();
            let minDistSq = Infinity;

            for (let s = 0; s < points.length - 1; s++) {
              const pA = points[s];
              const pB = points[s + 1];
              const seg = pB.clone().sub(pA);
              const segLenSq = seg.lengthSq();

              let t = 0;
              if (segLenSq > 1e-8) {
                t = targetPoint.clone().sub(pA).dot(seg) / segLenSq;
                t = Math.max(0, Math.min(1, t));
              }

              const proj = pA.clone().add(seg.multiplyScalar(t));
              const distSq = proj.distanceToSquared(targetPoint);
              if (distSq < minDistSq) {
                minDistSq = distSq;
                closestPoint = proj;
              }
            }

            const pathError = Math.sqrt(minDistSq);
            if (pathError > maxError) maxError = pathError;

            const shift = closestPoint.clone().sub(targetPoint);
            this._applyTranslationDelta(c1, c2, shift, w1, w2);
            break;
          }

          default:
            break;
        }
      }

      if (maxError < tolerance) break;
    }

    // Refresh all matrices
    this.components.forEach(c => c.updateMatrix());

    return {
      components: this.components,
      error: maxError,
      converged: maxError < tolerance,
      iterations: iter,
    };
  }

  /**
   * Helper to distribute rotation delta between source and target components
   */
  _applyRotationDelta(c1, c2, rotDelta, w1, w2) {
    if (!rotDelta || !Number.isFinite(rotDelta.x) || !Number.isFinite(rotDelta.y) || !Number.isFinite(rotDelta.z) || !Number.isFinite(rotDelta.w)) {
      return;
    }

    if (w2 > 0 && !c2.isFixed) {
      if (w2 === 1.0) {
        c2.quaternion.premultiply(rotDelta).normalize();
      } else {
        const halfRot = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), rotDelta, w2);
        c2.quaternion.premultiply(halfRot).normalize();
      }
      c2.updateMatrix();
    }

    if (w1 > 0 && !c1.isFixed) {
      const invRot = rotDelta.clone().invert();
      if (w1 === 1.0) {
        c1.quaternion.premultiply(invRot).normalize();
      } else {
        const halfRot = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), invRot, w1);
        c1.quaternion.premultiply(halfRot).normalize();
      }
      c1.updateMatrix();
    }
  }

  /**
   * Helper to distribute translation delta between source and target components
   */
  _applyTranslationDelta(c1, c2, shift, w1, w2) {
    if (!shift || !Number.isFinite(shift.x) || !Number.isFinite(shift.y) || !Number.isFinite(shift.z)) {
      return;
    }

    if (w2 > 0 && !c2.isFixed) {
      c2.position.add(shift.clone().multiplyScalar(w2));
      c2.updateMatrix();
    }
    if (w1 > 0 && !c1.isFixed) {
      c1.position.sub(shift.clone().multiplyScalar(w1));
      c1.updateMatrix();
    }
  }

  /**
   * Calculate configurable exploded view distances along kinematic motion axes with leader lines.
   * Robust handling for 0 components or 1 component without dividing by zero.
   * @param {number|object} options - Distance or { distance, axis, leaderLines }
   * @returns {Array} List of exploded component states with .leaderLines attached
   */
  createExplodedView(options = 40) {
    let baseDist = 40;
    let explicitAxis = null;
    let generateLeaderLines = true;

    if (typeof options === 'number') {
      baseDist = options;
    } else if (typeof options === 'object' && options !== null) {
      if (options.distance !== undefined) baseDist = options.distance;
      if (options.axis !== undefined) explicitAxis = options.axis;
      if (options.leaderLines !== undefined) generateLeaderLines = options.leaderLines;
    }

    // 0 components guard: return clean empty structure without division by zero
    if (!this.components || this.components.length === 0) {
      const empty = [];
      empty.leaderLines = [];
      empty.distance = baseDist;
      empty.components = empty;
      return empty;
    }

    // 1 component guard: single body cannot explode relative to anything
    if (this.components.length === 1) {
      const singleComp = this.components[0];
      const results = [{
        id: singleComp.id,
        name: singleComp.name,
        position: singleComp.position.clone(),
        originalPosition: singleComp.position.clone(),
        explosionAxis: new THREE.Vector3(0, 0, 0),
        distance: 0,
      }];
      results.leaderLines = [];
      results.distance = 0;
      results.components = results;
      return results;
    }

    // Compute assembly center for >= 2 components
    const assemblyCenter = new THREE.Vector3();
    let fixedCentroid = null;
    for (const comp of this.components) {
      assemblyCenter.add(comp.position);
      if (comp.isFixed && !fixedCentroid) {
        fixedCentroid = comp.position.clone();
      }
    }
    assemblyCenter.multiplyScalar(1 / this.components.length);
    const refCenter = fixedCentroid || assemblyCenter;

    const leaderLines = [];
    const results = this.components.map((comp, idx) => {
      if (comp.isFixed) {
        return {
          id: comp.id,
          name: comp.name,
          position: comp.position.clone(),
          originalPosition: comp.position.clone(),
          explosionAxis: new THREE.Vector3(0, 0, 0),
          distance: 0,
        };
      }

      // Determine kinematic motion axis
      let motionAxis = new THREE.Vector3(0, 1, 0);

      if (explicitAxis) {
        if (explicitAxis instanceof THREE.Vector3) motionAxis.copy(explicitAxis).normalize();
        else if (explicitAxis === 'x') motionAxis.set(1, 0, 0);
        else if (explicitAxis === 'y') motionAxis.set(0, 1, 0);
        else if (explicitAxis === 'z') motionAxis.set(0, 0, 1);
      } else {
        // Find primary mate connected to this component to extract motion axis
        const mate = this.mates.find(m => m.comp1Id === comp.id || m.comp2Id === comp.id);
        if (mate) {
          const isComp2 = mate.comp2Id === comp.id;
          const ref = isComp2 ? mate.ref2 : mate.ref1;
          const type = String(mate.type).toLowerCase();

          if (type === MATE_TYPES.CONCENTRIC || type === 'concentric') {
            const axisRef = comp.getAxisReference(ref);
            motionAxis.copy(axisRef.axis).normalize();
          } else {
            const faceRef = comp.getFaceReference(ref);
            motionAxis.copy(faceRef.normal).normalize();
          }
        } else {
          // Radial vector from reference centroid
          motionAxis.subVectors(comp.position, refCenter);
          if (motionAxis.lengthSq() < 1e-4) {
            const angle = (idx * Math.PI * 2) / Math.max(1, this.components.length - 1);
            motionAxis.set(Math.cos(angle), 0.5, Math.sin(angle));
          }
          motionAxis.normalize();
        }
      }

      const stepDist = baseDist * Math.max(1, idx);
      const explodedPos = comp.position.clone().add(motionAxis.clone().multiplyScalar(stepDist));

      if (generateLeaderLines) {
        leaderLines.push({
          componentId: comp.id,
          componentName: comp.name,
          start: comp.position.clone(),
          end: explodedPos.clone(),
          points: [comp.position.clone(), explodedPos.clone()],
        });
      }

      return {
        id: comp.id,
        name: comp.name,
        position: explodedPos,
        originalPosition: comp.position.clone(),
        explosionAxis: motionAxis,
        distance: stepDist,
      };
    });

    // Attach leader lines & metadata for full compatibility
    results.leaderLines = leaderLines;
    results.distance = baseDist;
    results.components = results;

    return results;
  }

  generateExplodedView(options = 40) {
    return this.createExplodedView(options);
  }
}

export const assemblyManager = new AssemblyManager();
export default AssemblyManager;
