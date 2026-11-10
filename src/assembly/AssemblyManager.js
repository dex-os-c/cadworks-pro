// CADWorks Pro - Assembly & Mates Manager
import * as THREE from 'three';
import { generateId } from '../utils/math';
import { MATE_TYPES } from '../utils/constants';

export class AssemblyManager {
  constructor() {
    this.components = [];
    this.mates = [];
  }

  insertComponent(name, geometry, matrix = new THREE.Matrix4()) {
    const comp = {
      id: generateId('comp'),
      name,
      geometry,
      matrix: matrix.clone(),
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
    };
    this.components.push(comp);
    return comp;
  }

  addMate(type, comp1Id, comp2Id, offset = 0) {
    const mate = {
      id: generateId('mate'),
      type,
      comp1Id,
      comp2Id,
      offset,
    };
    this.mates.push(mate);
    return mate;
  }

  createExplodedView(distance = 50) {
    // Offset each component radially from center
    return this.components.map((comp, i) => {
      const angle = (i * Math.PI * 2) / Math.max(1, this.components.length);
      return {
        id: comp.id,
        explodedPosition: new THREE.Vector3(
          Math.cos(angle) * distance,
          (i - this.components.length / 2) * 15,
          Math.sin(angle) * distance
        ),
      };
    });
  }
}

export const assemblyManager = new AssemblyManager();
export default AssemblyManager;
