// CADWorks Pro - Central State Management Store (Robust Parametric Architecture)
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import * as THREE from 'three';
import { generateId } from '../utils/math.js';
import { TOOLS, APP_MODES, DEFAULT_SETTINGS, FEATURE_TYPES, MATERIALS, MATE_TYPES } from '../utils/constants.js';
import { assemblyManager } from '../assembly/AssemblyManager.js';
import { safeDeepClone } from '../utils/clone.js';

const MAX_UNDO_HISTORY = 40;

const initialState = {
  // Application mode
  appMode: APP_MODES.PART,
  
  // Document info
  documentName: 'Untitled Part',
  documentPath: null,
  isModified: false,
  
  // Active tool
  activeTool: TOOLS.SELECT,
  previousTool: TOOLS.SELECT,
  
  // Selection
  selectedEntities: [],
  hoveredEntity: null,
  selectionMode: 'body', // 'body', 'face', 'edge', 'vertex'
  
  // Feature tree with Rollback Bar & Dependency Graph
  features: [],
  activeFeatureIndex: -1,
  rollbackIndex: -1, // -1 means at the very end of the tree (no rollback)
  expandedNodes: new Set(['origin', 'planes']),
  
  // Sketching state
  isSketchActive: false,
  activeSketchId: null,
  activeSketchPlane: 'Front',
  sketchEntities: {},    // { sketchId: [entities] }
  sketchConstraints: {}, // { sketchId: [constraints] }
  sketchDimensions: {},  // { sketchId: [dimensions] }
  currentSketchPoints: [],
  snapEnabled: true,
  constructionMode: false,
  
  // 3D Model state
  bodies: [], // Array of { id, geometry, wireframe, visible }
  
  // Material
  activeMaterial: 'Steel_1020',
  
  // View state
  viewOrientation: 'isometric',
  showOrigin: true,
  showPlanes: true,
  showGrid: true,
  showAxes: true,
  shadedMode: true,
  edgeDisplay: true,
  wireframeMode: false,
  perspectiveView: true,
  sectionViewActive: false,
  sectionPlane: null,
  
  // Property panel
  propertyPanelOpen: false,
  propertyPanelContent: null,
  
  // Dialog
  activeDialog: null,
  dialogProps: {},
  
  // Status
  statusMessage: 'Ready',
  statusProgress: null,
  
  // Settings
  settings: { ...DEFAULT_SETTINGS },
  
  // Full Snapshot Undo/Redo Stack (Never lies, never drifts)
  undoStack: [],
  redoStack: [],
  
  // Measurements
  measurements: [],
  
  // Assembly
  assemblyComponents: [],
  mates: [],
  
  // Notifications
  notifications: [],
  
  // Command manager tab
  activeCommandTab: 'Features',
  
  // Rebuild flag
  needsRebuild: false,
  rebuildErrors: [],
  
  // Mass properties cache
  massProperties: null,
};

export const useCADStore = create(
  immer((set, get) => ({
    ...initialState,

    // Helper to capture state snapshot for undo (deeply clones without circular references or leaking Three.js prototypes)
    _captureUndoSnapshot: (state, actionName = 'Action') => {
      state.undoStack.push({
        actionName,
        snapshot: {
          features: safeDeepClone(state.features),
          sketchEntities: safeDeepClone(state.sketchEntities),
          sketchConstraints: safeDeepClone(state.sketchConstraints),
          sketchDimensions: safeDeepClone(state.sketchDimensions),
          rollbackIndex: state.rollbackIndex,
          activeMaterial: state.activeMaterial,
        },
      });
      if (state.undoStack.length > MAX_UNDO_HISTORY) state.undoStack.shift();
      state.redoStack = [];
      state.isModified = true;
    },

    // ==================== TOOL MANAGEMENT ====================
    setActiveTool: (tool) => set(state => {
      state.previousTool = state.activeTool;
      state.activeTool = tool;
      state.statusMessage = `Tool: ${tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`;
    }),

    cancelTool: () => set(state => {
      state.activeTool = TOOLS.SELECT;
      state.currentSketchPoints = [];
      state.propertyPanelOpen = false;
      state.propertyPanelContent = null;
      state.statusMessage = 'Ready';
    }),

    // ==================== SELECTION ====================
    setSelection: (entities) => set(state => {
      state.selectedEntities = Array.isArray(entities) ? entities : [entities];
    }),

    addToSelection: (entity) => set(state => {
      if (!state.selectedEntities.find(e => e.id === entity.id)) {
        state.selectedEntities.push(entity);
      }
    }),

    removeFromSelection: (entityId) => set(state => {
      state.selectedEntities = state.selectedEntities.filter(e => e.id !== entityId);
    }),

    clearSelection: () => set(state => {
      state.selectedEntities = [];
      state.hoveredEntity = null;
    }),

    setHovered: (entity) => set(state => {
      state.hoveredEntity = entity;
    }),

    setSelectionMode: (mode) => set(state => {
      state.selectionMode = mode;
      state.statusMessage = `Selection mode: ${mode}`;
    }),

    // ==================== FEATURE MANAGEMENT WITH DEPENDENCY GRAPH ====================
    addFeature: (feature) => set(state => {
      get()._captureUndoSnapshot(state, `Add ${feature.name || feature.type}`);

      // Derive dependency parent IDs
      const parentIds = [];
      if (feature.sketchId) {
        const parentSketch = state.features.find(f => f.sketchId === feature.sketchId || f.id === feature.sketchId);
        if (parentSketch) parentIds.push(parentSketch.id);
      }
      if (feature.toolFeatureId) {
        parentIds.push(feature.toolFeatureId);
      }

      const newFeature = {
        id: generateId('feat'),
        timestamp: Date.now(),
        visible: true,
        suppressed: false,
        parentIds: parentIds,
        childIds: [],
        ...feature,
      };

      // Register this feature as child of parents
      parentIds.forEach(pid => {
        const p = state.features.find(f => f.id === pid);
        if (p && !p.childIds.includes(newFeature.id)) {
          p.childIds.push(newFeature.id);
        }
      });

      // Insert at rollback index if rolled back, otherwise append
      const isRolledBack = state.rollbackIndex >= 0 && state.rollbackIndex < state.features.length - 1;
      if (isRolledBack) {
        const insertAt = state.rollbackIndex + 1;
        state.features.splice(insertAt, 0, newFeature);
        state.rollbackIndex = insertAt;
        state.activeFeatureIndex = insertAt;
      } else {
        state.features.push(newFeature);
        state.activeFeatureIndex = state.features.length - 1;
        state.rollbackIndex = state.features.length - 1;
      }

      state.needsRebuild = true;
      state.statusMessage = `Added ${newFeature.name}`;
      return newFeature;
    }),

    updateFeature: (featureId, updates) => set(state => {
      const index = state.features.findIndex(f => f.id === featureId);
      if (index !== -1) {
        get()._captureUndoSnapshot(state, `Update ${state.features[index].name}`);
        Object.assign(state.features[index], updates);
        state.needsRebuild = true;
        state.statusMessage = `Updated ${state.features[index].name}`;
      }
    }),

    removeFeature: (featureId) => set(state => {
      const index = state.features.findIndex(f => f.id === featureId);
      if (index !== -1) {
        get()._captureUndoSnapshot(state, `Delete ${state.features[index].name}`);
        
        // Remove from parents' childIds
        const feat = state.features[index];
        if (feat.parentIds) {
          feat.parentIds.forEach(pid => {
            const p = state.features.find(f => f.id === pid);
            if (p) p.childIds = p.childIds.filter(cid => cid !== featureId);
          });
        }

        // Also clean associated sketch entities if deleting a sketch
        if (feat.type === FEATURE_TYPES.SKETCH && feat.sketchId) {
          delete state.sketchEntities[feat.sketchId];
          delete state.sketchConstraints[feat.sketchId];
          delete state.sketchDimensions[feat.sketchId];
        }

        state.features.splice(index, 1);
        if (state.rollbackIndex >= state.features.length) {
          state.rollbackIndex = state.features.length - 1;
        }
        state.needsRebuild = true;
        state.statusMessage = 'Feature deleted';
      }
    }),

    toggleFeatureVisibility: (featureId) => set(state => {
      const feat = state.features.find(f => f.id === featureId);
      if (feat) {
        feat.visible = !feat.visible;
      }
    }),

    // Cascading Suppress & Unsuppress
    toggleFeatureSuppressed: (featureId) => set(state => {
      const feat = state.features.find(f => f.id === featureId);
      if (!feat) return;

      get()._captureUndoSnapshot(state, `Toggle Suppress ${feat.name}`);
      const willSuppress = !feat.suppressed;
      feat.suppressed = willSuppress;

      if (willSuppress) {
        // Cascade suppress to all downstream dependent children
        const queue = [...(feat.childIds || [])];
        while (queue.length > 0) {
          const cid = queue.shift();
          const child = state.features.find(f => f.id === cid);
          if (child) {
            child.suppressed = true;
            if (child.childIds) queue.push(...child.childIds);
          }
        }
      } else {
        // Unsuppress: ensure parents are unsuppressed
        const queue = [...(feat.parentIds || [])];
        while (queue.length > 0) {
          const pid = queue.shift();
          const parent = state.features.find(f => f.id === pid);
          if (parent) {
            parent.suppressed = false;
            if (parent.parentIds) queue.push(...parent.parentIds);
          }
        }
      }

      state.needsRebuild = true;
      state.statusMessage = willSuppress ? `Suppressed ${feat.name}` : `Unsuppressed ${feat.name}`;
    }),

    // Rollback Bar Management
    setRollbackIndex: (index) => set(state => {
      const clamped = Math.max(-1, Math.min(state.features.length - 1, index));
      state.rollbackIndex = clamped;
      state.needsRebuild = true;
      state.statusMessage = clamped === -1 || clamped === state.features.length - 1
        ? 'Rollback bar at end of tree'
        : `Rolled back to feature ${clamped + 1}`;
    }),

    setActiveFeature: (index) => set(state => {
      state.activeFeatureIndex = index;
    }),

    // ==================== SKETCH MANAGEMENT ====================
    startSketch: (plane = 'Front') => set(state => {
      const sketchId = generateId('sketch');
      state.isSketchActive = true;
      state.activeSketchId = sketchId;
      state.activeSketchPlane = plane;
      state.sketchEntities[sketchId] = [];
      state.sketchConstraints[sketchId] = [];
      state.sketchDimensions[sketchId] = [];
      state.currentSketchPoints = [];
      state.activeTool = TOOLS.SKETCH_LINE;
      state.activeCommandTab = 'Sketch';
      state.statusMessage = `Sketching on ${plane} plane (Select tools or draw)`;
    }),

    endSketch: (confirm = true) => set(state => {
      if (!state.activeSketchId) return;
      const sketchId = state.activeSketchId;
      
      if (confirm && state.sketchEntities[sketchId]?.length > 0) {
        get()._captureUndoSnapshot(state, 'Create Sketch');

        const existingSketchFeature = state.features.find(f => f.sketchId === sketchId);
        if (!existingSketchFeature) {
          const sketchFeature = {
            id: generateId('feat_sketch'),
            type: FEATURE_TYPES.SKETCH,
            name: `Sketch${state.features.filter(f => f.type === FEATURE_TYPES.SKETCH).length + 1}`,
            sketchId: sketchId,
            plane: state.activeSketchPlane,
            visible: true,
            suppressed: false,
            parentIds: [],
            childIds: [],
          };
          
          if (state.rollbackIndex >= 0 && state.rollbackIndex < state.features.length - 1) {
            state.features.splice(state.rollbackIndex + 1, 0, sketchFeature);
            state.rollbackIndex++;
          } else {
            state.features.push(sketchFeature);
            state.rollbackIndex = state.features.length - 1;
          }
        }
      } else if (!confirm) {
        delete state.sketchEntities[sketchId];
        delete state.sketchConstraints[sketchId];
        delete state.sketchDimensions[sketchId];
      }
      
      state.isSketchActive = false;
      state.activeSketchId = null;
      state.currentSketchPoints = [];
      state.constructionMode = false;
      state.activeTool = TOOLS.SELECT;
      state.activeCommandTab = 'Features';
      state.statusMessage = 'Sketch closed. Ready to Extrude/Revolve.';
      state.needsRebuild = true;
    }),

    addSketchEntity: (entity) => set(state => {
      const sketchId = state.activeSketchId;
      if (!sketchId) return;
      if (!state.sketchEntities[sketchId]) state.sketchEntities[sketchId] = [];
      const newEntity = {
        id: generateId('ent'),
        construction: state.constructionMode,
        ...entity,
      };
      state.sketchEntities[sketchId].push(newEntity);
      state.isModified = true;
    }),

    removeSketchEntity: (entityId) => set(state => {
      const sketchId = state.activeSketchId;
      if (!sketchId || !state.sketchEntities[sketchId]) return;
      state.sketchEntities[sketchId] = state.sketchEntities[sketchId].filter(e => e.id !== entityId);
    }),

    addSketchConstraint: (constraint) => set(state => {
      const sketchId = state.activeSketchId;
      if (!sketchId) return;
      if (!state.sketchConstraints[sketchId]) state.sketchConstraints[sketchId] = [];
      state.sketchConstraints[sketchId].push({
        id: generateId('const'),
        ...constraint,
      });
    }),

    addSketchDimension: (dimension) => set(state => {
      const sketchId = state.activeSketchId;
      if (!sketchId) return;
      if (!state.sketchDimensions[sketchId]) state.sketchDimensions[sketchId] = [];
      state.sketchDimensions[sketchId].push({
        id: generateId('dim'),
        ...dimension,
      });
    }),

    toggleConstructionMode: () => set(state => {
      state.constructionMode = !state.constructionMode;
    }),

    editSketch: (featureId) => set(state => {
      const feature = state.features.find(f => f.id === featureId);
      if (feature && feature.type === FEATURE_TYPES.SKETCH) {
        state.isSketchActive = true;
        state.activeSketchId = feature.sketchId;
        state.activeSketchPlane = feature.plane || 'Front';
        state.currentSketchPoints = [];
        state.activeCommandTab = 'Sketch';
        state.statusMessage = `Editing ${feature.name}`;
      }
    }),

    // ==================== BODY MANAGEMENT ====================
    setBodies: (bodies) => set(state => {
      state.bodies = bodies;
    }),

    // ==================== MATERIAL ====================
    setMaterial: (materialKey) => set(state => {
      state.activeMaterial = materialKey;
      state.isModified = true;
      state.massProperties = null;
    }),

    // ==================== VIEW STATE ====================
    setViewOrientation: (orientation) => set(state => {
      state.viewOrientation = orientation;
    }),

    toggleGrid: () => set(state => { state.showGrid = !state.showGrid; }),
    toggleOrigin: () => set(state => { state.showOrigin = !state.showOrigin; }),
    togglePlanes: () => set(state => { state.showPlanes = !state.showPlanes; }),
    toggleAxes: () => set(state => { state.showAxes = !state.showAxes; }),
    toggleShaded: () => set(state => { state.shadedMode = !state.shadedMode; }),
    toggleEdges: () => set(state => { state.edgeDisplay = !state.edgeDisplay; }),
    toggleWireframe: () => set(state => { state.wireframeMode = !state.wireframeMode; }),
    togglePerspective: () => set(state => { state.perspectiveView = !state.perspectiveView; }),
    toggleSectionView: () => set(state => { state.sectionViewActive = !state.sectionViewActive; }),

    // ==================== PROPERTY PANEL ====================
    openPropertyPanel: (content) => set(state => {
      state.propertyPanelOpen = true;
      state.propertyPanelContent = content;
    }),

    closePropertyPanel: () => set(state => {
      state.propertyPanelOpen = false;
      state.propertyPanelContent = null;
    }),

    // ==================== COMMAND TAB ====================
    setCommandTab: (tab) => set(state => {
      state.activeCommandTab = tab;
    }),

    // ==================== STATUS ====================
    setStatus: (message, progress = null) => set(state => {
      state.statusMessage = message;
      state.statusProgress = progress;
    }),

    // ==================== SOLID SNAPSHOT-BASED UNDO / REDO ====================
    undo: () => set(state => {
      if (state.undoStack.length === 0) return;

      const currentSnapshot = {
        features: safeDeepClone(state.features),
        sketchEntities: safeDeepClone(state.sketchEntities),
        sketchConstraints: safeDeepClone(state.sketchConstraints),
        sketchDimensions: safeDeepClone(state.sketchDimensions),
        rollbackIndex: state.rollbackIndex,
        activeMaterial: state.activeMaterial,
      };
      state.redoStack.push({ snapshot: currentSnapshot });

      const prev = state.undoStack.pop();
      const s = prev.snapshot;
      state.features = s.features || [];
      state.sketchEntities = s.sketchEntities || {};
      state.sketchConstraints = s.sketchConstraints || {};
      state.sketchDimensions = s.sketchDimensions || {};
      state.rollbackIndex = s.rollbackIndex ?? -1;
      state.activeMaterial = s.activeMaterial || 'Steel_1020';

      state.needsRebuild = true;
      state.statusMessage = `Undo: ${prev.actionName || 'Action'}`;
    }),

    redo: () => set(state => {
      if (state.redoStack.length === 0) return;

      const currentSnapshot = {
        features: safeDeepClone(state.features),
        sketchEntities: safeDeepClone(state.sketchEntities),
        sketchConstraints: safeDeepClone(state.sketchConstraints),
        sketchDimensions: safeDeepClone(state.sketchDimensions),
        rollbackIndex: state.rollbackIndex,
        activeMaterial: state.activeMaterial,
      };
      state.undoStack.push({ snapshot: currentSnapshot });

      const next = state.redoStack.pop();
      const s = next.snapshot;
      state.features = s.features || [];
      state.sketchEntities = s.sketchEntities || {};
      state.sketchConstraints = s.sketchConstraints || {};
      state.sketchDimensions = s.sketchDimensions || {};
      state.rollbackIndex = s.rollbackIndex ?? -1;
      state.activeMaterial = s.activeMaterial || 'Steel_1020';

      state.needsRebuild = true;
      state.statusMessage = 'Redo';
    }),

    // ==================== REBUILD ====================
    markRebuilt: (errors = []) => set(state => {
      state.needsRebuild = false;
      state.rebuildErrors = errors;
    }),

    rebuild: () => set(state => {
      state.needsRebuild = true;
      state.statusMessage = 'Rebuilding geometry...';
    }),

    // ==================== ASSEMBLY ====================
    setAssemblyComponents: (components) => set(state => {
      state.assemblyComponents = components;
    }),

    setMates: (mates) => set(state => {
      state.mates = mates;
    }),

    insertAssemblyPart: (name, shapeType = 'box', dims = {}) => set(state => {
      let geom;
      if (shapeType === 'cylinder') {
        const r = dims.radius || 10;
        const h = dims.height || 30;
        geom = new THREE.CylinderGeometry(r, r, h, 32);
      } else if (shapeType === 'flange') {
        geom = new THREE.CylinderGeometry(25, 25, 8, 32);
      } else if (shapeType === 'pin') {
        geom = new THREE.CylinderGeometry(6, 6, 40, 32);
      } else {
        const w = dims.width || 30;
        const h = dims.height || 20;
        const d = dims.depth || 30;
        geom = new THREE.BoxGeometry(w, h, d);
      }

      const comp = assemblyManager.insertComponent(name || `Part_${state.assemblyComponents.length + 1}`, geom);
      comp.geometryType = shapeType;
      comp.dimensions = { ...dims };
      if (state.assemblyComponents.length > 0) {
        // Offset subsequent components slightly so they don't visually overlap initially
        comp.position.x = state.assemblyComponents.length * 35;
        comp.updateMatrix();
      }
      state.assemblyComponents = [...assemblyManager.components];
      state.statusMessage = `Inserted "${comp.name}" into assembly`;
    }),

    addAssemblyMate: (type, comp1Id, ref1, comp2Id, ref2, offset = 0, extra = {}) => set(state => {
      const mate = assemblyManager.addMate(type, comp1Id, ref1, comp2Id, ref2, offset);
      if (extra && typeof extra === 'object') {
        Object.assign(mate, extra);
      }
      state.mates = [...assemblyManager.mates];
      state.assemblyComponents = [...assemblyManager.components];
      state.statusMessage = `Added ${type} mate between components`;
    }),

    removeAssemblyMate: (mateId) => set(state => {
      assemblyManager.removeMate(mateId);
      state.mates = [...assemblyManager.mates];
      state.assemblyComponents = [...assemblyManager.components];
      state.statusMessage = 'Removed mate';
    }),

    solveAssembly: () => set(state => {
      const res = assemblyManager.solve();
      const err = typeof res === 'object' && res.error !== undefined ? res.error : (typeof res === 'number' ? res : 0);
      state.assemblyComponents = [...assemblyManager.components];
      state.statusMessage = `Assembly solved (residual: ${err.toFixed(5)}mm)`;
    }),

    clearAssembly: () => set(state => {
      assemblyManager.components = [];
      assemblyManager.mates = [];
      state.assemblyComponents = [];
      state.mates = [];
      state.statusMessage = 'Cleared assembly';
    }),

    // ==================== PROJECT SAVE/LOAD (LOSSLESS FORMAT) ====================
    saveProject: () => {
      const state = get();
      const serializedComponents = (state.assemblyComponents || []).map(comp => ({
        id: comp.id,
        name: comp.name,
        isFixed: comp.isFixed,
        position: { x: comp.position.x, y: comp.position.y, z: comp.position.z },
        quaternion: { x: comp.quaternion.x, y: comp.quaternion.y, z: comp.quaternion.z, w: comp.quaternion.w },
        scale: { x: comp.scale.x, y: comp.scale.y, z: comp.scale.z },
        geometryType: comp.geometryType || 'box',
        dimensions: comp.dimensions || {},
      }));

      const project = {
        version: '2.0.0',
        documentName: state.documentName,
        appMode: state.appMode,
        features: state.features,
        sketchEntities: state.sketchEntities,
        sketchConstraints: state.sketchConstraints,
        sketchDimensions: state.sketchDimensions,
        rollbackIndex: state.rollbackIndex,
        activeMaterial: state.activeMaterial,
        settings: state.settings,
        assemblyComponents: serializedComponents,
        mates: state.mates || [],
        timestamp: Date.now(),
      };
      return JSON.stringify(project, null, 2);
    },

    loadProject: (jsonString) => set(state => {
      try {
        const project = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        state.documentName = project.documentName || 'Imported Part';
        state.appMode = project.appMode || APP_MODES.PART;
        state.features = project.features || [];
        state.sketchEntities = project.sketchEntities || {};
        state.sketchConstraints = project.sketchConstraints || {};
        state.sketchDimensions = project.sketchDimensions || {};
        state.rollbackIndex = project.rollbackIndex ?? (state.features.length - 1);
        state.activeMaterial = project.activeMaterial || 'Steel_1020';
        state.settings = { ...DEFAULT_SETTINGS, ...(project.settings || {}) };

        // Restore assembly components
        if (project.assemblyComponents && Array.isArray(project.assemblyComponents) && project.assemblyComponents.length > 0) {
          assemblyManager.components = [];
          project.assemblyComponents.forEach(c => {
            let geom;
            const dims = c.dimensions || {};
            if (c.geometryType === 'cylinder') {
              geom = new THREE.CylinderGeometry(dims.radius || 10, dims.radius || 10, dims.height || 30, 32);
            } else if (c.geometryType === 'flange') {
              geom = new THREE.CylinderGeometry(25, 25, 8, 32);
            } else if (c.geometryType === 'pin') {
              geom = new THREE.CylinderGeometry(6, 6, 40, 32);
            } else {
              geom = new THREE.BoxGeometry(dims.width || 30, dims.height || 20, dims.depth || 30);
            }
            const comp = assemblyManager.insertComponent(c.name, geom, c.isFixed);
            comp.id = c.id;
            comp.geometryType = c.geometryType || 'box';
            comp.dimensions = dims;
            if (c.position) comp.position.set(c.position.x, c.position.y, c.position.z);
            if (c.quaternion) comp.quaternion.set(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w);
            if (c.scale) comp.scale.set(c.scale.x, c.scale.y, c.scale.z);
            comp.updateMatrix();
          });
          state.assemblyComponents = [...assemblyManager.components];
        }

        // Restore assembly mates
        if (project.mates && Array.isArray(project.mates)) {
          assemblyManager.mates = [...project.mates];
          state.mates = [...project.mates];
        }

        state.undoStack = [];
        state.redoStack = [];
        state.needsRebuild = true;
        state.isModified = false;
        state.statusMessage = `Loaded: ${state.documentName}`;
      } catch (e) {
        state.statusMessage = 'Error loading project: ' + e.message;
      }
    }),

    loadExampleModel: (exampleData) => set(state => {
      state._captureUndoSnapshot(state, `Load Example: ${exampleData.documentName}`);
      state.documentName = exampleData.documentName || 'Example Part';
      state.activeMaterial = exampleData.activeMaterial || 'Steel_1020';
      state.features = JSON.parse(JSON.stringify(exampleData.features || []));
      state.sketchEntities = JSON.parse(JSON.stringify(exampleData.sketchEntities || {}));
      state.sketchConstraints = {};
      state.sketchDimensions = {};
      state.rollbackIndex = -1;
      state.activeFeatureIndex = state.features.length > 0 ? 0 : -1;
      state.isSketchActive = false;
      state.activeSketchId = null;
      state.needsRebuild = true;
      state.statusMessage = `Loaded example: ${exampleData.documentName}`;
    }),

    newProject: () => set(state => {
      Object.assign(state, {
        ...initialState,
        expandedNodes: new Set(['origin', 'planes']),
      });
    }),

    setDocumentName: (name) => set(state => {
      state.documentName = name;
    }),
  }))
);
