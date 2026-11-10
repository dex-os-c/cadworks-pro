// CADWorks Pro - 2D Sketching Engine
import * as THREE from 'three';
import { generateId, distance2D, pointToLineDistance, lineLineIntersection, EPSILON } from '../utils/math';
import { SKETCH_ENTITY_TYPES } from '../utils/constants';

export class SketchEngine {
  constructor() {
    this.snapTolerance = 8; // pixels or units
  }

  createLine(p1, p2, isConstruction = false) {
    return {
      id: generateId('line'),
      type: SKETCH_ENTITY_TYPES.LINE,
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      construction: isConstruction,
    };
  }

  createRectangle(p1, p2, isConstruction = false) {
    // 4 lines
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);

    const pt1 = { x: minX, y: minY };
    const pt2 = { x: maxX, y: minY };
    const pt3 = { x: maxX, y: maxY };
    const pt4 = { x: minX, y: maxY };

    return [
      this.createLine(pt1, pt2, isConstruction),
      this.createLine(pt2, pt3, isConstruction),
      this.createLine(pt3, pt4, isConstruction),
      this.createLine(pt4, pt1, isConstruction),
    ];
  }

  createCircle(center, radius, isConstruction = false) {
    return {
      id: generateId('circle'),
      type: SKETCH_ENTITY_TYPES.CIRCLE,
      center: { x: center.x, y: center.y },
      radius: Math.abs(radius),
      construction: isConstruction,
    };
  }

  createArc(center, radius, startAngle, endAngle, isConstruction = false) {
    return {
      id: generateId('arc'),
      type: SKETCH_ENTITY_TYPES.ARC,
      center: { x: center.x, y: center.y },
      radius: Math.abs(radius),
      startAngle,
      endAngle,
      construction: isConstruction,
    };
  }

  createSpline(points, isConstruction = false) {
    return {
      id: generateId('spline'),
      type: SKETCH_ENTITY_TYPES.SPLINE,
      controlPoints: points.map(p => ({ x: p.x, y: p.y })),
      construction: isConstruction,
    };
  }

  createEllipse(center, radiusX, radiusY, rotation = 0, isConstruction = false) {
    return {
      id: generateId('ellipse'),
      type: SKETCH_ENTITY_TYPES.ELLIPSE,
      center: { x: center.x, y: center.y },
      radiusX: Math.abs(radiusX),
      radiusY: Math.abs(radiusY),
      rotation,
      construction: isConstruction,
    };
  }

  createPolygon(center, radius, sides = 6, isConstruction = false) {
    const lines = [];
    const step = (Math.PI * 2) / sides;
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const angle = i * step;
      pts.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }
    for (let i = 0; i < sides; i++) {
      lines.push(this.createLine(pts[i], pts[(i + 1) % sides], isConstruction));
    }
    return lines;
  }

  createSlot(p1, p2, radius, isConstruction = false) {
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const perp = angle + Math.PI / 2;

    const dx = radius * Math.cos(perp);
    const dy = radius * Math.sin(perp);

    const s1 = { x: p1.x + dx, y: p1.y + dy };
    const s2 = { x: p2.x + dx, y: p2.y + dy };
    const s3 = { x: p2.x - dx, y: p2.y - dy };
    const s4 = { x: p1.x - dx, y: p1.y - dy };

    return [
      this.createLine(s1, s2, isConstruction),
      this.createArc(p2, radius, perp - Math.PI, perp, isConstruction),
      this.createLine(s3, s4, isConstruction),
      this.createArc(p1, radius, perp, perp + Math.PI, isConstruction),
    ];
  }

  snapToGrid(point, gridSize = 10) {
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    };
  }

  snapToEntity(point, entities, tolerance = 8) {
    let closestPt = null;
    let minDist = tolerance;
    let snapType = null; // 'endpoint', 'midpoint', 'center'

    for (const ent of entities) {
      if (ent.type === SKETCH_ENTITY_TYPES.LINE) {
        // Endpoints
        const d1 = distance2D(point, ent.p1);
        if (d1 < minDist) {
          minDist = d1;
          closestPt = { ...ent.p1 };
          snapType = 'endpoint';
        }
        const d2 = distance2D(point, ent.p2);
        if (d2 < minDist) {
          minDist = d2;
          closestPt = { ...ent.p2 };
          snapType = 'endpoint';
        }
        // Midpoint
        const mid = { x: (ent.p1.x + ent.p2.x) / 2, y: (ent.p1.y + ent.p2.y) / 2 };
        const dMid = distance2D(point, mid);
        if (dMid < minDist) {
          minDist = dMid;
          closestPt = mid;
          snapType = 'midpoint';
        }
      } else if (ent.type === SKETCH_ENTITY_TYPES.CIRCLE || ent.type === SKETCH_ENTITY_TYPES.ARC) {
        // Center
        const dCenter = distance2D(point, ent.center);
        if (dCenter < minDist) {
          minDist = dCenter;
          closestPt = { ...ent.center };
          snapType = 'center';
        }
        // Cardinal points / endpoints on arc
        if (ent.type === SKETCH_ENTITY_TYPES.ARC) {
          const pStart = {
            x: ent.center.x + ent.radius * Math.cos(ent.startAngle),
            y: ent.center.y + ent.radius * Math.sin(ent.startAngle),
          };
          const pEnd = {
            x: ent.center.x + ent.radius * Math.cos(ent.endAngle),
            y: ent.center.y + ent.radius * Math.sin(ent.endAngle),
          };
          const dS = distance2D(point, pStart);
          if (dS < minDist) { minDist = dS; closestPt = pStart; snapType = 'endpoint'; }
          const dE = distance2D(point, pEnd);
          if (dE < minDist) { minDist = dE; closestPt = pEnd; snapType = 'endpoint'; }
        }
      }
    }

    return closestPt ? { point: closestPt, type: snapType, distance: minDist } : null;
  }

  isProfileClosed(entities, tol = 1e-2) {
    const nonConstruction = entities.filter(e => !e.construction);
    if (nonConstruction.length === 0) return false;

    // A single circle or closed spline is closed by definition
    if (nonConstruction.length === 1) {
      if (nonConstruction[0].type === SKETCH_ENTITY_TYPES.CIRCLE ||
          nonConstruction[0].type === SKETCH_ENTITY_TYPES.ELLIPSE) {
        return true;
      }
    }

    // Graph connection check for lines and arcs
    const segments = [];
    for (const ent of nonConstruction) {
      if (ent.type === SKETCH_ENTITY_TYPES.LINE) {
        segments.push({ p1: ent.p1, p2: ent.p2 });
      } else if (ent.type === SKETCH_ENTITY_TYPES.ARC) {
        const p1 = {
          x: ent.center.x + ent.radius * Math.cos(ent.startAngle),
          y: ent.center.y + ent.radius * Math.sin(ent.startAngle),
        };
        const p2 = {
          x: ent.center.x + ent.radius * Math.cos(ent.endAngle),
          y: ent.center.y + ent.radius * Math.sin(ent.endAngle),
        };
        segments.push({ p1, p2 });
      }
    }

    if (segments.length < 3) return false;

    // Check Eulerian loop
    const visited = new Set();
    let currentPt = segments[0].p2;
    visited.add(0);

    for (let step = 1; step < segments.length; step++) {
      let foundNext = false;
      for (let i = 0; i < segments.length; i++) {
        if (visited.has(i)) continue;
        const seg = segments[i];
        if (distance2D(currentPt, seg.p1) < tol) {
          visited.add(i);
          currentPt = seg.p2;
          foundNext = true;
          break;
        } else if (distance2D(currentPt, seg.p2) < tol) {
          visited.add(i);
          currentPt = seg.p1;
          foundNext = true;
          break;
        }
      }
      if (!foundNext) return false;
    }

    return distance2D(currentPt, segments[0].p1) < tol;
  }

  convertToShape(entities) {
    const nonConstruction = entities.filter(e => !e.construction);
    if (nonConstruction.length === 0) return null;

    // Handle single circle
    if (nonConstruction.length === 1 && nonConstruction[0].type === SKETCH_ENTITY_TYPES.CIRCLE) {
      const c = nonConstruction[0];
      const shape = new THREE.Shape();
      shape.absarc(c.center.x, c.center.y, c.radius, 0, Math.PI * 2, false);
      return shape;
    }

    // Handle single ellipse
    if (nonConstruction.length === 1 && nonConstruction[0].type === SKETCH_ENTITY_TYPES.ELLIPSE) {
      const el = nonConstruction[0];
      const shape = new THREE.Shape();
      shape.absellipse(el.center.x, el.center.y, el.radiusX, el.radiusY, 0, Math.PI * 2, false, el.rotation || 0);
      return shape;
    }

    // Order segments into continuous path
    const segs = nonConstruction.map(ent => {
      if (ent.type === SKETCH_ENTITY_TYPES.LINE) {
        return { type: 'line', p1: ent.p1, p2: ent.p2, orig: ent };
      }
      if (ent.type === SKETCH_ENTITY_TYPES.ARC) {
        const p1 = {
          x: ent.center.x + ent.radius * Math.cos(ent.startAngle),
          y: ent.center.y + ent.radius * Math.sin(ent.startAngle),
        };
        const p2 = {
          x: ent.center.x + ent.radius * Math.cos(ent.endAngle),
          y: ent.center.y + ent.radius * Math.sin(ent.endAngle),
        };
        return { type: 'arc', p1, p2, center: ent.center, radius: ent.radius, startAngle: ent.startAngle, endAngle: ent.endAngle, orig: ent };
      }
      return null;
    }).filter(Boolean);

    if (segs.length === 0) return null;

    const shape = new THREE.Shape();
    let current = segs[0];
    shape.moveTo(current.p1.x, current.p1.y);

    const remaining = segs.slice(1);
    let currEnd = current.p2;

    if (current.type === 'line') {
      shape.lineTo(current.p2.x, current.p2.y);
    } else if (current.type === 'arc') {
      shape.absarc(current.center.x, current.center.y, current.radius, current.startAngle, current.endAngle, false);
    }

    while (remaining.length > 0) {
      let nextIndex = -1;
      let flip = false;
      const tol = 1e-1;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (distance2D(currEnd, candidate.p1) < tol) {
          nextIndex = i;
          flip = false;
          break;
        } else if (distance2D(currEnd, candidate.p2) < tol) {
          nextIndex = i;
          flip = true;
          break;
        }
      }

      if (nextIndex === -1) {
        // Fallback: connect to closest
        break;
      }

      const next = remaining.splice(nextIndex, 1)[0];
      if (next.type === 'line') {
        const dest = flip ? next.p1 : next.p2;
        shape.lineTo(dest.x, dest.y);
        currEnd = dest;
      } else if (next.type === 'arc') {
        if (!flip) {
          shape.absarc(next.center.x, next.center.y, next.radius, next.startAngle, next.endAngle, false);
          currEnd = next.p2;
        } else {
          shape.absarc(next.center.x, next.center.y, next.radius, next.endAngle, next.startAngle, true);
          currEnd = next.p1;
        }
      }
    }

    shape.closePath();
    return shape;
  }

  mirrorEntities(entities, mirrorLine) {
    const { p1, p2 } = mirrorLine;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return [];

    const mirrorPt = (p) => {
      const u = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq;
      const projX = p1.x + u * dx;
      const projY = p1.y + u * dy;
      return {
        x: 2 * projX - p.x,
        y: 2 * projY - p.y,
      };
    };

    return entities.map(e => {
      const copy = { ...e, id: generateId(e.type) };
      if (e.p1 && e.p2) {
        copy.p1 = mirrorPt(e.p1);
        copy.p2 = mirrorPt(e.p2);
      }
      if (e.center) {
        copy.center = mirrorPt(e.center);
      }
      return copy;
    });
  }

  offsetEntities(entities, distance) {
    return entities.map(e => {
      const copy = { ...e, id: generateId(e.type) };
      if (e.type === SKETCH_ENTITY_TYPES.LINE) {
        const angle = Math.atan2(e.p2.y - e.p1.y, e.p2.x - e.p1.x);
        const perp = angle + Math.PI / 2;
        const ox = distance * Math.cos(perp);
        const oy = distance * Math.sin(perp);
        copy.p1 = { x: e.p1.x + ox, y: e.p1.y + oy };
        copy.p2 = { x: e.p2.x + ox, y: e.p2.y + oy };
      } else if (e.type === SKETCH_ENTITY_TYPES.CIRCLE || e.type === SKETCH_ENTITY_TYPES.ARC) {
        copy.radius = Math.max(0.1, e.radius + distance);
      }
      return copy;
    });
  }
}

export const sketchEngine = new SketchEngine();
export default SketchEngine;
