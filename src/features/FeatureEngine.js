// CADWorks Pro - Parametric Feature Rebuild Engine (Full Dependency Graph & Rollback)
import * as THREE from 'three';
import { FEATURE_TYPES, SKETCH_ENTITY_TYPES } from '../utils/constants.js';
import { geometryEngine } from '../kernel/GeometryEngine.js';

export class FeatureEngine {
  constructor() {
    this.geometryEngine = geometryEngine;
    this.sketchCache = {};
    this.featureGeometries = {};
  }

  /**
   * Rebuild the entire parametric model from the feature tree
   * @param {Array} features - Array of feature objects from the store
   * @param {object} sketchEntities - Map of sketchId -> entities
   * @param {number|null} rollbackIndex - If specified, only evaluate up to this index
   * @returns {{ bodies: THREE.BufferGeometry[], wireframes: THREE.EdgesGeometry[], massProperties: object|null, errors: Array }}
   */
  rebuild(features, sketchEntities = {}, rollbackIndex = null) {
    this.sketchCache = {};
    this.featureGeometries = {};
    let currentBody = null;
    const errors = [];

    const maxIdx = (rollbackIndex !== null && rollbackIndex !== undefined && rollbackIndex >= 0)
      ? rollbackIndex
      : features.length - 1;

    // Evaluate features sequentially up to maxIdx
    for (let i = 0; i <= maxIdx && i < features.length; i++) {
      const feature = features[i];
      if (feature.suppressed) continue;

      // Dependency check: if any parent is suppressed, skip this feature
      if (feature.parentIds && feature.parentIds.length > 0) {
        const parentSuppressed = feature.parentIds.some(pid => {
          const pf = features.find(f => f.id === pid || f.sketchId === pid);
          return pf && pf.suppressed;
        });
        if (parentSuppressed) continue;
      }

      try {
        const result = this._processFeature(feature, currentBody, sketchEntities);
        if (result !== undefined) {
          currentBody = result;
        }
      } catch (err) {
        console.warn(`FeatureEngine: Error in "${feature.name}" (${feature.type}):`, err);
        errors.push({ featureId: feature.id, featureName: feature.name, error: err.message });
      }
    }

    const bodies = [];
    const wireframes = [];

    if (currentBody) {
      bodies.push(currentBody);
      try {
        const edges = new THREE.EdgesGeometry(currentBody, 25);
        wireframes.push(edges);
      } catch (e) {
        // Fallback if edges geometry fails
      }
    }

    let massProperties = null;
    if (currentBody) {
      try {
        massProperties = this.geometryEngine.computeMassProperties(currentBody);
      } catch (err) {
        // Fallback
      }
    }

    return { bodies, wireframes, massProperties, errors };
  }

  _processFeature(feature, currentBody, sketchEntities) {
    switch (feature.type) {
      case FEATURE_TYPES.SKETCH:
        return this._processSketch(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.EXTRUDE_BOSS:
        return this._processExtrudeBoss(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.EXTRUDE_CUT:
        return this._processExtrudeCut(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.REVOLVE_BOSS:
        return this._processRevolveBoss(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.REVOLVE_CUT:
        return this._processRevolveCut(feature, currentBody, sketchEntities);

      case FEATURE_TYPES.SWEEP_BOSS:
        return this._processSweep(feature, currentBody, sketchEntities, false);

      case FEATURE_TYPES.SWEEP_CUT:
        return this._processSweep(feature, currentBody, sketchEntities, true);

      case FEATURE_TYPES.LOFT_BOSS:
        return this._processLoft(feature, currentBody, sketchEntities, false);

      case FEATURE_TYPES.LOFT_CUT:
        return this._processLoft(feature, currentBody, sketchEntities, true);

      case FEATURE_TYPES.FILLET:
        return this._processFillet(feature, currentBody);

      case FEATURE_TYPES.CHAMFER:
        return this._processChamfer(feature, currentBody);

      case FEATURE_TYPES.SHELL:
        return this._processShell(feature, currentBody);

      case FEATURE_TYPES.HOLE:
        return this._processHole(feature, currentBody);

      case FEATURE_TYPES.LINEAR_PATTERN:
        return this._processLinearPattern(feature, currentBody);

      case FEATURE_TYPES.CIRCULAR_PATTERN:
        return this._processCircularPattern(feature, currentBody);

      case FEATURE_TYPES.MIRROR:
        return this._processMirror(feature, currentBody);

      case FEATURE_TYPES.BOOLEAN:
        return this._processBoolean(feature, currentBody);

      default:
        return currentBody;
    }
  }

  _processSketch(feature, currentBody, sketchEntities) {
    const entities = feature.entities || sketchEntities[feature.sketchId] || [];
    this.sketchCache[feature.sketchId || feature.id] = {
      entities,
      plane: feature.plane || 'Front',
    };
    return currentBody;
  }

  _getSketchForFeature(feature, sketchEntities) {
    const sketchId = feature.sketchId || feature.sketchRef;
    if (sketchId && this.sketchCache[sketchId]) {
      return this.sketchCache[sketchId];
    }
    if (sketchId && sketchEntities[sketchId]) {
      return { entities: sketchEntities[sketchId], plane: feature.plane || 'Front' };
    }
    // Fallback: search any available sketch
    const keys = Object.keys(sketchEntities);
    if (keys.length > 0) {
      return { entities: sketchEntities[keys[keys.length - 1]], plane: 'Front' };
    }
    return null;
  }

  _processExtrudeBoss(feature, currentBody, sketchEntities) {
    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData || !sketchData.entities || sketchData.entities.length === 0) {
      return currentBody;
    }

    const depth = feature.depth ?? feature.distance ?? 25;
    const isMidplane = feature.direction === 'midplane' || feature.symmetric;
    const isThrough = feature.direction === 'throughall';
    const isThin = feature.thin || false;
    const wallThickness = feature.wallThickness || feature.thickness || 2;
    const flip = feature.flip || false;

    const shape = this.geometryEngine.shapeFromSketchEntities(sketchData.entities, {
      thin: isThin,
      wallThickness: wallThickness,
    });

    const extruded = this.geometryEngine.extrudeProfile(shape, depth, sketchData.plane, {
      symmetric: isMidplane,
      endCondition: isThrough ? 'through' : (isMidplane ? 'midplane' : 'blind'),
      flip: flip,
      plane: sketchData.plane,
    });

    this.featureGeometries[feature.id] = extruded;
    return this.geometryEngine.booleanUnion(currentBody, extruded);
  }

  _processExtrudeCut(feature, currentBody, sketchEntities) {
    if (!currentBody) return currentBody;

    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData || !sketchData.entities || sketchData.entities.length === 0) {
      return currentBody;
    }

    const depth = feature.depth ?? feature.distance ?? 25;
    const isMidplane = feature.direction === 'midplane' || feature.symmetric;
    const isThrough = feature.direction === 'throughall';
    const isThin = feature.thin || false;
    const wallThickness = feature.wallThickness || feature.thickness || 2;
    const flip = feature.flip || false;

    const shape = this.geometryEngine.shapeFromSketchEntities(sketchData.entities, {
      thin: isThin,
      wallThickness: wallThickness,
    });

    const cutGeom = this.geometryEngine.extrudeProfile(shape, depth, sketchData.plane, {
      symmetric: isMidplane,
      endCondition: isThrough ? 'through' : (isMidplane ? 'midplane' : 'blind'),
      flip: flip,
      plane: sketchData.plane,
    });

    this.featureGeometries[feature.id] = cutGeom;
    return this.geometryEngine.booleanSubtract(currentBody, cutGeom);
  }

  _processRevolveBoss(feature, currentBody, sketchEntities) {
    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData || !sketchData.entities || sketchData.entities.length === 0) {
      return currentBody;
    }

    const angleDeg = feature.angle ?? 360;
    const angleRad = (angleDeg * Math.PI) / 180;
    const shape = this.geometryEngine.shapeFromSketchEntities(sketchData.entities);

    const revolved = this.geometryEngine.revolveProfile(shape, null, angleRad);

    this.featureGeometries[feature.id] = revolved;
    return this.geometryEngine.booleanUnion(currentBody, revolved);
  }

  _processRevolveCut(feature, currentBody, sketchEntities) {
    if (!currentBody) return currentBody;

    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData || !sketchData.entities || sketchData.entities.length === 0) {
      return currentBody;
    }

    const angleDeg = feature.angle ?? 360;
    const angleRad = (angleDeg * Math.PI) / 180;
    const shape = this.geometryEngine.shapeFromSketchEntities(sketchData.entities);

    const revolved = this.geometryEngine.revolveProfile(shape, null, angleRad);

    this.featureGeometries[feature.id] = revolved;
    return this.geometryEngine.booleanSubtract(currentBody, revolved);
  }

  _processSweep(feature, currentBody, sketchEntities, isCut = false) {
    const sketchData = this._getSketchForFeature(feature, sketchEntities);
    if (!sketchData) return currentBody;

    const shape = this.geometryEngine.shapeFromSketchEntities(sketchData.entities);
    const pts = (feature.pathPoints || [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 20, z: 10 },
      { x: 10, y: 40, z: 20 },
    ]).map(p => new THREE.Vector3(p.x, p.y, p.z));

    const path = new THREE.CatmullRomCurve3(pts);
    const swept = this.geometryEngine.sweepProfile(shape, path);

    this.featureGeometries[feature.id] = swept;
    return isCut
      ? this.geometryEngine.booleanSubtract(currentBody, swept)
      : this.geometryEngine.booleanUnion(currentBody, swept);
  }

  _processLoft(feature, currentBody, sketchEntities, isCut = false) {
    const shapes = [];
    const profiles = feature.profiles || ['sketch_01', 'sketch_02'];

    for (const pId of profiles) {
      const data = this.sketchCache[pId];
      if (data) {
        shapes.push(this.geometryEngine.shapeFromSketchEntities(data.entities));
      }
    }

    if (shapes.length < 2) {
      // Fallback 2-layer loft
      const s1 = new THREE.Shape();
      s1.moveTo(-15, -15); s1.lineTo(15, -15); s1.lineTo(15, 15); s1.lineTo(-15, 15); s1.closePath();
      const s2 = new THREE.Shape();
      s2.absarc(0, 0, 10, 0, Math.PI * 2);
      shapes.push(s1, s2);
    }

    const lofted = this.geometryEngine.loftProfiles(shapes, { height: feature.height || 40 });
    this.featureGeometries[feature.id] = lofted;

    return isCut
      ? this.geometryEngine.booleanSubtract(currentBody, lofted)
      : this.geometryEngine.booleanUnion(currentBody, lofted);
  }

  _processFillet(feature, currentBody) {
    if (!currentBody) return currentBody;
    const radius = feature.radius ?? 2;
    return this.geometryEngine.applyFillet(currentBody, [], radius);
  }

  _processChamfer(feature, currentBody) {
    if (!currentBody) return currentBody;
    const dist = feature.distance ?? feature.radius ?? 2;
    return this.geometryEngine.applyChamfer(currentBody, [], dist);
  }

  _processShell(feature, currentBody) {
    if (!currentBody) return currentBody;
    const thickness = feature.thickness ?? 2;
    return this.geometryEngine.applyShell(currentBody, thickness);
  }

  _processHole(feature, currentBody) {
    if (!currentBody) return currentBody;
    const diameter = feature.diameter ?? 10;
    const depth = feature.depth ?? 30;
    const pos = feature.position ? new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z) : new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3(0, 0, 1);
    return this.geometryEngine.createHole(currentBody, pos, dir, diameter, depth, feature.holeType || 'simple');
  }

  _processLinearPattern(feature, currentBody) {
    if (!currentBody) return currentBody;
    const dir = new THREE.Vector3(feature.directionX || 1, feature.directionY || 0, feature.directionZ || 0);
    const count = feature.count || 3;
    const spacing = feature.spacing || 20;
    return this.geometryEngine.linearPattern(currentBody, dir, count, spacing);
  }

  _processCircularPattern(feature, currentBody) {
    if (!currentBody) return currentBody;
    const axis = new THREE.Vector3(feature.axisX || 0, feature.axisY || 1, feature.axisZ || 0);
    const count = feature.count || 4;
    const angle = (feature.angle || 360) * (Math.PI / 180);
    return this.geometryEngine.circularPattern(currentBody, axis, count, angle);
  }

  _processMirror(feature, currentBody) {
    if (!currentBody) return currentBody;
    const plane = feature.plane || 'Right';
    return this.geometryEngine.mirrorGeometry(currentBody, plane);
  }

  _processBoolean(feature, currentBody) {
    if (!currentBody) return currentBody;
    const tool = feature.toolFeatureId ? this.featureGeometries[feature.toolFeatureId] : null;
    if (!tool) return currentBody;

    switch (feature.operation) {
      case 'subtract':
      case 'cut':
        return this.geometryEngine.booleanSubtract(currentBody, tool);
      case 'intersect':
        return this.geometryEngine.booleanIntersect(currentBody, tool);
      case 'union':
      default:
        return this.geometryEngine.booleanUnion(currentBody, tool);
    }
  }
}

export const featureEngine = new FeatureEngine();
export default FeatureEngine;
