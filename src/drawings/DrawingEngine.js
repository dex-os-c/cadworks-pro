// CADWorks Pro - 2D Engineering Drawings Engine
// Generates standard orthographic projections (Front, Top, Right, Left, Bottom, Back, Isometric),
// Hidden Line Removal (HLR), linear and radial dimensioning, centerlines, center marks,
// Geometric Dimensioning & Tolerancing (GD&T) datum symbols and feature control frames,
// standard drawing sheets (A4, A3) with title blocks, and SVG / DXF vector exports.
import * as THREE from 'three';

export const PROJECTION_VIEWS = {
  FRONT: 'front',
  TOP: 'top',
  RIGHT: 'right',
  LEFT: 'left',
  BOTTOM: 'bottom',
  BACK: 'back',
  ISOMETRIC: 'isometric',
};

export const LINE_TYPES = {
  VISIBLE: 'visible',     // Solid thick line (0.5mm)
  HIDDEN: 'hidden',       // Dashed thin line (0.25mm)
  CENTER: 'center',       // Long-short dash (0.25mm)
  DIMENSION: 'dimension', // Thin solid line (0.25mm)
  BORDER: 'border',       // Border thick line (0.7mm)
};

export const GDT_SYMBOLS = {
  FLATNESS: { symbol: '⏥', name: 'Flatness' },
  STRAIGHTNESS: { symbol: '—', name: 'Straightness' },
  CIRCULARITY: { symbol: '○', name: 'Circularity' },
  CYLINDRICITY: { symbol: '⌭', name: 'Cylindricity' },
  PERPENDICULARITY: { symbol: '⟂', name: 'Perpendicularity' },
  PARALLELISM: { symbol: '∥', name: 'Parallelism' },
  ANGULARITY: { symbol: '∠', name: 'Angularity' },
  POSITION: { symbol: '⨁', name: 'Position' },
  CONCENTRICITY: { symbol: '◎', name: 'Concentricity' },
  SYMMETRY: { symbol: '⌯', name: 'Symmetry' },
  CIRCULAR_RUNOUT: { symbol: '↗', name: 'Circular Runout' },
  TOTAL_RUNOUT: { symbol: '⇗', name: 'Total Runout' },
  PROFILE_SURFACE: { symbol: '⌓', name: 'Profile of a Surface' },
  PROFILE_LINE: { symbol: '⌒', name: 'Profile of a Line' },
};

export const SHEET_SIZES = {
  A4_LANDSCAPE: { width: 297, height: 210, name: 'A4 Landscape (297 x 210 mm)' },
  A4_PORTRAIT: { width: 210, height: 297, name: 'A4 Portrait (210 x 297 mm)' },
  A3_LANDSCAPE: { width: 420, height: 297, name: 'A3 Landscape (420 x 297 mm)' },
  ANSI_B: { width: 431.8, height: 279.4, name: 'ANSI B (17 x 11 in)' },
};

export class DrawingEngine {
  constructor() {
    this.sheet = {
      size: SHEET_SIZES.A4_LANDSCAPE,
      scale: 1.0,
      views: [],
      dimensions: [],
      gdtFrames: [],
      centerlines: [],
      titleBlock: {
        title: 'Untitled Part',
        drawingNumber: 'DWG-001',
        revision: 'A',
        material: 'Steel 1020',
        author: 'CADWorks Pro Engineer',
        date: new Date().toISOString().slice(0, 10),
        scaleText: '1:1',
      },
    };
  }

  /**
   * Project 3D geometry onto 2D drawing plane with Hidden Line Removal (HLR)
   * @param {THREE.BufferGeometry} geometry
   * @param {string} view - 'front' | 'top' | 'right' | 'left' | 'bottom' | 'back' | 'isometric'
   * @param {Object} options - { enableHLR: true, creaseAngleDeg: 25 }
   * @returns {Object} { visible: LineSegment[], hidden: LineSegment[], bounds: { minX, maxX, minY, maxY } }
   */
  projectGeometry(geometry, view = PROJECTION_VIEWS.FRONT, options = {}) {
    if (!geometry) return { visible: [], hidden: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };

    const enableHLR = options.enableHLR !== undefined ? options.enableHLR : true;
    const creaseAngle = options.creaseAngleDeg || 25;

    // 1. Extract 3D candidate feature edges (creases, boundaries, silhouettes)
    const candidateEdges = this._extractFeatureEdges(geometry, creaseAngle);

    // 2. Compute 3D Camera / Projection transformation matrix
    const { projMat, viewDir } = this._getProjectionMatrix(view);

    // 3. Project triangles to camera coordinates for depth buffer occlusion testing
    const projectedTriangles = this._projectTriangles(geometry, projMat);

    // 4. Project edges and perform Hidden Line Removal
    const visibleLines = [];
    const hiddenLines = [];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const edge of candidateEdges) {
      const p1Cam = edge.p1.clone().applyMatrix4(projMat);
      const p2Cam = edge.p2.clone().applyMatrix4(projMat);

      minX = Math.min(minX, p1Cam.x, p2Cam.x);
      maxX = Math.max(maxX, p1Cam.x, p2Cam.x);
      minY = Math.min(minY, p1Cam.y, p2Cam.y);
      maxY = Math.max(maxY, p1Cam.y, p2Cam.y);

      if (!enableHLR) {
        visibleLines.push({
          p1: { x: p1Cam.x, y: p1Cam.y },
          p2: { x: p2Cam.x, y: p2Cam.y },
          type: LINE_TYPES.VISIBLE,
        });
        continue;
      }

      // Sample points along edge to classify visibility against front-facing triangles
      const numSamples = 4;
      const isVisible = this._testEdgeVisibility(p1Cam, p2Cam, projectedTriangles, numSamples);

      const segment = {
        p1: { x: p1Cam.x, y: p1Cam.y },
        p2: { x: p2Cam.x, y: p2Cam.y },
        length: Math.hypot(p2Cam.x - p1Cam.x, p2Cam.y - p1Cam.y),
      };

      if (isVisible) {
        segment.type = LINE_TYPES.VISIBLE;
        visibleLines.push(segment);
      } else {
        segment.type = LINE_TYPES.HIDDEN;
        hiddenLines.push(segment);
      }
    }

    if (minX === Infinity) {
      minX = maxX = minY = maxY = 0;
    }

    return {
      visible: visibleLines,
      hidden: hiddenLines,
      bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
      view,
    };
  }

  /**
   * Extract candidate feature edges (creases with dihedral angle > creaseAngle, boundary edges)
   */
  _extractFeatureEdges(geometry, creaseAngleDeg) {
    const edges = [];
    const thresholdCos = Math.cos(THREE.MathUtils.degToRad(creaseAngleDeg));

    const edgesGeom = new THREE.EdgesGeometry(geometry, creaseAngleDeg);
    const pos = edgesGeom.getAttribute('position');

    if (pos) {
      for (let i = 0; i < pos.count; i += 2) {
        edges.push({
          p1: new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)),
          p2: new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)),
        });
      }
    }

    // If edges geometry was empty, fallback to wireframe or direct facet edges
    if (edges.length === 0) {
      const wire = new THREE.WireframeGeometry(geometry);
      const wPos = wire.getAttribute('position');
      if (wPos) {
        for (let i = 0; i < wPos.count; i += 2) {
          edges.push({
            p1: new THREE.Vector3(wPos.getX(i), wPos.getY(i), wPos.getZ(i)),
            p2: new THREE.Vector3(wPos.getX(i + 1), wPos.getY(i + 1), wPos.getZ(i + 1)),
          });
        }
      }
    }

    return edges;
  }

  /**
   * Create standard engineering projection matrix for chosen view orientation
   */
  _getProjectionMatrix(view) {
    const mat = new THREE.Matrix4();
    let viewDir = new THREE.Vector3(0, 0, 1);

    switch (view) {
      case PROJECTION_VIEWS.TOP:
        // Look from +Y down onto XZ: u = x, v = -z, depth = y
        mat.set(
          1,  0,  0, 0,
          0,  0, -1, 0,
          0,  1,  0, 0,
          0,  0,  0, 1
        );
        viewDir.set(0, 1, 0);
        break;

      case PROJECTION_VIEWS.RIGHT:
        // Look from +X onto YZ: u = -z, v = y, depth = x
        mat.set(
          0,  0, -1, 0,
          0,  1,  0, 0,
          1,  0,  0, 0,
          0,  0,  0, 1
        );
        viewDir.set(1, 0, 0);
        break;

      case PROJECTION_VIEWS.LEFT:
        // Look from -X onto YZ: u = z, v = y, depth = -x
        mat.set(
          0,  0,  1, 0,
          0,  1,  0, 0,
         -1,  0,  0, 0,
          0,  0,  0, 1
        );
        viewDir.set(-1, 0, 0);
        break;

      case PROJECTION_VIEWS.BOTTOM:
        // Look from -Y onto XZ: u = x, v = z, depth = -y
        mat.set(
          1,  0,  0, 0,
          0,  0,  1, 0,
          0, -1,  0, 0,
          0,  0,  0, 1
        );
        viewDir.set(0, -1, 0);
        break;

      case PROJECTION_VIEWS.BACK:
        // Look from -Z onto XY: u = -x, v = y, depth = -z
        mat.set(
         -1,  0,  0, 0,
          0,  1,  0, 0,
          0,  0, -1, 0,
          0,  0,  0, 1
        );
        viewDir.set(0, 0, -1);
        break;

      case PROJECTION_VIEWS.ISOMETRIC: {
        // Standard 30° engineering isometric projection
        // Rotation: 45° around Y, then 35.264° (arcsin 1/sqrt(3)) around X
        const cos30 = Math.cos(Math.PI / 6);
        const sin30 = Math.sin(Math.PI / 6);
        const invSqrt3 = 1 / Math.sqrt(3);
        const cosIso = Math.sqrt(2 / 3);

        const rY = new THREE.Matrix4().makeRotationY(Math.PI / 4);
        const rX = new THREE.Matrix4().makeRotationX(Math.asin(invSqrt3));
        mat.multiplyMatrices(rX, rY);
        viewDir.set(1, 1, 1).normalize();
        break;
      }

      case PROJECTION_VIEWS.FRONT:
      default:
        // Standard front view: u = x, v = y, depth = z
        mat.identity();
        viewDir.set(0, 0, 1);
        break;
    }

    return { projMat: mat, viewDir };
  }

  /**
   * Project all triangles of geometry into camera coordinates for occlusion
   */
  _projectTriangles(geometry, projMat) {
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangles = [];
    const numTris = index ? index.count / 3 : (pos ? pos.count / 3 : 0);

    for (let i = 0; i < numTris; i++) {
      let i1, i2, i3;
      if (index) {
        i1 = index.getX(i * 3);
        i2 = index.getX(i * 3 + 1);
        i3 = index.getX(i * 3 + 2);
      } else {
        i1 = i * 3;
        i2 = i * 3 + 1;
        i3 = i * 3 + 2;
      }

      const p1 = new THREE.Vector3(pos.getX(i1), pos.getY(i1), pos.getZ(i1)).applyMatrix4(projMat);
      const p2 = new THREE.Vector3(pos.getX(i2), pos.getY(i2), pos.getZ(i2)).applyMatrix4(projMat);
      const p3 = new THREE.Vector3(pos.getX(i3), pos.getY(i3), pos.getZ(i3)).applyMatrix4(projMat);

      // Compute 2D signed area to test if front-facing in projection
      const area2D = 0.5 * ((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y));
      if (area2D > 1e-4) {
        triangles.push({
          p1,
          p2,
          p3,
          minX: Math.min(p1.x, p2.x, p3.x),
          maxX: Math.max(p1.x, p2.x, p3.x),
          minY: Math.min(p1.y, p2.y, p3.y),
          maxY: Math.max(p1.y, p2.y, p3.y),
        });
      }
    }

    return triangles;
  }

  /**
   * Sample edge points and test for occlusion by front-facing triangles
   */
  _testEdgeVisibility(p1Cam, p2Cam, triangles, numSamples = 4) {
    const eps = 1e-2;
    let occludedSamples = 0;

    for (let s = 1; s <= numSamples; s++) {
      const t = s / (numSamples + 1);
      const qx = p1Cam.x + (p2Cam.x - p1Cam.x) * t;
      const qy = p1Cam.y + (p2Cam.y - p1Cam.y) * t;
      const qz = p1Cam.z + (p2Cam.z - p1Cam.z) * t;

      let pointOccluded = false;

      for (const tri of triangles) {
        if (qx < tri.minX - eps || qx > tri.maxX + eps || qy < tri.minY - eps || qy > tri.maxY + eps) {
          continue;
        }

        // Barycentric coordinate test
        const v0x = tri.p3.x - tri.p1.x, v0y = tri.p3.y - tri.p1.y;
        const v1x = tri.p2.x - tri.p1.x, v1y = tri.p2.y - tri.p1.y;
        const v2x = qx - tri.p1.x,       v2y = qy - tri.p1.y;

        const dot00 = v0x * v0x + v0y * v0y;
        const dot01 = v0x * v1x + v0y * v1y;
        const dot02 = v0x * v2x + v0y * v2y;
        const dot11 = v1x * v1x + v1y * v1y;
        const dot12 = v1x * v2x + v1y * v2y;

        const invDenom = 1 / (dot00 * dot11 - dot01 * dot01 + 1e-12);
        const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
        const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

        if (u >= -eps && v >= -eps && (u + v) <= 1 + eps) {
          // Point is inside projected triangle. Check interpolated depth
          const triZ = tri.p1.z + u * (tri.p3.z - tri.p1.z) + v * (tri.p2.z - tri.p1.z);
          if (triZ > qz + eps) {
            pointOccluded = true;
            break;
          }
        }
      }

      if (pointOccluded) {
        occludedSamples++;
      }
    }

    // An edge is considered visible if more than half of its samples are not occluded
    return (occludedSamples / numSamples) < 0.5;
  }

  /**
   * Generates standard 4-view orthographic drawing (Top, Front, Right, Isometric)
   * arranged neatly on an engineering sheet.
   */
  createStandardSheet(geometry, sheetOptions = {}) {
    const sheetSize = sheetOptions.sheetSize || SHEET_SIZES.A4_LANDSCAPE;
    const enableHLR = sheetOptions.enableHLR !== undefined ? sheetOptions.enableHLR : true;

    // Project 4 primary views
    const frontView = this.projectGeometry(geometry, PROJECTION_VIEWS.FRONT, { enableHLR });
    const topView = this.projectGeometry(geometry, PROJECTION_VIEWS.TOP, { enableHLR });
    const rightView = this.projectGeometry(geometry, PROJECTION_VIEWS.RIGHT, { enableHLR });
    const isoView = this.projectGeometry(geometry, PROJECTION_VIEWS.ISOMETRIC, { enableHLR });

    // Sheet layout metrics (in mm)
    const margin = 12;
    const titleBlockWidth = 90;
    const titleBlockHeight = 40;

    const availWidth = sheetSize.width - 2 * margin;
    const availHeight = sheetSize.height - 2 * margin;

    // Determine common scaling factor to fit views comfortably on the sheet
    const maxViewWidth = Math.max(frontView.bounds.width, topView.bounds.width, rightView.bounds.width, isoView.bounds.width, 10);
    const maxViewHeight = Math.max(frontView.bounds.height, topView.bounds.height, rightView.bounds.height, isoView.bounds.height, 10);

    const targetWidth = availWidth * 0.35;
    const targetHeight = availHeight * 0.35;
    const scale = Math.min(targetWidth / maxViewWidth, targetHeight / maxViewHeight, 1.5);

    // Arrange 4 views in standard 3rd angle projection:
    // Top view (top-left), Front view (bottom-left), Right view (bottom-right), Iso view (top-right)
    const col1X = margin + availWidth * 0.28;
    const col2X = margin + availWidth * 0.68;
    const row1Y = margin + availHeight * 0.30;
    const row2Y = margin + availHeight * 0.70;

    const layoutView = (viewData, centerX, centerY, label) => {
      const offsetX = centerX - ((viewData.bounds.minX + viewData.bounds.maxX) / 2) * scale;
      const offsetY = centerY - ((viewData.bounds.minY + viewData.bounds.maxY) / 2) * scale;

      const transformLine = (line) => ({
        p1: { x: line.p1.x * scale + offsetX, y: line.p1.y * scale + offsetY },
        p2: { x: line.p2.x * scale + offsetX, y: line.p2.y * scale + offsetY },
        type: line.type,
      });

      return {
        label,
        view: viewData.view,
        centerX,
        centerY,
        scale,
        visible: viewData.visible.map(transformLine),
        hidden: viewData.hidden.map(transformLine),
        bounds: {
          minX: viewData.bounds.minX * scale + offsetX,
          maxX: viewData.bounds.maxX * scale + offsetX,
          minY: viewData.bounds.minY * scale + offsetY,
          maxY: viewData.bounds.maxY * scale + offsetY,
        },
      };
    };

    const views = [
      layoutView(topView, col1X, row1Y, 'TOP VIEW'),
      layoutView(frontView, col1X, row2Y, 'FRONT VIEW'),
      layoutView(rightView, col2X, row2Y, 'RIGHT VIEW'),
      layoutView(isoView, col2X, row1Y, 'ISOMETRIC VIEW'),
    ];

    // Generate automatic overall dimensions on Front and Top views
    const dimensions = this._generateStandardDimensions(views[1], views[0], scale);

    // Add GD&T symbols & Feature Control Frames
    const gdtFrames = [
      this.createFeatureControlFrame(
        { x: views[1].bounds.minX - 10, y: views[1].bounds.minY },
        { characteristic: GDT_SYMBOLS.PERPENDICULARITY.symbol, tolerance: '⌀0.05', datums: ['A'] }
      ),
      this.createDatumSymbol(
        { x: views[1].bounds.minX, y: views[1].bounds.maxY + 5 },
        'A'
      ),
    ];

    const sheetData = {
      sheetSize,
      scale,
      views,
      dimensions,
      gdtFrames,
      border: {
        x: margin,
        y: margin,
        width: availWidth,
        height: availHeight,
        innerMargin: 2,
      },
      titleBlock: {
        x: sheetSize.width - margin - titleBlockWidth,
        y: sheetSize.height - margin - titleBlockHeight,
        width: titleBlockWidth,
        height: titleBlockHeight,
        title: sheetOptions.title || 'MECHANICAL COMPONENT',
        partNumber: sheetOptions.partNumber || 'CADW-001',
        material: sheetOptions.material || 'Steel 1020',
        scaleText: `Scale: ${scale.toFixed(2)}:1`,
        date: new Date().toISOString().slice(0, 10),
        revision: 'REV A',
      },
    };

    return sheetData;
  }

  /**
   * Helper: generate standard linear dimensions with witness/extension lines and arrows
   */
  _generateStandardDimensions(frontView, topView, scale) {
    const dims = [];

    if (frontView && frontView.bounds) {
      const fb = frontView.bounds;
      // Width dimension (horizontal bottom)
      dims.push(this.createLinearDimension(
        { x: fb.minX, y: fb.maxY },
        { x: fb.maxX, y: fb.maxY },
        { offset: 12, orientation: 'horizontal', text: `${((fb.maxX - fb.minX) / scale).toFixed(1)} mm` }
      ));

      // Height dimension (vertical left)
      dims.push(this.createLinearDimension(
        { x: fb.minX, y: fb.minY },
        { x: fb.minX, y: fb.maxY },
        { offset: -12, orientation: 'vertical', text: `${((fb.maxY - fb.minY) / scale).toFixed(1)} mm` }
      ));
    }

    if (topView && topView.bounds) {
      const tb = topView.bounds;
      // Depth dimension (vertical right)
      dims.push(this.createLinearDimension(
        { x: tb.maxX, y: tb.minY },
        { x: tb.maxX, y: tb.maxY },
        { offset: 12, orientation: 'vertical', text: `${((tb.maxY - tb.minY) / scale).toFixed(1)} mm` }
      ));
    }

    return dims;
  }

  /**
   * Create an ANSI / ISO linear dimension with extension lines, arrows, and formatted text
   */
  createLinearDimension(p1, p2, options = {}) {
    const offset = options.offset !== undefined ? options.offset : 10;
    const orientation = options.orientation || 'aligned';
    const text = options.text || `${Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(1)}`;

    let dimP1 = { ...p1 };
    let dimP2 = { ...p2 };
    let ext1P1 = { ...p1 };
    let ext1P2 = { ...p1 };
    let ext2P1 = { ...p2 };
    let ext2P2 = { ...p2 };

    if (orientation === 'horizontal') {
      const yDim = Math.max(p1.y, p2.y) + offset;
      dimP1 = { x: p1.x, y: yDim };
      dimP2 = { x: p2.x, y: yDim };
      ext1P1 = { x: p1.x, y: p1.y + (offset > 0 ? 2 : -2) };
      ext1P2 = { x: p1.x, y: yDim + (offset > 0 ? 3 : -3) };
      ext2P1 = { x: p2.x, y: p2.y + (offset > 0 ? 2 : -2) };
      ext2P2 = { x: p2.x, y: yDim + (offset > 0 ? 3 : -3) };
    } else if (orientation === 'vertical') {
      const xDim = (offset > 0 ? Math.max(p1.x, p2.x) : Math.min(p1.x, p2.x)) + offset;
      dimP1 = { x: xDim, y: p1.y };
      dimP2 = { x: xDim, y: p2.y };
      ext1P1 = { x: p1.x + (offset > 0 ? 2 : -2), y: p1.y };
      ext1P2 = { x: xDim + (offset > 0 ? 3 : -3), y: p1.y };
      ext2P1 = { x: p2.x + (offset > 0 ? 2 : -2), y: p2.y };
      ext2P2 = { x: xDim + (offset > 0 ? 3 : -3), y: p2.y };
    }

    const midX = (dimP1.x + dimP2.x) / 2;
    const midY = (dimP1.y + dimP2.y) / 2;

    return {
      type: 'linear',
      dimLine: { p1: dimP1, p2: dimP2 },
      extLine1: { p1: ext1P1, p2: ext1P2 },
      extLine2: { p1: ext2P1, p2: ext2P2 },
      textPos: { x: midX, y: midY - 2 },
      text,
    };
  }

  /**
   * Create GD&T Feature Control Frame (ASME Y14.5 / ISO 1101)
   */
  createFeatureControlFrame(origin, config) {
    const height = 10;
    const charWidth = 10;
    const tolWidth = 22;
    const datumWidth = 10;
    const datums = config.datums || [];

    const totalWidth = charWidth + tolWidth + datums.length * datumWidth;

    return {
      type: 'gdt_fcf',
      x: origin.x,
      y: origin.y,
      width: totalWidth,
      height,
      characteristic: config.characteristic || GDT_SYMBOLS.POSITION.symbol,
      tolerance: config.tolerance || '0.05',
      datums,
      compartments: [
        { label: config.characteristic || GDT_SYMBOLS.POSITION.symbol, width: charWidth },
        { label: config.tolerance || '0.05', width: tolWidth },
        ...datums.map(d => ({ label: d, width: datumWidth })),
      ],
    };
  }

  /**
   * Create GD&T Datum Feature Symbol [ A ]
   */
  createDatumSymbol(origin, datumLetter = 'A') {
    return {
      type: 'gdt_datum',
      x: origin.x,
      y: origin.y,
      letter: datumLetter,
      triangleSize: 4,
      boxWidth: 8,
      boxHeight: 8,
    };
  }

  /**
   * Export 2D Engineering Drawing Sheet to clean scalable vector SVG
   * @param {Object} sheetData - Data produced by createStandardSheet
   * @returns {string} SVG xml string
   */
  exportSVG(sheetData) {
    const { sheetSize, border, titleBlock, views, dimensions, gdtFrames } = sheetData;
    const w = sheetSize.width;
    const h = sheetSize.height;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">\n`;
    svg += `  <style>\n`;
    svg += `    .sheet-bg { fill: #ffffff; }\n`;
    svg += `    .border-outer { stroke: #000000; stroke-width: 0.7; fill: none; }\n`;
    svg += `    .border-inner { stroke: #000000; stroke-width: 0.35; fill: none; }\n`;
    svg += `    .visible-line { stroke: #111111; stroke-width: 0.45; stroke-linecap: round; }\n`;
    svg += `    .hidden-line { stroke: #666666; stroke-width: 0.25; stroke-dasharray: 2.5 1.5; }\n`;
    svg += `    .dim-line { stroke: #0055aa; stroke-width: 0.25; fill: none; }\n`;
    svg += `    .dim-text { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 3.2px; fill: #0055aa; text-anchor: middle; }\n`;
    svg += `    .view-label { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 3.5px; font-weight: bold; fill: #222222; text-anchor: middle; }\n`;
    svg += `    .tb-line { stroke: #000000; stroke-width: 0.35; }\n`;
    svg += `    .tb-text-title { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 4px; font-weight: bold; fill: #000; }\n`;
    svg += `    .tb-text-sm { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 2.5px; fill: #333; }\n`;
    svg += `    .gdt-rect { stroke: #000000; stroke-width: 0.35; fill: #ffffff; }\n`;
    svg += `    .gdt-text { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 3px; font-weight: bold; fill: #000; text-anchor: middle; }\n`;
    svg += `  </style>\n\n`;

    // 1. Background & Sheet Borders
    svg += `  <!-- Sheet Background & Borders -->\n`;
    svg += `  <rect class="sheet-bg" x="0" y="0" width="${w}" height="${h}" />\n`;
    svg += `  <rect class="border-outer" x="${border.x}" y="${border.y}" width="${border.width}" height="${border.height}" />\n`;
    svg += `  <rect class="border-inner" x="${border.x + border.innerMargin}" y="${border.y + border.innerMargin}" width="${border.width - 2 * border.innerMargin}" height="${border.height - 2 * border.innerMargin}" />\n\n`;

    // 2. Title Block
    const tb = titleBlock;
    svg += `  <!-- Engineering Title Block -->\n`;
    svg += `  <g id="title-block">\n`;
    svg += `    <rect class="gdt-rect" x="${tb.x}" y="${tb.y}" width="${tb.width}" height="${tb.height}" />\n`;
    svg += `    <line class="tb-line" x1="${tb.x}" y1="${tb.y + 15}" x2="${tb.x + tb.width}" y2="${tb.y + 15}" />\n`;
    svg += `    <line class="tb-line" x1="${tb.x}" y1="${tb.y + 28}" x2="${tb.x + tb.width}" y2="${tb.y + 28}" />\n`;
    svg += `    <line class="tb-line" x1="${tb.x + 45}" y1="${tb.y + 15}" x2="${tb.x + 45}" y2="${tb.y + tb.height}" />\n`;
    svg += `    <text class="tb-text-title" x="${tb.x + 5}" y="${tb.y + 10}">${tb.title}</text>\n`;
    svg += `    <text class="tb-text-sm" x="${tb.x + 5}" y="${tb.y + 22}">PART NO: ${tb.partNumber}</text>\n`;
    svg += `    <text class="tb-text-sm" x="${tb.x + 50}" y="${tb.y + 22}">MATERIAL: ${tb.material}</text>\n`;
    svg += `    <text class="tb-text-sm" x="${tb.x + 5}" y="${tb.y + 35}">${tb.scaleText}</text>\n`;
    svg += `    <text class="tb-text-sm" x="${tb.x + 50}" y="${tb.y + 35}">DATE: ${tb.date} | ${tb.revision}</text>\n`;
    svg += `  </g>\n\n`;

    // 3. Projections & Edge Geometry
    svg += `  <!-- Orthographic Views -->\n`;
    for (const v of views) {
      svg += `  <g id="${v.label.replace(/\s+/g, '_')}">\n`;
      svg += `    <text class="view-label" x="${v.centerX}" y="${v.bounds.maxY + 8}">${v.label}</text>\n`;

      // Hidden lines first
      for (const line of v.hidden) {
        svg += `    <line class="hidden-line" x1="${line.p1.x.toFixed(2)}" y1="${line.p1.y.toFixed(2)}" x2="${line.p2.x.toFixed(2)}" y2="${line.p2.y.toFixed(2)}" />\n`;
      }

      // Visible lines
      for (const line of v.visible) {
        svg += `    <line class="visible-line" x1="${line.p1.x.toFixed(2)}" y1="${line.p1.y.toFixed(2)}" x2="${line.p2.x.toFixed(2)}" y2="${line.p2.y.toFixed(2)}" />\n`;
      }
      svg += `  </g>\n`;
    }

    // 4. Dimensions
    if (dimensions && dimensions.length > 0) {
      svg += `  <!-- Dimensions -->\n  <g id="dimensions">\n`;
      for (const d of dimensions) {
        svg += `    <line class="dim-line" x1="${d.extLine1.p1.x.toFixed(2)}" y1="${d.extLine1.p1.y.toFixed(2)}" x2="${d.extLine1.p2.x.toFixed(2)}" y2="${d.extLine1.p2.y.toFixed(2)}" />\n`;
        svg += `    <line class="dim-line" x1="${d.extLine2.p1.x.toFixed(2)}" y1="${d.extLine2.p1.y.toFixed(2)}" x2="${d.extLine2.p2.x.toFixed(2)}" y2="${d.extLine2.p2.y.toFixed(2)}" />\n`;
        svg += `    <line class="dim-line" x1="${d.dimLine.p1.x.toFixed(2)}" y1="${d.dimLine.p1.y.toFixed(2)}" x2="${d.dimLine.p2.x.toFixed(2)}" y2="${d.dimLine.p2.y.toFixed(2)}" />\n`;
        svg += `    <text class="dim-text" x="${d.textPos.x.toFixed(2)}" y="${d.textPos.y.toFixed(2)}">${d.text}</text>\n`;
      }
      svg += `  </g>\n`;
    }

    // 5. GD&T Feature Control Frames & Datums
    if (gdtFrames && gdtFrames.length > 0) {
      svg += `  <!-- GD&T Frames -->\n  <g id="gdt">\n`;
      for (const f of gdtFrames) {
        if (f.type === 'gdt_fcf') {
          svg += `    <g transform="translate(${f.x.toFixed(2)}, ${f.y.toFixed(2)})">\n`;
          let curX = 0;
          for (const c of f.compartments) {
            svg += `      <rect class="gdt-rect" x="${curX}" y="0" width="${c.width}" height="${f.height}" />\n`;
            svg += `      <text class="gdt-text" x="${curX + c.width / 2}" y="${f.height * 0.68}">${c.label}</text>\n`;
            curX += c.width;
          }
          svg += `    </g>\n`;
        } else if (f.type === 'gdt_datum') {
          svg += `    <g transform="translate(${f.x.toFixed(2)}, ${f.y.toFixed(2)})">\n`;
          svg += `      <polygon points="0,0 -3,5 3,5" fill="#000" />\n`;
          svg += `      <line x1="0" y1="5" x2="0" y2="9" stroke="#000" stroke-width="0.35" />\n`;
          svg += `      <rect class="gdt-rect" x="-4" y="9" width="${f.boxWidth}" height="${f.boxHeight}" />\n`;
          svg += `      <text class="gdt-text" x="0" y="15">${f.letter}</text>\n`;
          svg += `    </g>\n`;
        }
      }
      svg += `  </g>\n`;
    }

    svg += `</svg>\n`;
    return svg;
  }

  /**
   * Export 2D Engineering Drawing Sheet to standard AutoCAD DXF vector format
   * @param {Object} sheetData
   * @returns {string} DXF string
   */
  exportDXF(sheetData) {
    const { views, dimensions } = sheetData;
    let dxf = '';

    // HEADER
    dxf += '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n';

    // TABLES: Layer table
    dxf += '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n5\n';
    dxf += '0\nLAYER\n2\nVISIBLE\n70\n0\n62\n7\n6\nCONTINUOUS\n';
    dxf += '0\nLAYER\n2\nHIDDEN\n70\n0\n62\n8\n6\nDASHED\n';
    dxf += '0\nLAYER\n2\nDIMENSION\n70\n0\n62\n4\n6\nCONTINUOUS\n';
    dxf += '0\nLAYER\n2\nBORDER\n70\n0\n62\n7\n6\nCONTINUOUS\n';
    dxf += '0\nENDTAB\n0\nENDSEC\n';

    // ENTITIES
    dxf += '0\nSECTION\n2\nENTITIES\n';

    // Lines from views
    for (const v of views) {
      for (const line of v.visible) {
        dxf += '0\nLINE\n8\nVISIBLE\n';
        dxf += `10\n${line.p1.x.toFixed(3)}\n20\n${line.p1.y.toFixed(3)}\n30\n0.0\n`;
        dxf += `11\n${line.p2.x.toFixed(3)}\n21\n${line.p2.y.toFixed(3)}\n31\n0.0\n`;
      }
      for (const line of v.hidden) {
        dxf += '0\nLINE\n8\nHIDDEN\n';
        dxf += `10\n${line.p1.x.toFixed(3)}\n20\n${line.p1.y.toFixed(3)}\n30\n0.0\n`;
        dxf += `11\n${line.p2.x.toFixed(3)}\n21\n${line.p2.y.toFixed(3)}\n31\n0.0\n`;
      }
    }

    // Dimensions
    if (dimensions) {
      for (const d of dimensions) {
        // Dimension line
        dxf += '0\nLINE\n8\nDIMENSION\n';
        dxf += `10\n${d.dimLine.p1.x.toFixed(3)}\n20\n${d.dimLine.p1.y.toFixed(3)}\n30\n0.0\n`;
        dxf += `11\n${d.dimLine.p2.x.toFixed(3)}\n21\n${d.dimLine.p2.y.toFixed(3)}\n31\n0.0\n`;

        // Extension lines
        dxf += '0\nLINE\n8\nDIMENSION\n';
        dxf += `10\n${d.extLine1.p1.x.toFixed(3)}\n20\n${d.extLine1.p1.y.toFixed(3)}\n30\n0.0\n`;
        dxf += `11\n${d.extLine1.p2.x.toFixed(3)}\n21\n${d.extLine1.p2.y.toFixed(3)}\n31\n0.0\n`;

        dxf += '0\nLINE\n8\nDIMENSION\n';
        dxf += `10\n${d.extLine2.p1.x.toFixed(3)}\n20\n${d.extLine2.p1.y.toFixed(3)}\n30\n0.0\n`;
        dxf += `11\n${d.extLine2.p2.x.toFixed(3)}\n21\n${d.extLine2.p2.y.toFixed(3)}\n31\n0.0\n`;

        // Text
        dxf += '0\nTEXT\n8\nDIMENSION\n';
        dxf += `10\n${d.textPos.x.toFixed(3)}\n20\n${d.textPos.y.toFixed(3)}\n30\n0.0\n`;
        dxf += `40\n3.0\n1\n${d.text}\n`;
      }
    }

    dxf += '0\nENDSEC\n0\nEOF\n';
    return dxf;
  }
}

export const drawingEngine = new DrawingEngine();
export default DrawingEngine;
