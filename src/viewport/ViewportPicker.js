// CADWorks Pro - Viewport Picker and Raycaster
import * as THREE from 'three';
import { distance2D } from '../utils/math';
import { getSketchPlaneMatrix } from '../utils/math';

export class ViewportPicker {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  /**
   * Cast a ray from pointer coordinates into scene
   * Robust against null/undefined cameras, detached bodies, and missing geometries
   */
  pickObject(pointerX, pointerY, camera, objects) {
    if (!camera || !objects) return null;
    if (isNaN(pointerX) || isNaN(pointerY)) return null;

    const list = Array.isArray(objects) ? objects : [objects];
    const validObjects = list.filter(obj => {
      if (!obj || !obj.isObject3D) return false;
      if (obj.geometry) {
        const pos = obj.geometry.getAttribute ? obj.geometry.getAttribute('position') : obj.geometry.attributes?.position;
        return pos && pos.count > 0;
      }
      return obj.children && obj.children.length > 0;
    });

    if (validObjects.length === 0) return null;

    try {
      this.raycaster.setFromCamera({ x: pointerX, y: pointerY }, camera);
      const intersects = this.raycaster.intersectObjects(validObjects, true);
      return intersects.length > 0 ? intersects[0] : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Convert normalized pointer (-1 to +1) to 3D plane intersection
   */
  screenToSketchPlane(pointerX, pointerY, camera, planeName = 'Front') {
    if (!camera || isNaN(pointerX) || isNaN(pointerY)) return null;

    try {
      this.raycaster.setFromCamera({ x: pointerX, y: pointerY }, camera);

      // Build the 3D plane for the sketch
      let planeNormal = new THREE.Vector3(0, 0, 1);
      if (planeName === 'Top' || planeName === 'XZ') planeNormal.set(0, 1, 0);
      else if (planeName === 'Right' || planeName === 'YZ') planeNormal.set(1, 0, 0);

      const mathPlane = new THREE.Plane(planeNormal, 0);
      const target = new THREE.Vector3();
      const hit = this.raycaster.ray.intersectPlane(mathPlane, target);

      if (!hit) return null;

      // Transform world 3D target point into 2D sketch plane coordinates (x, y)
      if (planeName === 'Top' || planeName === 'XZ') {
        return { x: target.x, y: -target.z, z: 0, world: target };
      } else if (planeName === 'Right' || planeName === 'YZ') {
        return { x: target.z, y: target.y, z: 0, world: target };
      } else {
        // Front / XY
        return { x: target.x, y: target.y, z: 0, world: target };
      }
    } catch (e) {
      return null;
    }
  }

  /**
   * Find closest vertex on mesh to ray
   */
  pickVertex(intersection, threshold = 0.5) {
    if (!intersection || !intersection.object) return null;
    const geom = intersection.object.geometry;
    if (!geom) return null;

    const pos = geom.getAttribute ? geom.getAttribute('position') : geom.attributes?.position;
    if (!pos || !pos.count) return null;
    const hitPoint = intersection.point;
    if (!hitPoint) return null;

    try {
      let minD = threshold;
      let closestIndex = -1;

      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (intersection.object.matrixWorld) {
          v.applyMatrix4(intersection.object.matrixWorld);
        }
        const d = v.distanceTo(hitPoint);
        if (d < minD) {
          minD = d;
          closestIndex = i;
        }
      }

      return closestIndex !== -1 ? { index: closestIndex, distance: minD } : null;
    } catch (e) {
      return null;
    }
  }
}

export const viewportPicker = new ViewportPicker();
export default ViewportPicker;
