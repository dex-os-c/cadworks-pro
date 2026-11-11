/**
 * CADWorks Pro - Safe Deep Clone Utility
 * - Handles circular references cleanly via WeakMap
 * - Strips and prevents leaking Three.js prototypes (Object3D, BufferGeometry, Material, Texture)
 * - Safely converts Three.js math classes (Vector2, Vector3, Vector4, Euler, Quaternion, Color) to plain objects
 * - Clones Arrays, Sets, Maps, Dates, RegExps, and plain objects
 * - Skips DOM elements, functions, symbols
 */
export function safeDeepClone(val, seen = new WeakMap()) {
  if (val === null || typeof val !== 'object') {
    return val;
  }

  if (seen.has(val)) {
    return seen.get(val);
  }

  // Prevent leaking heavy Three.js prototypes / GPU resources into store snapshots
  if (val.isObject3D || val.isBufferGeometry || val.isMaterial || val.isTexture) {
    return undefined;
  }

  // Safely flatten Three.js math classes to plain serializable objects
  if (val.isVector3 || val.isVector2) {
    const copy = { x: val.x, y: val.y };
    if (val.z !== undefined) copy.z = val.z;
    return copy;
  }
  if (val.isEuler || val.isQuaternion) {
    const copy = { x: val.x, y: val.y, z: val.z };
    if (val.w !== undefined) copy.w = val.w;
    return copy;
  }
  if (val.isColor) {
    return { r: val.r, g: val.g, b: val.b };
  }

  // Date
  if (val instanceof Date) {
    return new Date(val.getTime());
  }

  // RegExp
  if (val instanceof RegExp) {
    return new RegExp(val.source, val.flags);
  }

  // Array
  if (Array.isArray(val)) {
    const arrCopy = [];
    seen.set(val, arrCopy);
    for (let i = 0; i < val.length; i++) {
      const cloned = safeDeepClone(val[i], seen);
      arrCopy.push(cloned !== undefined ? cloned : null);
    }
    return arrCopy;
  }

  // Set
  if (val instanceof Set) {
    const setCopy = new Set();
    seen.set(val, setCopy);
    for (const item of val) {
      const cloned = safeDeepClone(item, seen);
      if (cloned !== undefined) setCopy.add(cloned);
    }
    return setCopy;
  }

  // Map
  if (val instanceof Map) {
    const mapCopy = new Map();
    seen.set(val, mapCopy);
    for (const [k, v] of val.entries()) {
      const clonedKey = safeDeepClone(k, seen);
      const clonedVal = safeDeepClone(v, seen);
      mapCopy.set(clonedKey, clonedVal);
    }
    return mapCopy;
  }

  // Plain object
  const objCopy = {};
  seen.set(val, objCopy);
  for (const [key, value] of Object.entries(val)) {
    // Skip functions, symbols, and DOM elements
    if (typeof value === 'function' || typeof value === 'symbol' || (value && value.nodeType)) {
      continue;
    }
    const cloned = safeDeepClone(value, seen);
    if (cloned !== undefined) {
      objCopy[key] = cloned;
    }
  }
  return objCopy;
}

export default safeDeepClone;
