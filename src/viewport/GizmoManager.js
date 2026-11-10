// CADWorks Pro - Interactive Transform Gizmo
import * as THREE from 'three';

export class GizmoManager {
  constructor() {
    this.activeAxis = null;
    this.mode = 'translate'; // 'translate', 'rotate', 'scale'
  }

  createGizmoGroup() {
    const group = new THREE.Group();
    group.name = 'TransformGizmo';

    // X axis (Red)
    const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 15, 0xff0000, 3, 1.5);
    arrowX.name = 'gizmo_x';
    group.add(arrowX);

    // Y axis (Green)
    const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 15, 0x00ff00, 3, 1.5);
    arrowY.name = 'gizmo_y';
    group.add(arrowY);

    // Z axis (Blue)
    const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 15, 0x0088ff, 3, 1.5);
    arrowZ.name = 'gizmo_z';
    group.add(arrowZ);

    return group;
  }
}

export const gizmoManager = new GizmoManager();
export default GizmoManager;
