// CADWorks Pro - Application Constants

// UI Theme Colors (SolidWorks-inspired)
export const COLORS = {
  // Main UI
  bgPrimary: '#2d2d30',
  bgSecondary: '#3e3e42',
  bgTertiary: '#333337',
  bgPanel: '#252526',
  bgHover: '#404044',
  bgActive: '#094771',
  bgSelected: '#094771',
  
  // Text
  textPrimary: '#f0f0f0',
  textSecondary: '#cccccc',
  textMuted: '#888888',
  textDisabled: '#666666',
  
  // Accent
  accent: '#007acc',
  accentHover: '#1c97ea',
  accentLight: '#4fc3f7',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  
  // 3D Viewport
  viewportBg: '#3d3d3d',
  gridColor: '#555555',
  gridCenterLine: '#888888',
  
  // Feature tree
  sketchColor: '#ffb74d',
  featureColor: '#4fc3f7',
  bodyColor: '#81c784',
  planeColor: '#ce93d8',
  originColor: '#ef5350',
  
  // Sketch entities
  sketchLine: '#ffffff',
  sketchArc: '#ffffff',
  sketchConstrained: '#00ff00',
  sketchSelected: '#00bfff',
  sketchDimension: '#ff6600',
  sketchReference: '#808080',
};

// Application modes
export const APP_MODES = {
  PART: 'part',
  ASSEMBLY: 'assembly',
  DRAWING: 'drawing',
};

// Active tool states
export const TOOLS = {
  NONE: 'none',
  SELECT: 'select',
  // Sketch tools
  SKETCH_LINE: 'sketch_line',
  SKETCH_RECT: 'sketch_rect',
  SKETCH_CIRCLE: 'sketch_circle',
  SKETCH_ARC: 'sketch_arc',
  SKETCH_SPLINE: 'sketch_spline',
  SKETCH_POLYGON: 'sketch_polygon',
  SKETCH_ELLIPSE: 'sketch_ellipse',
  SKETCH_SLOT: 'sketch_slot',
  SKETCH_POINT: 'sketch_point',
  SKETCH_TRIM: 'sketch_trim',
  SKETCH_OFFSET: 'sketch_offset',
  SKETCH_MIRROR: 'sketch_mirror',
  SKETCH_DIMENSION: 'sketch_dimension',
  SKETCH_CONSTRUCTION: 'sketch_construction',
  // Feature tools
  EXTRUDE: 'extrude',
  REVOLVE: 'revolve',
  SWEEP: 'sweep',
  LOFT: 'loft',
  FILLET: 'fillet',
  CHAMFER: 'chamfer',
  SHELL: 'shell',
  HOLE: 'hole',
  LINEAR_PATTERN: 'linear_pattern',
  CIRCULAR_PATTERN: 'circular_pattern',
  MIRROR: 'mirror',
  BOOLEAN: 'boolean',
  // Surface tools
  SURFACE_EXTRUDE: 'surface_extrude',
  SURFACE_REVOLVE: 'surface_revolve',
  SURFACE_SWEEP: 'surface_sweep',
  SURFACE_LOFT: 'surface_loft',
  SURFACE_TRIM: 'surface_trim',
  SURFACE_KNIT: 'surface_knit',
  // Measurement
  MEASURE: 'measure',
  SECTION_VIEW: 'section_view',
  // Assembly
  MATE: 'mate',
  INSERT_COMPONENT: 'insert_component',
  EXPLODED_VIEW: 'exploded_view',
};

// Feature types
export const FEATURE_TYPES = {
  SKETCH: 'sketch',
  EXTRUDE_BOSS: 'extrude_boss',
  EXTRUDE_CUT: 'extrude_cut',
  REVOLVE_BOSS: 'revolve_boss',
  REVOLVE_CUT: 'revolve_cut',
  SWEEP_BOSS: 'sweep_boss',
  SWEEP_CUT: 'sweep_cut',
  LOFT_BOSS: 'loft_boss',
  LOFT_CUT: 'loft_cut',
  FILLET: 'fillet',
  CHAMFER: 'chamfer',
  SHELL: 'shell',
  HOLE: 'hole',
  LINEAR_PATTERN: 'linear_pattern',
  CIRCULAR_PATTERN: 'circular_pattern',
  MIRROR: 'mirror',
  BOOLEAN: 'boolean',
  REFERENCE_PLANE: 'reference_plane',
  REFERENCE_AXIS: 'reference_axis',
};

// Sketch entity types
export const SKETCH_ENTITY_TYPES = {
  LINE: 'line',
  ARC: 'arc',
  CIRCLE: 'circle',
  RECT: 'rect',
  SPLINE: 'spline',
  ELLIPSE: 'ellipse',
  POINT: 'point',
  POLYGON: 'polygon',
  SLOT: 'slot',
  CONSTRUCTION: 'construction',
};

// Constraint types
export const CONSTRAINT_TYPES = {
  COINCIDENT: 'coincident',
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
  PARALLEL: 'parallel',
  PERPENDICULAR: 'perpendicular',
  TANGENT: 'tangent',
  EQUAL: 'equal',
  SYMMETRIC: 'symmetric',
  FIX: 'fix',
  MIDPOINT: 'midpoint',
  CONCENTRIC: 'concentric',
  COLINEAR: 'colinear',
  DIMENSION: 'dimension',
};

// Mate types for assembly
export const MATE_TYPES = {
  COINCIDENT: 'coincident',
  PARALLEL: 'parallel',
  PERPENDICULAR: 'perpendicular',
  TANGENT: 'tangent',
  CONCENTRIC: 'concentric',
  DISTANCE: 'distance',
  ANGLE: 'angle',
};

// Material database
export const MATERIALS = {
  'Steel_1020': { name: 'AISI 1020 Steel', density: 7900, youngsModulus: 200e9, poissonsRatio: 0.29, yieldStrength: 350e6, color: '#b0b0b0' },
  'Steel_304SS': { name: '304 Stainless Steel', density: 8000, youngsModulus: 193e9, poissonsRatio: 0.29, yieldStrength: 215e6, color: '#c0c0c0' },
  'Steel_4140': { name: 'AISI 4140 Steel', density: 7850, youngsModulus: 210e9, poissonsRatio: 0.29, yieldStrength: 655e6, color: '#a8a8a8' },
  'Aluminum_6061': { name: 'Aluminum 6061-T6', density: 2700, youngsModulus: 68.9e9, poissonsRatio: 0.33, yieldStrength: 276e6, color: '#d4d4d4' },
  'Aluminum_7075': { name: 'Aluminum 7075-T6', density: 2810, youngsModulus: 71.7e9, poissonsRatio: 0.33, yieldStrength: 503e6, color: '#d8d8d8' },
  'Titanium_Ti6Al4V': { name: 'Titanium Ti-6Al-4V', density: 4430, youngsModulus: 113.8e9, poissonsRatio: 0.342, yieldStrength: 880e6, color: '#8899aa' },
  'Copper_C11000': { name: 'Copper C11000', density: 8940, youngsModulus: 117e9, poissonsRatio: 0.34, yieldStrength: 70e6, color: '#b87333' },
  'Brass_C36000': { name: 'Brass C36000', density: 8500, youngsModulus: 97e9, poissonsRatio: 0.34, yieldStrength: 310e6, color: '#c5a431' },
  'ABS_Plastic': { name: 'ABS Plastic', density: 1070, youngsModulus: 2.3e9, poissonsRatio: 0.35, yieldStrength: 43e6, color: '#f5f5dc' },
  'Nylon_66': { name: 'Nylon 6/6', density: 1140, youngsModulus: 3.3e9, poissonsRatio: 0.41, yieldStrength: 82e6, color: '#fffdd0' },
  'PTFE': { name: 'PTFE (Teflon)', density: 2170, youngsModulus: 0.5e9, poissonsRatio: 0.46, yieldStrength: 23e6, color: '#f0f0f0' },
  'Cast_Iron': { name: 'Gray Cast Iron', density: 7200, youngsModulus: 100e9, poissonsRatio: 0.26, yieldStrength: 240e6, color: '#808080' },
  'Carbon_Fiber': { name: 'Carbon Fiber (Epoxy)', density: 1600, youngsModulus: 70e9, poissonsRatio: 0.10, yieldStrength: 600e6, color: '#333333' },
  'Glass': { name: 'Soda-Lime Glass', density: 2500, youngsModulus: 72e9, poissonsRatio: 0.22, yieldStrength: 33e6, color: '#aaddff' },
  'Wood_Oak': { name: 'Red Oak', density: 660, youngsModulus: 12.5e9, poissonsRatio: 0.35, yieldStrength: 46e6, color: '#8B6914' },
  'Rubber': { name: 'Natural Rubber', density: 920, youngsModulus: 0.01e9, poissonsRatio: 0.49, yieldStrength: 20e6, color: '#333333' },
};

// Default settings
export const DEFAULT_SETTINGS = {
  units: 'mm',
  gridSize: 10,
  gridSubdivisions: 10,
  snapToGrid: true,
  snapAngle: 15,
  precision: 4,
  defaultMaterial: 'Steel_1020',
  backgroundColor: '#3d3d3d',
  showOrigin: true,
  showPlanes: true,
  showGrid: true,
  showAxes: true,
  perspectiveView: true,
  edgeDisplay: true,
  shadedMode: true,
  antialiasing: true,
};

// Keyboard shortcuts
export const SHORTCUTS = {
  'Ctrl+Z': 'undo',
  'Ctrl+Y': 'redo',
  'Ctrl+Shift+Z': 'redo',
  'Ctrl+S': 'save',
  'Ctrl+O': 'open',
  'Ctrl+N': 'new',
  'Ctrl+C': 'copy',
  'Ctrl+V': 'paste',
  'Ctrl+A': 'selectAll',
  'Delete': 'delete',
  'Escape': 'cancel',
  'L': 'sketch_line',
  'R': 'sketch_rect',
  'C': 'sketch_circle',
  'D': 'sketch_dimension',
  'E': 'extrude',
  'F': 'fillet',
  'M': 'measure',
  'S': 'section_view',
  'F5': 'rebuild',
  'Space': 'viewOrientation',
  'Ctrl+1': 'viewFront',
  'Ctrl+2': 'viewBack',
  'Ctrl+3': 'viewLeft',
  'Ctrl+4': 'viewRight',
  'Ctrl+5': 'viewTop',
  'Ctrl+6': 'viewBottom',
  'Ctrl+7': 'viewIsometric',
};

// View orientations
export const VIEW_ORIENTATIONS = {
  front:     { position: [0, 0, 100], up: [0, 1, 0], name: 'Front' },
  back:      { position: [0, 0, -100], up: [0, 1, 0], name: 'Back' },
  left:      { position: [-100, 0, 0], up: [0, 1, 0], name: 'Left' },
  right:     { position: [100, 0, 0], up: [0, 1, 0], name: 'Right' },
  top:       { position: [0, 100, 0], up: [0, 0, -1], name: 'Top' },
  bottom:    { position: [0, -100, 0], up: [0, 0, 1], name: 'Bottom' },
  isometric: { position: [70, 70, 70], up: [0, 1, 0], name: 'Isometric' },
  trimetric: { position: [80, 50, 60], up: [0, 1, 0], name: 'Trimetric' },
};

// Export formats
export const EXPORT_FORMATS = {
  STL: { ext: '.stl', name: 'STL (Stereolithography)', mime: 'application/sla' },
  OBJ: { ext: '.obj', name: 'OBJ (Wavefront)', mime: 'text/plain' },
  STEP: { ext: '.step', name: 'STEP (ISO 10303)', mime: 'application/step' },
  DXF: { ext: '.dxf', name: 'DXF (Drawing Exchange)', mime: 'application/dxf' },
  JSON: { ext: '.json', name: 'CADWorks Project', mime: 'application/json' },
};
