// CADWorks Pro - Math Utilities
import * as THREE from 'three';

export const EPSILON = 1e-8;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// Vector operations
export function vec2(x = 0, y = 0) { return new THREE.Vector2(x, y); }
export function vec3(x = 0, y = 0, z = 0) { return new THREE.Vector3(x, y, z); }

export function distance2D(p1, p2) {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

export function distance3D(p1, p2) {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2);
}

export function lerp(a, b, t) { return a + (b - a) * t; }

export function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// Angle between two 2D vectors
export function angle2D(v1, v2) {
  return Math.atan2(v2.y - v1.y, v2.x - v1.x);
}

// Point on circle
export function pointOnCircle(cx, cy, radius, angleDeg) {
  const rad = angleDeg * DEG2RAD;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

// Line-line intersection in 2D
export function lineLineIntersection(p1, p2, p3, p4) {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < EPSILON) return null;
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

// Point to line distance in 2D
export function pointToLineDistance(point, lineStart, lineEnd) {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = lenSq !== 0 ? dot / lenSq : -1;
  let xx, yy;
  if (param < 0) { xx = lineStart.x; yy = lineStart.y; }
  else if (param > 1) { xx = lineEnd.x; yy = lineEnd.y; }
  else { xx = lineStart.x + param * C; yy = lineStart.y + param * D; }
  return Math.sqrt((point.x - xx) ** 2 + (point.y - yy) ** 2);
}

// Create a rotation matrix from axis and angle
export function rotationMatrix(axis, angle) {
  const matrix = new THREE.Matrix4();
  matrix.makeRotationAxis(axis.clone().normalize(), angle);
  return matrix;
}

// Generate unique ID
let _idCounter = 0;
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${++_idCounter}`;
}

// Bounding box utilities
export function computeBoundingBox(geometry) {
  geometry.computeBoundingBox();
  return geometry.boundingBox;
}

// Create a 2D shape from points
export function createShapeFromPoints(points) {
  const shape = new THREE.Shape();
  if (points.length < 2) return shape;
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
}

// Matrix to transform 2D sketch points to 3D based on sketch plane
export function getSketchPlaneMatrix(plane) {
  const matrix = new THREE.Matrix4();
  switch (plane) {
    case 'XY':
    case 'Front':
      // Default - no rotation needed
      break;
    case 'XZ':
    case 'Top':
      matrix.makeRotationX(-Math.PI / 2);
      break;
    case 'YZ':
    case 'Right':
      matrix.makeRotationY(Math.PI / 2);
      break;
    default:
      break;
  }
  return matrix;
}

// Compute normal for a plane
export function getPlaneNormal(plane) {
  switch (plane) {
    case 'XY': case 'Front': return vec3(0, 0, 1);
    case 'XZ': case 'Top': return vec3(0, 1, 0);
    case 'YZ': case 'Right': return vec3(1, 0, 0);
    default: return vec3(0, 0, 1);
  }
}

// Triangulate a polygon (ear clipping - simple version)
export function triangulatePolygon(vertices) {
  if (vertices.length < 3) return [];
  const indices = [];
  const remaining = vertices.map((_, i) => i);
  
  while (remaining.length > 3) {
    let earFound = false;
    for (let i = 0; i < remaining.length; i++) {
      const prev = remaining[(i - 1 + remaining.length) % remaining.length];
      const curr = remaining[i];
      const next = remaining[(i + 1) % remaining.length];
      
      const a = vertices[prev], b = vertices[curr], c = vertices[next];
      // Check if ear (convex and no points inside)
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross > 0) {
        indices.push(prev, curr, next);
        remaining.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) {
      // Fallback: fan triangulation
      for (let i = 1; i < remaining.length - 1; i++) {
        indices.push(remaining[0], remaining[i], remaining[i + 1]);
      }
      break;
    }
  }
  if (remaining.length === 3) {
    indices.push(remaining[0], remaining[1], remaining[2]);
  }
  return indices;
}
