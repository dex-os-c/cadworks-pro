// CADWorks Pro - Verification Test Suite
// Covers 2D constraint solver, parametric feature rebuild, assembly mates, round-trip export/import, and FEA
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { constraintSolver } from '../src/kernel/ConstraintSolver.js';
import { featureEngine } from '../src/features/FeatureEngine.js';
import { geometryEngine } from '../src/kernel/GeometryEngine.js';
import { AssemblyManager, AssemblyComponent } from '../src/assembly/AssemblyManager.js';
import { exportEngine } from '../src/kernel/ExportEngine.js';
import { importEngine } from '../src/kernel/ImportEngine.js';
import { feaEngine } from '../src/simulation/FEAEngine.js';
import { FEATURE_TYPES, SKETCH_ENTITY_TYPES, CONSTRAINT_TYPES, MATE_TYPES } from '../src/utils/constants.js';

// ==========================================
// 1. 2D CONSTRAINT SOLVER VERIFICATION
// ==========================================
test('ConstraintSolver: coupled geometric system (horizontal, perpendicular, coincident, dimensions)', () => {
  const entities = [
    { id: 'l1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 0, y: 0 }, p2: { x: 45, y: 12 } },
    { id: 'l2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 48, y: 10 }, p2: { x: 50, y: 45 } },
  ];

  const constraints = [
    { id: 'c1', type: CONSTRAINT_TYPES.FIX, entity1Id: 'l1', point1: 'p1' },
    { id: 'c2', type: CONSTRAINT_TYPES.HORIZONTAL, entity1Id: 'l1' },
    { id: 'c3', type: CONSTRAINT_TYPES.DIMENSION, entity1Id: 'l1', value: 60 },
    { id: 'c4', type: CONSTRAINT_TYPES.COINCIDENT, entity1Id: 'l1', entity2Id: 'l2', point1: 'p2', point2: 'p1' },
    { id: 'c5', type: CONSTRAINT_TYPES.PERPENDICULAR, entity1Id: 'l1', entity2Id: 'l2' },
    { id: 'c6', type: CONSTRAINT_TYPES.DIMENSION, entity1Id: 'l2', value: 40 },
  ];

  const result = constraintSolver.solve(entities, constraints);

  assert.equal(result.converged, true, 'Solver must converge');
  assert.ok(result.error < 1e-3, `Residual ${result.error} must be < 1e-3`);

  const solvedL1 = entities.find(e => e.id === 'l1');
  const solvedL2 = entities.find(e => e.id === 'l2');

  // L1 start at (0,0) and horizontal with length 60
  assert.ok(Math.abs(solvedL1.p1.x) < 1e-3);
  assert.ok(Math.abs(solvedL1.p1.y) < 1e-3);
  assert.ok(Math.abs(solvedL1.p2.y) < 1e-3, 'L1 must be horizontal (y = 0)');
  assert.ok(Math.abs(solvedL1.p2.x - 60) < 1e-3, 'L1 must have length 60');

  // L2 coincident with L1 at (60, 0)
  assert.ok(Math.abs(solvedL2.p1.x - 60) < 1e-3, 'L2 p1.x must be 60');
  assert.ok(Math.abs(solvedL2.p1.y) < 1e-3, 'L2 p1.y must be 0');

  // L2 perpendicular to L1 with length 40
  const l2dx = solvedL2.p2.x - solvedL2.p1.x;
  const l2dy = solvedL2.p2.y - solvedL2.p1.y;
  assert.ok(Math.abs(l2dx) < 1e-3, 'L2 must be vertical (dx ~ 0)');
  assert.ok(Math.abs(Math.abs(l2dy) - 40) < 1e-3, 'L2 must have length 40');
});

test('ConstraintSolver: equal length & parallel constraints', () => {
  const entities = [
    { id: 'l1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 } },
    { id: 'l2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 0, y: 25 }, p2: { x: 30, y: 35 } },
  ];

  const constraints = [
    { id: 'c1', type: CONSTRAINT_TYPES.FIX, entity1Id: 'l1' },
    { id: 'c2', type: CONSTRAINT_TYPES.PARALLEL, entity1Id: 'l1', entity2Id: 'l2' },
    { id: 'c3', type: CONSTRAINT_TYPES.EQUAL, entity1Id: 'l1', entity2Id: 'l2' },
  ];

  const result = constraintSolver.solve(entities, constraints);
  assert.equal(result.converged, true);
  assert.ok(result.error < 1e-3, `Error ${result.error} must be < 1e-3`);

  const l2 = entities.find(e => e.id === 'l2');
  const l2dy = l2.p2.y - l2.p1.y;
  const l2dx = l2.p2.x - l2.p1.x;
  assert.ok(Math.abs(l2dy) < 1e-3, 'L2 must be parallel to horizontal L1');
  assert.ok(Math.abs(l2dx - 50) < 1e-3, 'L2 must be equal length to L1 (50)');
});

// ==========================================
// 2. PARAMETRIC FEATURE ENGINE VERIFICATION
// ==========================================
test('FeatureEngine: extrude boss midplane and through cut', () => {
  const sketchId = 'sk_box_cut';
  const sketchEntities = {
    [sketchId]: [
      { id: 's1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -20, y: -20 }, p2: { x: 20, y: -20 } },
      { id: 's2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 20, y: -20 }, p2: { x: 20, y: 20 } },
      { id: 's3', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 20, y: 20 }, p2: { x: -20, y: 20 } },
      { id: 's4', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -20, y: 20 }, p2: { x: -20, y: -20 } },
    ],
    'sk_hole': [
      { id: 'c1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 8 },
    ],
  };

  const features = [
    {
      id: 'f_sk1',
      type: FEATURE_TYPES.SKETCH,
      sketchId: sketchId,
      plane: 'Front',
    },
    {
      id: 'f_ext1',
      name: 'Base-Extrude',
      type: FEATURE_TYPES.EXTRUDE_BOSS,
      sketchId: sketchId,
      depth: 30,
      direction: 'midplane',
      parentIds: ['f_sk1'],
    },
    {
      id: 'f_sk2',
      type: FEATURE_TYPES.SKETCH,
      sketchId: 'sk_hole',
      plane: 'Front',
    },
    {
      id: 'f_cut1',
      name: 'Through-Cut',
      type: FEATURE_TYPES.EXTRUDE_CUT,
      sketchId: 'sk_hole',
      depth: 50,
      direction: 'throughall',
      parentIds: ['f_sk2'],
    },
  ];

  const result = featureEngine.rebuild(features, sketchEntities);
  assert.equal(result.bodies.length, 1, 'Should produce 1 solid body');

  const solid = result.bodies[0];
  solid.computeBoundingBox();
  const box = solid.boundingBox;

  // Midplane extrude bounds: Z should span roughly -15 to +15
  assert.ok(Math.abs(box.min.z - (-15)) < 1e-2, `Box min.z is ${box.min.z}`);
  assert.ok(Math.abs(box.max.z - 15) < 1e-2, `Box max.z is ${box.max.z}`);

  // Extrude cut creates cylindrical hole: vertex count should exceed standard box (36 vertices)
  const posCount = solid.attributes.position.count;
  assert.ok(posCount > 36, `Position count ${posCount} indicates hole was cut`);
});

test('FeatureEngine: rollback bar stops rebuild at rollbackIndex', () => {
  const sketchId = 'sk_base';
  const sketchEntities = {
    [sketchId]: [
      { id: 's1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -10, y: -10 }, p2: { x: 10, y: -10 } },
      { id: 's2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 10, y: -10 }, p2: { x: 10, y: 10 } },
      { id: 's3', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 10, y: 10 }, p2: { x: -10, y: 10 } },
      { id: 's4', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -10, y: 10 }, p2: { x: -10, y: -10 } },
    ],
  };

  const features = [
    { id: 'f_sk1', type: FEATURE_TYPES.SKETCH, sketchId },
    { id: 'f_ext1', type: FEATURE_TYPES.EXTRUDE_BOSS, sketchId, depth: 10 },
    { id: 'f_fillet', type: FEATURE_TYPES.FILLET, radius: 2 },
  ];

  // Rollback to index 1 (skips fillet at index 2)
  const result = featureEngine.rebuild(features, sketchEntities, 1);
  assert.equal(result.bodies.length, 1);
  assert.equal(result.errors.length, 0);
});

test('FeatureEngine: thin feature creates solid walls from open sketch', () => {
  const sketchId = 'sk_thin_line';
  const sketchEntities = {
    [sketchId]: [
      { id: 'tl1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 } },
    ],
  };

  const features = [
    { id: 'f_sk1', type: FEATURE_TYPES.SKETCH, sketchId },
    {
      id: 'f_thin_ext',
      type: FEATURE_TYPES.EXTRUDE_BOSS,
      sketchId,
      depth: 20,
      thin: true,
      wallThickness: 4,
    },
  ];

  const result = featureEngine.rebuild(features, sketchEntities);
  assert.equal(result.bodies.length, 1);
  const solid = result.bodies[0];
  solid.computeBoundingBox();
  assert.ok(Math.abs(solid.boundingBox.max.x - solid.boundingBox.min.x - 50) < 1e-2);
});

// ==========================================
// 3. ASSEMBLY MATE SOLVER VERIFICATION
// ==========================================
test('AssemblyManager: coincident mate aligns contact surfaces', () => {
  const mgr = new AssemblyManager();
  const c1 = mgr.insertComponent('Base', new THREE.BoxGeometry(40, 20, 40), true);
  const c2 = mgr.insertComponent('Plate', new THREE.BoxGeometry(40, 10, 40), false);

  c2.position.set(0, 50, 0);
  c2.updateMatrix();

  mgr.addMate(MATE_TYPES.COINCIDENT, c1.id, 'top', c2.id, 'bottom', 0);
  const result = mgr.solve();

  assert.ok(result.error < 1e-3, `Mate solve residual ${result.error} must be < 1e-3`);

  const topFaceC1 = c1.getFaceReference('top');
  const botFaceC2 = c2.getFaceReference('bottom');

  assert.ok(Math.abs(topFaceC1.point.y - botFaceC2.point.y) < 1e-3, 'Faces must be in exact contact');
  assert.ok(topFaceC1.normal.dot(botFaceC2.normal) < -0.99, 'Face normals must oppose');
});

test('AssemblyManager: distance mate maintains exact offset', () => {
  const mgr = new AssemblyManager();
  const c1 = mgr.insertComponent('FixedBase', new THREE.BoxGeometry(30, 10, 30), true);
  const c2 = mgr.insertComponent('HoverBlock', new THREE.BoxGeometry(30, 10, 30), false);

  mgr.addMate(MATE_TYPES.DISTANCE, c1.id, 'top', c2.id, 'bottom', 15.0);
  const result = mgr.solve();
  assert.ok(result.error < 1e-3, `Mate solve residual ${result.error} must be < 1e-3`);

  const topFaceC1 = c1.getFaceReference('top');
  const botFaceC2 = c2.getFaceReference('bottom');
  const gap = Math.abs(botFaceC2.point.y - topFaceC1.point.y);

  assert.ok(Math.abs(gap - 15.0) < 1e-3, `Gap ${gap} must be 15.0mm`);
});

// ==========================================
// 4. CAD IMPORT / EXPORT ROUND-TRIP
// ==========================================
test('ExportEngine & ImportEngine: STL binary round-trip preserves geometry bounds', async () => {
  const geom = new THREE.BoxGeometry(30, 20, 10);
  const binBuffer = exportEngine.exportSTL(geom, true);
  const arrayBuf = await binBuffer.arrayBuffer();

  const imported = importEngine.importSTL(arrayBuf);
  imported.computeBoundingBox();

  const origBox = geom.boundingBox || (geom.computeBoundingBox(), geom.boundingBox);
  const impBox = imported.boundingBox;

  assert.ok(Math.abs(impBox.min.x - origBox.min.x) < 1e-2);
  assert.ok(Math.abs(impBox.max.x - origBox.max.x) < 1e-2);
  assert.ok(Math.abs(impBox.min.y - origBox.min.y) < 1e-2);
  assert.ok(Math.abs(impBox.max.y - origBox.max.y) < 1e-2);
  assert.ok(Math.abs(impBox.min.z - origBox.min.z) < 1e-2);
  assert.ok(Math.abs(impBox.max.z - origBox.max.z) < 1e-2);
  const expectedCount = geom.index ? geom.toNonIndexed().attributes.position.count : geom.attributes.position.count;
  assert.equal(imported.attributes.position.count, expectedCount);
});

test('ExportEngine & ImportEngine: DXF sketch round-trip preserves entity data', async () => {
  const entities = [
    { id: 'l1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 0, y: 0 }, p2: { x: 100, y: 50 } },
    { id: 'c1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 25, y: 25 }, radius: 15 },
  ];

  const dxfBlob = exportEngine.exportDXF(entities);
  const dxfStr = await dxfBlob.text();
  const importedEntities = importEngine.importDXF(dxfStr);

  assert.equal(importedEntities.length, 2, 'Must import 2 entities');
  const line = importedEntities.find(e => e.type === SKETCH_ENTITY_TYPES.LINE);
  const circle = importedEntities.find(e => e.type === SKETCH_ENTITY_TYPES.CIRCLE);

  assert.ok(line && Math.abs(line.p2.x - 100) < 1e-3 && Math.abs(line.p2.y - 50) < 1e-3);
  assert.ok(circle && Math.abs(circle.center.x - 25) < 1e-3 && Math.abs(circle.radius - 15) < 1e-3);
});

// ==========================================
// 5. FEA LINEAR STATIC SOLVER VERIFICATION
// ==========================================
test('FEAEngine: cantilever beam deflection matches Euler-Bernoulli analytical formula', () => {
  const geom = new THREE.BoxGeometry(20, 30, 500);
  feaEngine.generateMesh(geom, 10);
  const res = feaEngine.solve(1000, 350e6, 200e9);

  assert.ok(res.maxDisplacementMM > 0, 'Deflection must be positive');
  const errorPercent = Math.abs(res.maxDisplacementMM - res.theoreticalDispMM) / res.theoreticalDispMM * 100;

  assert.ok(errorPercent < 1.0, `FEA deflection error ${errorPercent.toFixed(3)}% must be < 1%`);
});
