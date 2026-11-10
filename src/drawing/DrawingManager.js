// CADWorks Pro - Engineering Drawing Engine
import * as THREE from 'three';

export class DrawingManager {
  /**
   * Generates standard orthographic engineering views (Front, Top, Right, Isometric)
   */
  createStandardViews(geometry) {
    if (!geometry) return null;

    return {
      front: this.projectTo2D(geometry, 'front'),
      top: this.projectTo2D(geometry, 'top'),
      right: this.projectTo2D(geometry, 'right'),
      isometric: this.projectTo2D(geometry, 'isometric'),
    };
  }

  /**
   * Project 3D geometry edges onto 2D drawing sheet plane
   */
  projectTo2D(geometry, view = 'front') {
    const edges = new THREE.EdgesGeometry(geometry, 25);
    const pos = edges.getAttribute('position');
    const lines2D = [];

    for (let i = 0; i < pos.count; i += 2) {
      const p1 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const p2 = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));

      let pt1 = { x: p1.x, y: p1.y };
      let pt2 = { x: p2.x, y: p2.y };

      if (view === 'top') {
        pt1 = { x: p1.x, y: -p1.z };
        pt2 = { x: p2.x, y: -p2.z };
      } else if (view === 'right') {
        pt1 = { x: p1.z, y: p1.y };
        pt2 = { x: p2.z, y: p2.y };
      } else if (view === 'isometric') {
        // Isometric 30 degree projection
        const iso = (p) => ({
          x: (p.x - p.z) * Math.cos(Math.PI / 6),
          y: p.y + (p.x + p.z) * Math.sin(Math.PI / 6),
        });
        pt1 = iso(p1);
        pt2 = iso(p2);
      }

      lines2D.push({ p1: pt1, p2: pt2 });
    }

    return lines2D;
  }
}

export const drawingManager = new DrawingManager();
export default DrawingManager;
