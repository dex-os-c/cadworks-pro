// CADWorks Pro - Central State Management Store
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { generateId } from '../utils/math';
import { TOOLS, APP_MODES, DEFAULT_SETTINGS, FEATURE_TYPES, MATERIALS } from '../utils/constants';

// Maximum undo history size
const MAX_UNDO_HISTORY = 50;

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
  
  // Feature tree
  features: [],
  activeFeatureIndex: -1,
  expandedNodes: new Set(['origin', 'planes']),
  
  // Sketching state
  isSketchActive: false,
  activeSketchId: null,
  activeSketchPlane: 'Front',
  sketchEntities: {},  // { sketchId: [entities] }
  sketchConstraints: {}, // { sketchId: [constraints] }
  sketchDimensions: {}, // { sketchId: [dimensions] }
  currentSketchPoints: [],
  snapEnabled: true,
  constructionMode: false,
  
  // 3D Model state
  bodies: [], // Array of { id, mesh, wireframe, material, visible }
  
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
  
  // Undo/Redo
  undoStack: [],
  redoStack: [],
  
  // Camera reference (set by viewport)
  cameraRef: null,
  controlsRef: null,
  sceneRef: null,
  rendererRef: null,
  
  // Measurements
  measurements: [],
  
  // Assembly (when in assembly mode)
  assemblyComponents: [],
  mates: [],
  
  // Notifications
  notifications: [],
  
  // Command manager tab
  activeCommandTab: 'Features',
  
  // Rebuild needed
  needsRebuild: false,
  
  // Mass properties cache
  massProperties: null,
};

export const useCADStore = create(
  immer((set, get) => ({
    ...initialState,

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

    // ==================== FEATURE MANAGEMENT ====================
    addFeature: (feature) => set(state => {
      const newFeature = {
        id: generateId('feature'),
        timestamp: Date.now(),
        visible: true,
        suppressed: false,
        ...feature,
      };
      // Save undo state
      state.undoStack.push({
        type: 'addFeature',
        featureIndex: state.features.length,
        feature: JSON.parse(JSON.stringify(newFeature)),
      });
      if (state.undoStack.length > MAX_UNDO_HISTORY) state.undoStack.shift();
      state.redoStack = [];
      
      state.features.push(newFeature);
      state.activeFeatureIndex = state.features.length - 1;
      state.isModified = true;
      state.needsRebuild = true;
      state.statusMessage = `Added: ${feature.name || feature.type}`;
      return newFeature;
    }),

    updateFeature: (featureId, updates) => set(state => {
      const index = state.features.findIndex(f => f.id === featureId);
      if (index !== -1) {
        // Save undo state
        state.undoStack.push({
          type: 'updateFeature',
          featureId,
          oldValues: JSON.parse(JSON.stringify(state.features[index])),
        });
        if (state.undoStack.length > MAX_UNDO_HISTORY) state.undoStack.shift();
        state.redoStack = [];
        
        Object.assign(state.features[index], updates);
        state.isModified = true;
        state.needsRebuild = true;
      }
    }),

    removeFeature: (featureId) => set(state => {
      const index = state.features.findIndex(f => f.id === featureId);
      if (index !== -1) {
        state.undoStack.push({
          type: 'removeFeature',
          featureIndex: index,
          feature: JSON.parse(JSON.stringify(state.features[index])),
        });
        if (state.undoStack.length > MAX_UNDO_HISTORY) state.undoStack.shift();
        state.redoStack = [];
        
        state.features.splice(index, 1);
        state.isModified = true;
        state.needsRebuild = true;
      }
    }),

    toggleFeatureVisibility: (featureId) => set(state => {
      const feat = state.features.find(f => f.id === featureId);
      if (feat) feat.visible = !feat.visible;
    }),

    toggleFeatureSuppressed: (featureId) => set(state => {
      const feat = state.features.find(f => f.id === featureId);
      if (feat) {
        feat.suppressed = !feat.suppressed;
        state.needsRebuild = true;
      }
    }),

    reorderFeature: (featureId, newIndex) => set(state => {
      const oldIndex = state.features.findIndex(f => f.id === featureId);
      if (oldIndex !== -1 && newIndex !== oldIndex) {
        const [feature] = state.features.splice(oldIndex, 1);
        state.features.splice(newIndex, 0, feature);
        state.needsRebuild = true;
      }
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
      state.activeTool = TOOLS.SELECT;
      state.activeCommandTab = 'Sketch';
      state.statusMessage = `Editing Sketch on ${plane} plane`;
    }),

    endSketch: (confirm = true) => set(state => {
      if (!state.activeSketchId) return;
      const sketchId = state.activeSketchId;
      
      if (confirm && state.sketchEntities[sketchId]?.length > 0) {
        // Add sketch as a feature
        const sketchFeature = {
          type: FEATURE_TYPES.SKETCH,
          name: `Sketch${state.features.filter(f => f.type === FEATURE_TYPES.SKETCH).length + 1}`,
          sketchId: sketchId,
          plane: state.activeSketchPlane,
          entities: JSON.parse(JSON.stringify(state.sketchEntities[sketchId])),
          constraints: JSON.parse(JSON.stringify(state.sketchConstraints[sketchId] || [])),
          dimensions: JSON.parse(JSON.stringify(state.sketchDimensions[sketchId] || [])),
        };
        
        state.features.push({
          id: generateId('feature'),
          timestamp: Date.now(),
          visible: true,
          suppressed: false,
          ...sketchFeature,
        });
      } else if (!confirm) {
        // Discard
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
      state.statusMessage = 'Ready';
      state.isModified = true;
    }),

    addSketchEntity: (entity) => set(state => {
      const sketchId = state.activeSketchId;
      if (!sketchId) return;
      if (!state.sketchEntities[sketchId]) state.sketchEntities[sketchId] = [];
      const newEntity = {
        id: generateId('entity'),
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

    updateSketchEntity: (entityId, updates) => set(state => {
      const sketchId = state.activeSketchId;
      if (!sketchId || !state.sketchEntities[sketchId]) return;
      const entity = state.sketchEntities[sketchId].find(e => e.id === entityId);
      if (entity) Object.assign(entity, updates);
    }),

    addSketchConstraint: (constraint) => set(state => {
      const sketchId = state.activeSketchId;
      if (!sketchId) return;
      if (!state.sketchConstraints[sketchId]) state.sketchConstraints[sketchId] = [];
      state.sketchConstraints[sketchId].push({
        id: generateId('constraint'),
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

    setCurrentSketchPoints: (points) => set(state => {
      state.currentSketchPoints = points;
    }),

    addCurrentSketchPoint: (point) => set(state => {
      state.currentSketchPoints.push(point);
    }),

    toggleConstructionMode: () => set(state => {
      state.constructionMode = !state.constructionMode;
    }),

    editSketch: (featureId) => set(state => {
      const feature = state.features.find(f => f.id === featureId);
      if (feature && feature.type === FEATURE_TYPES.SKETCH) {
        state.isSketchActive = true;
        state.activeSketchId = feature.sketchId;
        state.activeSketchPlane = feature.plane;
        state.sketchEntities[feature.sketchId] = JSON.parse(JSON.stringify(feature.entities || []));
        state.sketchConstraints[feature.sketchId] = JSON.parse(JSON.stringify(feature.constraints || []));
        state.sketchDimensions[feature.sketchId] = JSON.parse(JSON.stringify(feature.dimensions || []));
        state.currentSketchPoints = [];
        state.activeCommandTab = 'Sketch';
        state.statusMessage = `Editing ${feature.name}`;
      }
    }),

    // ==================== BODY MANAGEMENT ====================
    setBodies: (bodies) => set(state => {
      state.bodies = bodies;
    }),

    addBody: (body) => set(state => {
      state.bodies.push({
        id: generateId('body'),
        visible: true,
        ...body,
      });
    }),

    removeBody: (bodyId) => set(state => {
      state.bodies = state.bodies.filter(b => b.id !== bodyId);
    }),

    updateBody: (bodyId, updates) => set(state => {
      const body = state.bodies.find(b => b.id === bodyId);
      if (body) Object.assign(body, updates);
    }),

    // ==================== MATERIAL ====================
    setMaterial: (materialKey) => set(state => {
      state.activeMaterial = materialKey;
      state.isModified = true;
      state.massProperties = null; // Invalidate cache
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
    
    toggleSectionView: () => set(state => {
      state.sectionViewActive = !state.sectionViewActive;
    }),

    // ==================== PROPERTY PANEL ====================
    openPropertyPanel: (content) => set(state => {
      state.propertyPanelOpen = true;
      state.propertyPanelContent = content;
    }),

    closePropertyPanel: () => set(state => {
      state.propertyPanelOpen = false;
      state.propertyPanelContent = null;
    }),

    // ==================== DIALOGS ====================
    openDialog: (dialogType, props = {}) => set(state => {
      state.activeDialog = dialogType;
      state.dialogProps = props;
    }),

    closeDialog: () => set(state => {
      state.activeDialog = null;
      state.dialogProps = {};
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

    // ==================== UNDO / REDO ====================
    undo: () => set(state => {
      if (state.undoStack.length === 0) return;
      const action = state.undoStack.pop();
      
      switch (action.type) {
        case 'addFeature':
          state.redoStack.push({
            type: 'addFeature',
            feature: JSON.parse(JSON.stringify(state.features[action.featureIndex])),
            featureIndex: action.featureIndex,
          });
          state.features.splice(action.featureIndex, 1);
          break;
        case 'removeFeature':
          state.redoStack.push({
            type: 'removeFeature',
            feature: JSON.parse(JSON.stringify(action.feature)),
            featureIndex: action.featureIndex,
          });
          state.features.splice(action.featureIndex, 0, action.feature);
          break;
        case 'updateFeature': {
          const feat = state.features.find(f => f.id === action.featureId);
          if (feat) {
            state.redoStack.push({
              type: 'updateFeature',
              featureId: action.featureId,
              oldValues: JSON.parse(JSON.stringify(feat)),
            });
            Object.assign(feat, action.oldValues);
          }
          break;
        }
      }
      state.needsRebuild = true;
      state.isModified = true;
      state.statusMessage = 'Undo';
    }),

    redo: () => set(state => {
      if (state.redoStack.length === 0) return;
      const action = state.redoStack.pop();
      
      switch (action.type) {
        case 'addFeature':
          state.undoStack.push({
            type: 'addFeature',
            featureIndex: action.featureIndex,
            feature: JSON.parse(JSON.stringify(action.feature)),
          });
          state.features.splice(action.featureIndex, 0, action.feature);
          break;
        case 'removeFeature':
          state.undoStack.push({
            type: 'removeFeature',
            feature: JSON.parse(JSON.stringify(action.feature)),
            featureIndex: action.featureIndex,
          });
          const idx = state.features.findIndex(f => f.id === action.feature.id);
          if (idx !== -1) state.features.splice(idx, 1);
          break;
        case 'updateFeature': {
          const feat = state.features.find(f => f.id === action.featureId);
          if (feat) {
            state.undoStack.push({
              type: 'updateFeature',
              featureId: action.featureId,
              oldValues: JSON.parse(JSON.stringify(feat)),
            });
            Object.assign(feat, action.oldValues);
          }
          break;
        }
      }
      state.needsRebuild = true;
      state.isModified = true;
      state.statusMessage = 'Redo';
    }),

    // ==================== REBUILD ====================
    markRebuilt: () => set(state => {
      state.needsRebuild = false;
    }),

    rebuild: () => set(state => {
      state.needsRebuild = true;
      state.statusMessage = 'Rebuilding...';
    }),

    // ==================== NOTIFICATIONS ====================
    addNotification: (message, type = 'info') => set(state => {
      state.notifications.push({
        id: generateId('notif'),
        message,
        type,
        timestamp: Date.now(),
      });
      // Keep only last 10
      if (state.notifications.length > 10) state.notifications.shift();
    }),

    dismissNotification: (notifId) => set(state => {
      state.notifications = state.notifications.filter(n => n.id !== notifId);
    }),

    // ==================== TREE ====================
    toggleTreeNode: (nodeId) => set(state => {
      const expanded = new Set(state.expandedNodes);
      if (expanded.has(nodeId)) expanded.delete(nodeId);
      else expanded.add(nodeId);
      state.expandedNodes = expanded;
    }),

    // ==================== ASSEMBLY ====================
    addComponent: (component) => set(state => {
      state.assemblyComponents.push({
        id: generateId('comp'),
        ...component,
      });
    }),

    addMate: (mate) => set(state => {
      state.mates.push({
        id: generateId('mate'),
        ...mate,
      });
    }),

    // ==================== MEASUREMENTS ====================
    addMeasurement: (measurement) => set(state => {
      state.measurements.push({
        id: generateId('measure'),
        ...measurement,
      });
    }),

    clearMeasurements: () => set(state => {
      state.measurements = [];
    }),

    // ==================== MASS PROPERTIES ====================
    setMassProperties: (props) => set(state => {
      state.massProperties = props;
    }),

    // ==================== PROJECT SAVE/LOAD ====================
    saveProject: () => {
      const state = get();
      const project = {
        version: '1.0.0',
        documentName: state.documentName,
        appMode: state.appMode,
        features: state.features,
        sketchEntities: state.sketchEntities,
        sketchConstraints: state.sketchConstraints,
        sketchDimensions: state.sketchDimensions,
        activeMaterial: state.activeMaterial,
        settings: state.settings,
        timestamp: Date.now(),
      };
      return JSON.stringify(project, null, 2);
    },

    loadProject: (jsonString) => set(state => {
      try {
        const project = JSON.parse(jsonString);
        if (project.version) {
          state.documentName = project.documentName || 'Imported Part';
          state.appMode = project.appMode || APP_MODES.PART;
          state.features = project.features || [];
          state.sketchEntities = project.sketchEntities || {};
          state.sketchConstraints = project.sketchConstraints || {};
          state.sketchDimensions = project.sketchDimensions || {};
          state.activeMaterial = project.activeMaterial || 'Steel_1020';
          state.settings = { ...DEFAULT_SETTINGS, ...(project.settings || {}) };
          state.needsRebuild = true;
          state.isModified = false;
          state.statusMessage = `Loaded: ${state.documentName}`;
        }
      } catch (e) {
        state.statusMessage = 'Error loading project';
      }
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

    // ==================== REFS (non-immer) ====================
    setCameraRef: (ref) => set({ cameraRef: ref }),
    setControlsRef: (ref) => set({ controlsRef: ref }),
    setSceneRef: (ref) => set({ sceneRef: ref }),
    setRendererRef: (ref) => set({ rendererRef: ref }),
  }))
);
