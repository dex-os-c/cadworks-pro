// CADWorks Pro - Verification Test Suite
// Comprehensive industrial-grade test suite covering:
// 1. 2D Constraint Solver (coupled systems, DOF analysis, conflict diagnostics)
// 2. Parametric Feature Engine (midplane, through cut, rollback, thin features)
// 3. Boundary Representation (B-Rep) Topology (Euler-Poincaré, 2-manifold, mass properties)
// 4. 3D Solid Operations (extrude with holes, revolve 360/partial, sweep, loft, fillet, chamfer, shell, boolean union/subtract/intersect)
// 5. Multi-Body Assembly Engine (coincident, distance, concentric, parallel, perpendicular, tangent, width, path, exploded view)
// 6. CAD Data Exchange (STEP AP214/AP242 B-Rep, IGES 5.3 MSBO, binary STL, AutoCAD DXF)
// 7. 3D Solid Finite Element Analysis (Tet4/Tet10 tetrahedral meshing, 12x12 stiffness matrix, PCG solver, Cauchy & principal stress tensor, von Mises, FOS)
// 8. 2D Engineering Drawings (orthographic projections with HLR, dimensions, GD&T, SVG/DXF export)

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { constraintSolver } from '../src/kernel/ConstraintSolver.js';
import { featureEngine } from '../src/features/FeatureEngine.js';
import { geometryEngine } from '../src/kernel/GeometryEngine.js';
import {
  Vertex,
  Edge,
  CoEdge,
  Loop,
  Face,
  Shell,
  SolidBody,
} from '../src/kernel/Topology.js';
import {
  createSolidBox,
  createSolidCylinder,
  extrudeSolid,
  revolveSolid,
  sweepSolid,
  loftSolid,
  filletSolid,
  chamferSolid,
  shellSolid,
  booleanUnion,
  booleanSubtract,
  booleanIntersect,
  solidToBufferGeometry,
  bufferGeometryToSolid,
} from '../src/kernel/BRep.js';
import { AssemblyManager, AssemblyComponent } from '../src/assembly/AssemblyManager.js';
import { exportEngine } from '../src/kernel/ExportEngine.js';
import { importEngine } from '../src/kernel/ImportEngine.js';
import { feaEngine, ELEMENT_TYPES } from '../src/simulation/FEAEngine.js';
import { drawingEngine, PROJECTION_VIEWS, SHEET_SIZES, GDT_SYMBOLS } from '../src/drawings/DrawingEngine.js';
import { FEATURE_TYPES, SKETCH_ENTITY_TYPES, CONSTRAINT_TYPES, MATE_TYPES } from '../src/utils/constants.js';

// ============================================================================
// 1. 2D CONSTRAINT SOLVER VERIFICATION
// ============================================================================

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

test('ConstraintSolver: under-constrained degrees of freedom (DOF) count and over-constrained conflict detection', () => {
  // Case A: Under-constrained single line (4 variables: x1, y1, x2, y2)
  const lineEnt = [
    { id: 'l1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 0, y: 0 }, p2: { x: 30, y: 0 } },
  ];
  // 1 fix constraint on p1 (removes 2 DOF -> 2 DOF left), 1 horizontal constraint (removes 1 DOF -> 1 DOF left)
  const underConstraints = [
    { id: 'c1', type: CONSTRAINT_TYPES.FIX, entity1Id: 'l1', point1: 'p1' },
    { id: 'c2', type: CONSTRAINT_TYPES.HORIZONTAL, entity1Id: 'l1' },
  ];
  const underRes = constraintSolver.solve(lineEnt, underConstraints);
  assert.equal(underRes.status, 'under_constrained');
  assert.equal(underRes.dof, 1, `Line with fixed point and horizontal should have 1 DOF, got ${underRes.dof}`);

  // Case B: Over-constrained conflicting dimensions on same entity
  const conflictConstraints = [
    { id: 'c1', type: CONSTRAINT_TYPES.FIX, entity1Id: 'l1', point1: 'p1' },
    { id: 'c2', type: CONSTRAINT_TYPES.DIMENSION, entity1Id: 'l1', value: 30 },
    { id: 'c3', type: CONSTRAINT_TYPES.DIMENSION, entity1Id: 'l1', value: 60 },
  ];
  const conflictRes = constraintSolver.solve(lineEnt, conflictConstraints);
  assert.equal(conflictRes.status, 'over_constrained');
  assert.ok(
    conflictRes.conflict || conflictRes.diagnostics.some(d => d.type === 'conflict'),
    'Must identify conflicting constraint diagnostic'
  );
});

// ============================================================================
// 2. PARAMETRIC FEATURE ENGINE VERIFICATION
// ============================================================================

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

// ============================================================================
// 3. BOUNDARY REPRESENTATION (B-REP) TOPOLOGY VALIDATION
// ============================================================================

test('BRep Topology: Euler-Poincaré characteristic, 2-manifold verification, and mass properties', () => {
  // 1. Box primitive
  const boxSolid = createSolidBox(20, 30, 40);
  const shell = boxSolid.outerShell;
  assert.ok(shell, 'Solid must have outer shell');
  assert.equal(shell.getVertices().length, 8, 'Box must have 8 vertices');
  assert.equal(shell.getEdges().length, 12, 'Box must have 12 edges');
  assert.equal(shell.faces.length, 6, 'Box must have 6 faces');

  // Euler characteristic: V - E + F = 8 - 12 + 6 = 2
  const chi = shell.getEulerCharacteristic();
  assert.equal(chi, 2, `Box Euler characteristic must be 2, got ${chi}`);
  assert.equal(shell.genus, 0, 'Box genus must be 0');

  // 2-Manifold verification
  assert.equal(shell.isClosed(), true, 'Box shell must be closed');
  assert.equal(shell.isManifold(), true, 'Box shell must be 2-manifold');
  assert.equal(boxSolid.isClosed(), true);
  assert.equal(boxSolid.isManifold(), true);

  // Volume: 20 * 30 * 40 = 24000
  const vol = boxSolid.computeVolume();
  assert.ok(Math.abs(vol - 24000) < 1.0, `Volume ${vol} must be 24000`);

  // Surface area: 2 * (20*30 + 30*40 + 20*40) = 2 * (600 + 1200 + 800) = 5200
  const sa = boxSolid.computeSurfaceArea();
  assert.ok(Math.abs(sa - 5200) < 1.0, `Surface area ${sa} must be 5200`);

  // Mass properties
  const massProps = boxSolid.computeMassProperties(7900); // Steel density
  assert.ok(massProps.mass > 0);
  assert.ok(massProps.momentsOfInertia.Ixx > 0);
  assert.ok(massProps.momentsOfInertia.Iyy > 0);
  assert.ok(massProps.momentsOfInertia.Izz > 0);

  // 2. Cylinder primitive
  const cylSolid = createSolidCylinder(10, 50, 32);
  const cylShell = cylSolid.outerShell;
  assert.equal(cylShell.getVertices().length, 64, '32-segment cylinder must have 64 vertices');
  assert.equal(cylShell.getEdges().length, 96, '32-segment cylinder must have 96 edges');
  assert.equal(cylShell.faces.length, 34, '32-segment cylinder must have 34 faces (2 caps + 32 quads)');
  assert.equal(cylShell.getEulerCharacteristic(), 2);
  assert.equal(cylShell.isClosed(), true);
  assert.equal(cylShell.isManifold(), true);
});

// ============================================================================
// 4. 3D SOLID OPERATIONS (EXTRUDE, REVOLVE, SWEEP, LOFT, FILLET, CHAMFER, SHELL, BOOLEAN)
// ============================================================================

test('BRep Solid Operations: extrude with hole loops, full/partial revolve, sweep, and loft', () => {
  // 1. Extrude with inner hole wire loop
  const outerLoop = [
    new THREE.Vector3(-25, -25, 0),
    new THREE.Vector3(25, -25, 0),
    new THREE.Vector3(25, 25, 0),
    new THREE.Vector3(-25, 25, 0),
  ];
  const innerHole = [
    new THREE.Vector3(-10, -10, 0),
    new THREE.Vector3(10, -10, 0),
    new THREE.Vector3(10, 10, 0),
    new THREE.Vector3(-10, 10, 0),
  ];
  const extrudeSolidResult = extrudeSolid(outerLoop, 30, new THREE.Vector3(0, 0, 1), {
    holes: [innerHole],
    symmetric: true,
  });
  assert.ok(extrudeSolidResult, 'Must generate extruded solid');
  assert.ok(extrudeSolidResult.getFaces().length >= 10, 'Outer + inner hole walls + 2 caps >= 10 faces');
  const extBox = extrudeSolidResult.computeBoundingBox();
  assert.ok(Math.abs(extBox.min.z - (-15)) < 1e-3);
  assert.ok(Math.abs(extBox.max.z - 15) < 1e-3);

  // 2. Revolve: 360 deg full revolution vs 180 deg partial revolution with capped faces
  const profile = [
    new THREE.Vector3(10, 0, -20),
    new THREE.Vector3(20, 0, -20),
    new THREE.Vector3(20, 0, 20),
    new THREE.Vector3(10, 0, 20),
  ];
  const fullRevolve = revolveSolid(profile, new THREE.Vector3(0, 0, 1), Math.PI * 2, { segments: 16 });
  assert.ok(fullRevolve.isClosed(), 'Full 360 revolve must be closed');

  const partialRevolve = revolveSolid(profile, new THREE.Vector3(0, 0, 1), Math.PI, { segments: 8 });
  assert.ok(partialRevolve.isClosed(), 'Partial revolve with start/end caps must be closed');
  assert.equal(partialRevolve.outerShell.getEulerCharacteristic(), 2);

  // 3. Sweep along 3D polyline curve
  const sweepProfile = [
    new THREE.Vector3(-5, -5, 0),
    new THREE.Vector3(5, -5, 0),
    new THREE.Vector3(5, 5, 0),
    new THREE.Vector3(-5, 5, 0),
  ];
  const sweepPath = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 20, 10),
    new THREE.Vector3(10, 40, 30),
    new THREE.Vector3(30, 50, 50),
  ];
  const sweepResult = sweepSolid(sweepProfile, sweepPath);
  assert.ok(sweepResult.outerShell.faces.length > 0, 'Sweep solid must produce faces');
  assert.ok(sweepResult.isClosed(), 'Sweep solid must be closed');

  // 4. Loft across multiple cross-sections
  const sec1 = [
    new THREE.Vector3(-10, -10, 0),
    new THREE.Vector3(10, -10, 0),
    new THREE.Vector3(10, 10, 0),
    new THREE.Vector3(-10, 10, 0),
  ];
  const sec2 = [
    new THREE.Vector3(-20, -20, 30),
    new THREE.Vector3(20, -20, 30),
    new THREE.Vector3(20, 20, 30),
    new THREE.Vector3(-20, 20, 30),
  ];
  const loftResult = loftSolid([sec1, sec2], { samplesPerProfile: 16 });
  assert.ok(loftResult.outerShell.faces.length > 0, 'Loft solid must produce faces');
  assert.ok(loftResult.isClosed(), 'Loft solid must be closed');
});

test('BRep Solid Operations: fillet, chamfer, shell, and boolean CSG operations', () => {
  const boxA = createSolidBox(40, 40, 40, new THREE.Vector3(0, 0, 0));
  const boxB = createSolidBox(40, 40, 40, new THREE.Vector3(20, 20, 0));

  // Fillet & Chamfer
  const filleted = filletSolid(boxA, [0, 1], 3);
  assert.ok(filleted, 'Fillet operation must succeed');
  assert.ok(filleted.computeVolume() > 0);

  const chamfered = chamferSolid(boxA, [2, 3], 3);
  assert.ok(chamfered, 'Chamfer operation must succeed');

  // Shell: Closed cavity void shell
  const shelledCavity = shellSolid(boxA, 3, []);
  assert.equal(shelledCavity.shells.length, 2, 'Shelled closed body must contain outer shell and void shell');
  const cavityVol = shelledCavity.computeVolume();
  assert.ok(cavityVol < boxA.computeVolume(), 'Shelled volume must be less than solid volume');

  // Shell: Open-face container (exclude top face)
  const topFace = boxA.outerShell.faces.find(f => f.normal.z > 0.9);
  const openShelled = shellSolid(boxA, 3, [topFace.id]);
  assert.ok(openShelled, 'Open face container shell must succeed');

  // Booleans: Union, Subtract, Intersect
  const unionSolid = booleanUnion(boxA, boxB);
  assert.ok(unionSolid, 'Boolean union must return solid');
  assert.ok(unionSolid.computeVolume() > boxA.computeVolume(), 'Union volume must exceed single box volume');

  const diffSolid = booleanSubtract(boxA, boxB);
  assert.ok(diffSolid, 'Boolean difference must return solid');
  assert.ok(diffSolid.computeVolume() < boxA.computeVolume(), 'Difference volume must be less than original box volume');

  const interSolid = booleanIntersect(boxA, boxB);
  assert.ok(interSolid, 'Boolean intersection must return solid');
  assert.ok(
    interSolid.computeVolume() > 0 && interSolid.computeVolume() < boxA.computeVolume(),
    'Intersection volume must be overlap region'
  );
});

// ============================================================================
// 5. MULTI-BODY ASSEMBLY MATE ENGINE VERIFICATION
// ============================================================================

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

test('AssemblyManager: concentric, parallel, perpendicular, and advanced mates (tangent, width, path)', () => {
  // 1. Concentric mate
  const mgr1 = new AssemblyManager();
  const baseCyl = mgr1.insertComponent('BaseCyl', new THREE.CylinderGeometry(15, 15, 60), true);
  const pinCyl = mgr1.insertComponent('PinCyl', new THREE.CylinderGeometry(10, 10, 40), false);
  pinCyl.position.set(50, 30, 20);
  pinCyl.updateMatrix();

  mgr1.addMate(MATE_TYPES.CONCENTRIC, baseCyl.id, 'cylinder', pinCyl.id, 'cylinder', 0);
  const concRes = mgr1.solve();
  assert.ok(concRes.error < 1e-3, `Concentric mate residual ${concRes.error} must be < 1e-3`);
  assert.ok(Math.abs(pinCyl.position.x) < 1e-3 && Math.abs(pinCyl.position.y) < 1e-3, 'Pin must align with base cylinder axis');

  // 2. Parallel and Perpendicular mates
  const mgr2 = new AssemblyManager();
  const fixedBlock = mgr2.insertComponent('FixedBlock', new THREE.BoxGeometry(40, 40, 40), true);
  const rotBlock1 = mgr2.insertComponent('RotBlock1', new THREE.BoxGeometry(20, 20, 20), false);
  const rotBlock2 = mgr2.insertComponent('RotBlock2', new THREE.BoxGeometry(20, 20, 20), false);

  mgr2.addMate(MATE_TYPES.PARALLEL, fixedBlock.id, 'top', rotBlock1.id, 'bottom', 0);
  mgr2.addMate(MATE_TYPES.PERPENDICULAR, fixedBlock.id, 'top', rotBlock2.id, 'front', 0);
  const rotRes = mgr2.solve();
  assert.ok(rotRes.error < 1e-3, `Parallel/Perpendicular mate residual ${rotRes.error} < 1e-3`);

  const topFix = fixedBlock.getFaceReference('top');
  const botRot1 = rotBlock1.getFaceReference('bottom');
  const frontRot2 = rotBlock2.getFaceReference('front');

  assert.ok(Math.abs(Math.abs(topFix.normal.dot(botRot1.normal)) - 1.0) < 1e-3, 'RotBlock1 bottom normal must be parallel to fixed top');
  assert.ok(Math.abs(topFix.normal.dot(frontRot2.normal)) < 1e-3, 'RotBlock2 front normal must be perpendicular to fixed top');

  // 3. Advanced Mates: Tangent Mate
  const mgrTan = new AssemblyManager();
  const planeBox = mgrTan.insertComponent('PlaneBox', new THREE.BoxGeometry(100, 20, 100), true);
  const rollerCyl = mgrTan.insertComponent('RollerCyl', new THREE.CylinderGeometry(15, 15, 50), false);
  rollerCyl.position.set(0, 50, 0);
  rollerCyl.updateMatrix();

  mgrTan.addMate(MATE_TYPES.TANGENT, rollerCyl.id, 'z', planeBox.id, 'top', 0);
  const tanRes = mgrTan.solve();
  assert.ok(tanRes.error < 1e-3, `Tangent mate residual ${tanRes.error} < 1e-3`);

  // 4. Advanced Mates: Width Mate
  const mgr3 = new AssemblyManager();
  const bracket = mgr3.insertComponent('Bracket', new THREE.BoxGeometry(60, 30, 40), true);
  const tab = mgr3.insertComponent('Tab', new THREE.BoxGeometry(20, 30, 30), false);
  tab.position.set(40, 0, 0);
  tab.updateMatrix();

  mgr3.addMate(MATE_TYPES.WIDTH, bracket.id, 'left', tab.id, 'left', 0, {
    ref1Secondary: 'right',
    ref2Secondary: 'right',
  });
  const widthRes = mgr3.solve();
  assert.ok(widthRes.error < 1e-3, `Width mate residual ${widthRes.error} < 1e-3`);
  assert.ok(Math.abs(tab.position.x) < 1e-3, `Tab must be centered symmetrically at X=0, got ${tab.position.x}`);

  // 5. Advanced Mates: Path Mate
  const mgr4 = new AssemblyManager();
  const guide = mgr4.insertComponent('Guide', new THREE.BoxGeometry(100, 10, 10), true);
  const runner = mgr4.insertComponent('Runner', new THREE.BoxGeometry(10, 10, 10), false);
  runner.position.set(25, 45, 10);
  runner.updateMatrix();

  const pathPoints = [
    new THREE.Vector3(-50, 20, 0),
    new THREE.Vector3(50, 20, 0),
  ];
  mgr4.addMate(MATE_TYPES.PATH, guide.id, 'top', runner.id, 'bottom', 0, { pathPoints });
  const pathRes = mgr4.solve();
  assert.ok(pathRes.error < 1e-3, `Path mate residual ${pathRes.error} < 1e-3`);
  assert.ok(Math.abs(runner.position.y - 20) < 1e-3, `Runner Y must project onto path Y=20, got ${runner.position.y}`);

  // 6. Exploded View Generator
  const exploded = mgr1.generateExplodedView(40);
  assert.ok(exploded.components.length >= 2, 'Exploded view must position components');
  assert.ok(exploded.leaderLines.length > 0, 'Exploded view must generate leader lines');
});

// ============================================================================
// 6. CAD DATA EXCHANGE (STEP, IGES, STL, DXF)
// ============================================================================

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

test('ExportEngine & ImportEngine: STEP AP214/AP242 and IGES 5.3 round-trip data exchange', async () => {
  const geom = new THREE.BoxGeometry(40, 25, 15);

  // 1. STEP AP214/AP242 B-Rep export & import
  const stepBlob = exportEngine.exportSTEP(geom, 'TEST_BRACKET', { schema: 'AP214' });
  const stepText = await stepBlob.text();
  assert.ok(stepText.includes('ISO-10303-21;'), 'STEP must contain ISO-10303-21 header');
  assert.ok(stepText.includes('MANIFOLD_SOLID_BREP'), 'STEP must define MANIFOLD_SOLID_BREP');
  assert.ok(stepText.includes('ADVANCED_BREP_SHAPE_REPRESENTATION'), 'STEP must define ADVANCED_BREP');
  assert.ok(stepText.includes('EDGE_LOOP'), 'STEP must define EDGE_LOOP entities');
  assert.ok(stepText.includes('MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION'), 'STEP must include styling');

  const importedStep = importEngine.importSTEP(stepText);
  assert.ok(importedStep instanceof THREE.BufferGeometry, 'Imported STEP must be BufferGeometry');
  importedStep.computeBoundingBox();
  const stepBox = importedStep.boundingBox;
  assert.ok(Math.abs(stepBox.max.x - stepBox.min.x - 40) < 1e-1, 'STEP round-trip X dimension ~40');
  assert.ok(Math.abs(stepBox.max.y - stepBox.min.y - 25) < 1e-1, 'STEP round-trip Y dimension ~25');
  assert.ok(Math.abs(stepBox.max.z - stepBox.min.z - 15) < 1e-1, 'STEP round-trip Z dimension ~15');

  // 2. IGES 5.3 MSBO export & import
  const igesBlob = exportEngine.exportIGES(geom, 'TEST_IGES');
  const igesText = await igesBlob.text();
  const igesLines = igesText.split('\n');
  assert.ok(igesLines.some(l => l.length >= 73 && l.charAt(72) === 'S'), 'IGES must have Start (S) records');
  assert.ok(igesLines.some(l => l.length >= 73 && l.charAt(72) === 'G'), 'IGES must have Global (G) records');
  assert.ok(igesLines.some(l => l.length >= 73 && l.charAt(72) === 'D'), 'IGES must have Directory (D) records');
  assert.ok(igesLines.some(l => l.length >= 73 && l.charAt(72) === 'P'), 'IGES must have Parameter (P) records');

  const importedIges = importEngine.importIGES(igesText);
  assert.ok(importedIges instanceof THREE.BufferGeometry, 'Imported IGES must be BufferGeometry');
  importedIges.computeBoundingBox();
  const igesBox = importedIges.boundingBox;
  assert.ok(Math.abs(igesBox.max.x - igesBox.min.x - 40) < 1e-1, 'IGES round-trip X dimension ~40');
  assert.ok(Math.abs(igesBox.max.y - igesBox.min.y - 25) < 1e-1, 'IGES round-trip Y dimension ~25');
  assert.ok(Math.abs(igesBox.max.z - igesBox.min.z - 15) < 1e-1, 'IGES round-trip Z dimension ~15');
});

// ============================================================================
// 7. 3D SOLID LINEAR STATIC FEA SIMULATION VERIFICATION
// ============================================================================

test('FEAEngine: cantilever beam deflection matches Euler-Bernoulli analytical formula', () => {
  const geom = new THREE.BoxGeometry(20, 30, 500);
  feaEngine.generateMesh(geom, 10);
  const res = feaEngine.solve(1000, 350e6, 200e9);

  assert.ok(res.maxDisplacementMM > 0, 'Deflection must be positive');
  const errorPercent = Math.abs(res.maxDisplacementMM - res.theoreticalDispMM) / res.theoreticalDispMM * 100;

  assert.ok(errorPercent < 1.0, `FEA deflection error ${errorPercent.toFixed(3)}% must be < 1%`);
});

test('FEAEngine: 3D solid tetrahedral meshing, 12x12 stiffness matrix, and Cauchy stress tensor', () => {
  const geom = new THREE.BoxGeometry(20, 30, 100);
  const solidMesh = feaEngine.tetrahedralize(geom, { divisions: [2, 2, 4], elementType: ELEMENT_TYPES.TET4 });

  assert.ok(solidMesh.numElements > 0, 'Solid mesh must have tetrahedral elements');
  assert.ok(solidMesh.numNodes > 0, 'Solid mesh must have nodes');
  assert.ok(solidMesh.boundaryFaces.length > 0, 'Solid mesh must identify boundary faces');

  // Verify 12x12 stiffness matrix formulation
  const elem = solidMesh.elements[0];
  const nodeCoords = elem.nodes.map(nIdx => solidMesh.nodes[nIdx].posMeters);
  const tetStiffness = feaEngine.computeTet4Stiffness(nodeCoords, 200e9, 0.3);

  assert.ok(tetStiffness, 'Must compute Tet4 stiffness matrix');
  assert.equal(tetStiffness.Ke.length, 12, 'Ke must be 12x12');
  assert.equal(tetStiffness.Ke[0].length, 12, 'Ke must be 12x12');

  // Verify stiffness matrix symmetry: K_ij == K_ji
  let maxAsym = 0;
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 12; c++) {
      maxAsym = Math.max(maxAsym, Math.abs(tetStiffness.Ke[r][c] - tetStiffness.Ke[c][r]));
    }
  }
  assert.ok(maxAsym < 1e-6, `Ke must be strictly symmetric, maxAsym: ${maxAsym}`);

  // Solve 3D Solid Linear Static FEA
  const res3D = feaEngine.solveSolidFEA({
    loadMagnitude: 2000,
    yieldStrength: 350e6,
    youngsModulus: 200e9,
    poissonRatio: 0.3,
  });

  assert.ok(res3D.maxDisplacementMM > 0, '3D solid deflection must be positive');
  assert.ok(res3D.maxStressMPa > 0, '3D solid von Mises stress must be positive');
  assert.ok(res3D.factorOfSafety > 0, 'Factor of safety must be positive');
  assert.ok(res3D.deformedGeometry instanceof THREE.BufferGeometry, 'Must generate deformed Three.js geometry');

  // Verify principal stresses & Cauchy tensor invariants
  const firstElemStress = res3D.elementStresses[0];
  assert.equal(firstElemStress.stress.length, 6, 'Must compute 6 Cauchy stress components');
  assert.equal(firstElemStress.principalStresses.length, 3, 'Must compute 3 principal stresses');
  assert.ok(firstElemStress.principalStresses[0] >= firstElemStress.principalStresses[1], 'sigma1 >= sigma2');
  assert.ok(firstElemStress.principalStresses[1] >= firstElemStress.principalStresses[2], 'sigma2 >= sigma3');
  assert.ok(firstElemStress.vonMises >= 0, 'von Mises stress >= 0');
});

// ============================================================================
// 8. 2D ENGINEERING DRAWINGS ENGINE VERIFICATION
// ============================================================================

test('DrawingEngine: orthographic projections with Hidden Line Removal (HLR)', () => {
  const geom = new THREE.BoxGeometry(60, 40, 25);

  const frontView = drawingEngine.projectGeometry(geom, PROJECTION_VIEWS.FRONT, { enableHLR: true });
  const topView = drawingEngine.projectGeometry(geom, PROJECTION_VIEWS.TOP, { enableHLR: true });
  const rightView = drawingEngine.projectGeometry(geom, PROJECTION_VIEWS.RIGHT, { enableHLR: true });
  const isoView = drawingEngine.projectGeometry(geom, PROJECTION_VIEWS.ISOMETRIC, { enableHLR: true });

  assert.ok(frontView.visible.length > 0, 'Front view must contain visible edges');
  assert.ok(topView.visible.length > 0, 'Top view must contain visible edges');
  assert.ok(rightView.visible.length > 0, 'Right view must contain visible edges');
  assert.ok(isoView.visible.length > 0, 'Isometric view must contain visible edges');

  assert.ok(frontView.bounds.width > 0, 'Front view width > 0');
  assert.ok(frontView.bounds.height > 0, 'Front view height > 0');
});

test('DrawingEngine: standard sheet generation with dimensions, GD&T, and SVG/DXF exports', () => {
  const geom = new THREE.BoxGeometry(60, 40, 25);
  const sheetData = drawingEngine.createStandardSheet(geom, {
    sheetSize: SHEET_SIZES.A4_LANDSCAPE,
    title: 'BRACKET HOUSING',
    partNumber: 'DWG-BRK-01',
    material: 'Steel 1020',
  });

  assert.equal(sheetData.views.length, 4, 'Must generate 4 orthographic views (Top, Front, Right, Iso)');
  assert.ok(sheetData.dimensions.length > 0, 'Must generate automatic linear dimensions');
  assert.ok(sheetData.gdtFrames.length > 0, 'Must generate GD&T feature control frames');
  assert.ok(sheetData.titleBlock.title === 'BRACKET HOUSING', 'Title block must contain part title');

  // Verify SVG vector export
  const svg = drawingEngine.exportSVG(sheetData);
  assert.ok(svg.includes('<svg') && svg.includes('</svg>'), 'Must export valid SVG document');
  assert.ok(svg.includes('visible-line'), 'SVG must include visible contour lines');
  assert.ok(svg.includes('title-block'), 'SVG must include engineering title block');
  assert.ok(svg.includes('BRACKET HOUSING'), 'SVG must include part name text');

  // Verify AutoCAD DXF export
  const dxf = drawingEngine.exportDXF(sheetData);
  assert.ok(dxf.includes('SECTION') && dxf.includes('ENTITIES') && dxf.includes('EOF'), 'Must export valid DXF structure');
  assert.ok(dxf.includes('VISIBLE'), 'DXF must contain VISIBLE layer lines');
  assert.ok(dxf.includes('DIMENSION'), 'DXF must contain DIMENSION entities');
});
