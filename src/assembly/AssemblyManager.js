// CADWorks Pro - Professional Assembly Mate Solver & Manager
import * as THREE from 'three';
import { generateId } from '../utils/math.js';
import { MATE_TYPES } from '../utils/constants.js';

export class AssemblyComponent {
  constructor(id, name, geometry, isFixed = false) {
    this.id = id || generateId('comp');
    this.name = name || 'Component';
    this.baseGeometry = geometry ? geometry.clone() : new THREE.BoxGeometry(20, 20, 20);
    this.geometry = this.baseGeometry.clone();
    this.isFixed = isFixed;

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

  // Get world-space normal and center point of a reference face
  getFaceReference(faceName = 'top') {
    this.baseGeometry.computeBoundingBox();
    const box = this.baseGeometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);

    let localNormal = new THREE.Vector3(0, 1, 0);
    let localPoint = center.clone();

    switch (faceName.toLowerCase()) {
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
        break;
    }

    const worldPoint = localPoint.clone().applyMatrix4(this.matrix);
    const worldNormal = localNormal.clone().applyQuaternion(this.quaternion).normalize();
    return { point: worldPoint, normal: worldNormal };
  }

  // Get world-space cylindrical axis reference
  getAxisReference(axisName = 'z') {
    this.baseGeometry.computeBoundingBox();
    const center = new THREE.Vector3();
    this.baseGeometry.boundingBox.getCenter(center);

    let localAxis = new THREE.Vector3(0, 0, 1);
    if (axisName === 'x') localAxis.set(1, 0, 0);
    else if (axisName === 'y') localAxis.set(0, 1, 0);

    const worldPoint = center.clone().applyMatrix4(this.matrix);
    const worldAxis = localAxis.clone().applyQuaternion(this.quaternion).normalize();
    return { point: worldPoint, axis: worldAxis };
  }
}

export class AssemblyManager {
  constructor() {
    this.components = [];
    this.mates = [];
  }

  insertComponent(name, geometry, isFixed = null) {
    // First component inserted is fixed at origin by default
    const shouldFix = isFixed !== null ? isFixed : this.components.length === 0;
    const comp = new AssemblyComponent(generateId('comp'), name, geometry, shouldFix);
    this.components.push(comp);
    return comp;
  }

  addMate(type, comp1Id, ref1, comp2Id, ref2, offset = 0) {
    const mate = {
      id: generateId('mate'),
      type: type || MATE_TYPES.COINCIDENT,
      comp1Id,
      ref1: ref1 || 'top',
      comp2Id,
      ref2: ref2 || 'bottom',
      offset: offset || 0,
    };
    this.mates.push(mate);
    this.solve();
    return mate;
  }

  removeMate(mateId) {
    this.mates = this.mates.filter(m => m.id !== mateId);
    this.solve();
  }

  /**
   * Numerically solve all assembly mates
   */
  solve(maxIterations = 20, tolerance = 1e-4) {
    const compMap = new Map();
    this.components.forEach(c => compMap.set(c.id, c));
    let maxError = 0;

    for (let iter = 0; iter < maxIterations; iter++) {
      maxError = 0;

      for (const mate of this.mates) {
        const c1 = compMap.get(mate.comp1Id);
        const c2 = compMap.get(mate.comp2Id);
        if (!c1 || !c2) continue;

        // If c2 is fixed and c1 is not, swap roles
        let targetComp = c2;
        let sourceComp = c1;
        let targetRef = mate.ref2;
        let sourceRef = mate.ref1;
        let targetOffset = mate.offset;

        if (c2.isFixed && !c1.isFixed) {
          targetComp = c1;
          sourceComp = c2;
          targetRef = mate.ref1;
          sourceRef = mate.ref2;
          targetOffset = -mate.offset;
        } else if (c2.isFixed && c1.isFixed) {
          continue; // Both fixed
        }

        switch (mate.type) {
          case MATE_TYPES.COINCIDENT:
          case 'coincident': {
            const f1 = sourceComp.getFaceReference(sourceRef);
            const f2 = targetComp.getFaceReference(targetRef);

            // 1. Align normals to oppose each other (face-to-face contact)
            const targetNormal = f1.normal.clone().negate();
            const rotDelta = new THREE.Quaternion().setFromUnitVectors(f2.normal, targetNormal);
            targetComp.quaternion.premultiply(rotDelta);
            targetComp.updateMatrix();

            // 2. Eliminate gap along normal
            const f2_updated = targetComp.getFaceReference(targetRef);
            const dist = f2_updated.point.clone().sub(f1.point).dot(f1.normal);
            const error = Math.abs(dist + targetOffset);
            if (error > maxError) maxError = error;

            const shift = f1.normal.clone().multiplyScalar(-(dist + targetOffset));
            targetComp.position.add(shift);
            targetComp.updateMatrix();
            break;
          }

          case MATE_TYPES.DISTANCE:
          case 'distance': {
            const f1 = sourceComp.getFaceReference(sourceRef);
            const f2 = targetComp.getFaceReference(targetRef);

            const targetNormal = f1.normal.clone().negate();
            const rotDelta = new THREE.Quaternion().setFromUnitVectors(f2.normal, targetNormal);
            targetComp.quaternion.premultiply(rotDelta);
            targetComp.updateMatrix();

            const f2_updated = targetComp.getFaceReference(targetRef);
            const currentDist = f2_updated.point.clone().sub(f1.point).dot(f1.normal);
            const targetDist = mate.offset;
            const error = Math.abs(currentDist - targetDist);
            if (error > maxError) maxError = error;

            const shift = f1.normal.clone().multiplyScalar(targetDist - currentDist);
            targetComp.position.add(shift);
            targetComp.updateMatrix();
            break;
          }

          case MATE_TYPES.CONCENTRIC:
          case 'concentric': {
            const a1 = sourceComp.getAxisReference(sourceRef);
            const a2 = targetComp.getAxisReference(targetRef);

            // 1. Align axis vectors
            const rotDelta = new THREE.Quaternion().setFromUnitVectors(a2.axis, a1.axis);
            targetComp.quaternion.premultiply(rotDelta);
            targetComp.updateMatrix();

            // 2. Align center points perpendicularly to axis
            const a2_updated = targetComp.getAxisReference(targetRef);
            const deltaP = a2_updated.point.clone().sub(a1.point);
            const parallelProj = a1.axis.clone().multiplyScalar(deltaP.dot(a1.axis));
            const perpOffset = deltaP.sub(parallelProj);

            const error = perpOffset.length();
            if (error > maxError) maxError = error;

            targetComp.position.sub(perpOffset);
            targetComp.updateMatrix();
            break;
          }

          case MATE_TYPES.PARALLEL:
          case 'parallel': {
            const f1 = sourceComp.getFaceReference(sourceRef);
            const f2 = targetComp.getFaceReference(targetRef);

            const rotDelta = new THREE.Quaternion().setFromUnitVectors(f2.normal, f1.normal);
            targetComp.quaternion.premultiply(rotDelta);
            targetComp.updateMatrix();

            const angleErr = f1.normal.angleTo(f2.normal);
            if (angleErr > maxError) maxError = angleErr;
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
    return { components: this.components, error: maxError };
  }

  /**
   * Generate exploded view displacement for visual inspection
   */
  createExplodedView(distance = 40) {
    return this.components.map((comp, idx) => {
      if (comp.isFixed) {
        return { id: comp.id, position: comp.position.clone() };
      }
      const angle = (idx * Math.PI * 2) / Math.max(1, this.components.length - 1);
      const explodedPos = comp.position.clone().add(
        new THREE.Vector3(Math.cos(angle) * distance, idx * 10, Math.sin(angle) * distance)
      );
      return { id: comp.id, position: explodedPos };
    });
  }
}

export const assemblyManager = new AssemblyManager();
export default AssemblyManager;
