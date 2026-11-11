// CADWorks Pro - Engineering Drawing Manager (Bridge to DrawingEngine)
import * as THREE from 'three';
import { DrawingEngine, drawingEngine, PROJECTION_VIEWS } from '../drawings/DrawingEngine.js';

export class DrawingManager {
  constructor() {
    this.engine = drawingEngine;
  }

  /**
   * Generates standard orthographic engineering views (Front, Top, Right, Isometric)
   */
  createStandardViews(geometry, options = {}) {
    if (!geometry) return null;

    return {
      front: this.projectTo2D(geometry, 'front', options),
      top: this.projectTo2D(geometry, 'top', options),
      right: this.projectTo2D(geometry, 'right', options),
      isometric: this.projectTo2D(geometry, 'isometric', options),
    };
  }

  /**
   * Project 3D geometry edges onto 2D drawing sheet plane
   */
  projectTo2D(geometry, view = 'front', options = {}) {
    if (!geometry) return [];
    const proj = this.engine.projectGeometry(geometry, view, options);
    // Combine visible and hidden lines for legacy consumers, with type annotations
    return [...proj.visible, ...proj.hidden];
  }

  /**
   * Create complete 2D drawing sheet
   */
  createSheet(geometry, options = {}) {
    return this.engine.createStandardSheet(geometry, options);
  }

  /**
   * Export sheet to SVG
   */
  exportSVG(sheetData) {
    return this.engine.exportSVG(sheetData);
  }

  /**
   * Export sheet to DXF
   */
  exportDXF(sheetData) {
    return this.engine.exportDXF(sheetData);
  }
}

export const drawingManager = new DrawingManager();
export { DrawingEngine, drawingEngine, PROJECTION_VIEWS };
export default DrawingManager;

