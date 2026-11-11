// CADWorks Pro - CommandManager Ribbon Toolbar (Professional Engineering UI)
import React, { useState } from 'react';
import {
  FilePlus, FolderOpen, Save, Undo2, Redo2, RefreshCw,
  Box, Maximize2, RotateCw, Spline, Shield, CircleDot,
  Layers, Copy, Scissors, Compass, Sliders, Play, CheckCircle2,
  XCircle, Square, Circle, PenTool, Hash, Info, FileSpreadsheet,
  Download, Eye, Grid, Scale, Menu, ChevronUp, ChevronDown,
  Sparkles, Layers3, Cpu, FileText, Check, ArrowRight
} from 'lucide-react';
import { useCADStore } from '../../store/cadStore';
import { TOOLS, FEATURE_TYPES } from '../../utils/constants';
import { CAD_EXAMPLES } from '../../utils/examples';

export default function CommandManager({ onExportClick, onMaterialClick, onMassPropsClick, onToggleTree }) {
  const activeTab = useCADStore(s => s.activeCommandTab);
  const setCommandTab = useCADStore(s => s.setCommandTab);
  const activeTool = useCADStore(s => s.activeTool);
  const setActiveTool = useCADStore(s => s.setActiveTool);
  const isSketchActive = useCADStore(s => s.isSketchActive);
  const startSketch = useCADStore(s => s.startSketch);
  const endSketch = useCADStore(s => s.endSketch);
  const openPropertyPanel = useCADStore(s => s.openPropertyPanel);
  const undo = useCADStore(s => s.undo);
  const redo = useCADStore(s => s.redo);
  const rebuild = useCADStore(s => s.rebuild);
  const newProject = useCADStore(s => s.newProject);
  const saveProject = useCADStore(s => s.saveProject);
  const toggleConstruction = useCADStore(s => s.toggleConstructionMode);
  const constructionMode = useCADStore(s => s.constructionMode);
  const toggleSectionView = useCADStore(s => s.toggleSectionView);
  const sectionActive = useCADStore(s => s.sectionViewActive);
  const documentName = useCADStore(s => s.documentName);
  const isModified = useCADStore(s => s.isModified);
  const loadExampleModel = useCADStore(s => s.loadExampleModel);
  const insertAssemblyPart = useCADStore(s => s.insertAssemblyPart);
  const addAssemblyMate = useCADStore(s => s.addAssemblyMate);
  const solveAssembly = useCADStore(s => s.solveAssembly);
  const clearAssembly = useCADStore(s => s.clearAssembly);
  const assemblyComponents = useCADStore(s => s.assemblyComponents);

  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);

  const tabList = [
    { id: 'Features', label: 'Features', icon: <Box size={14} /> },
    { id: 'Sketch', label: 'Sketch', icon: <PenTool size={14} /> },
    { id: 'Surfaces', label: 'Surfaces', icon: <Layers size={14} /> },
    { id: 'Sheet Metal', label: 'Sheet Metal', icon: <Layers3 size={14} /> },
    { id: 'Assembly', label: 'Assembly', icon: <Cpu size={14} /> },
    { id: 'Evaluate', label: 'Evaluate', icon: <Scale size={14} /> },
    { id: 'Drawing', label: 'Drawing', icon: <FileText size={14} /> },
  ];

  const handleSave = () => {
    const json = saveProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentName.replace(/\s+/g, '_')}.cadproj`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpen = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cadproj,.json,.stl,.obj,.dxf';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      if (file.name.endsWith('.cadproj') || file.name.endsWith('.json')) {
        reader.onload = (event) => useCADStore.getState().loadProject(event.target.result);
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <header className="top-header">
      {/* Quick Access Toolbar */}
      <div className="quick-access-bar">
        <div className="qa-group">
          {onToggleTree && (
            <button className="qa-btn tree-toggle-btn" onClick={onToggleTree} title="FeatureManager Tree (Sidebar)">
              <Menu size={16} color="#38bdf8" />
              <span className="qa-label">Tree</span>
            </button>
          )}

          <div className="brand-title">
            <div className="brand-logo-glow">
              <Box size={16} color="#38bdf8" />
            </div>
            <span className="brand-text">CADWorks <span className="brand-pro-badge">PRO</span></span>
          </div>

          <div className="qa-separator" />

          <button className="qa-btn" onClick={newProject} title="New Part (Ctrl+N)">
            <FilePlus size={14} /> <span className="qa-label">New</span>
          </button>
          <button className="qa-btn" onClick={handleOpen} title="Open Document (Ctrl+O)">
            <FolderOpen size={14} /> <span className="qa-label">Open</span>
          </button>
          <button className="qa-btn" onClick={handleSave} title="Save Document (Ctrl+S)">
            <Save size={14} /> <span className="qa-label">Save</span>
          </button>
          <button className="qa-btn" onClick={undo} title="Undo (Ctrl+Z)">
            <Undo2 size={14} />
          </button>
          <button className="qa-btn" onClick={redo} title="Redo (Ctrl+Y)">
            <Redo2 size={14} />
          </button>
          <button className="qa-btn rebuild-btn" onClick={rebuild} title="Rebuild Feature Tree (F5)">
            <RefreshCw size={14} color="#38bdf8" /> <span className="qa-label">Rebuild</span>
          </button>

          {/* Examples Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="qa-btn"
              onClick={() => setExamplesOpen(!examplesOpen)}
              title="Load Mechanical CAD Examples"
              style={{ background: 'rgba(251, 191, 36, 0.15)', borderColor: 'rgba(251, 191, 36, 0.4)' }}
            >
              <Sparkles size={14} color="#fbbf24" />
              <span className="qa-label" style={{ color: '#fbbf24', fontWeight: 600 }}>Examples</span>
              <ChevronDown size={11} color="#fbbf24" />
            </button>

            {examplesOpen && (
              <div className="examples-dropdown-menu" style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: '#181b22',
                border: '1px solid #38bdf840',
                borderRadius: 6,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                width: 280,
                zIndex: 1000,
                padding: '6px 0',
              }}>
                <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #334155', letterSpacing: '0.5px' }}>
                  PARAMETRIC MECHANICAL EXAMPLES
                </div>
                {CAD_EXAMPLES.map(ex => (
                  <button
                    key={ex.id}
                    className="example-item-btn"
                    onClick={() => {
                      loadExampleModel(ex.create());
                      setExamplesOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      width: '100%',
                      padding: '8px 12px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{ex.name}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{ex.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center Document Title with Modified indicator */}
        <div className="doc-name-pill">
          <span className={`doc-status-dot ${isModified ? 'modified' : 'saved'}`} />
          <span className="doc-title-text">{documentName}</span>
          <span className="doc-unit-tag">MMGS</span>
        </div>

        {/* Right Tools */}
        <div className="qa-group">
          <button className="qa-btn" onClick={onMaterialClick} title="Material Library">
            <Sliders size={14} /> <span className="qa-label">Material</span>
          </button>
          <button className="qa-btn" onClick={onMassPropsClick} title="Mass Properties">
            <Scale size={14} /> <span className="qa-label">Mass Props</span>
          </button>
          <button className="qa-btn export-btn" onClick={onExportClick} title="Export CAD Model">
            <Download size={14} /> <span className="qa-label">Export</span>
          </button>
          <button
            className="qa-btn ribbon-toggle-btn"
            onClick={() => setRibbonCollapsed(!ribbonCollapsed)}
            title={ribbonCollapsed ? "Expand Ribbon" : "Collapse Ribbon"}
          >
            {ribbonCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Modern Segmented Ribbon Tabs */}
      <div className="command-tabs-header">
        {tabList.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => {
              setCommandTab(t.id);
              if (ribbonCollapsed) setRibbonCollapsed(false);
            }}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Ribbon Toolbars with Category Group Dividers */}
      {!ribbonCollapsed && (
        <div className="command-ribbon">
          {/* FEATURES TAB */}
          {activeTab === 'Features' && (
            <>
              <div className="tool-group">
                <div className="tool-group-buttons">
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.EXTRUDE ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.EXTRUDE);
                      openPropertyPanel({ type: FEATURE_TYPES.EXTRUDE_BOSS });
                    }}
                    title="Extruded Boss/Base"
                  >
                    <Maximize2 size={19} color="#38bdf8" />
                    <span>Extrude</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === 'extrude_cut' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool('extrude_cut');
                      openPropertyPanel({ type: FEATURE_TYPES.EXTRUDE_CUT });
                    }}
                    title="Extruded Cut"
                  >
                    <Scissors size={19} color="#fb923c" />
                    <span>Extrude Cut</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.REVOLVE ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.REVOLVE);
                      openPropertyPanel({ type: FEATURE_TYPES.REVOLVE_BOSS });
                    }}
                    title="Revolved Boss/Base"
                  >
                    <RotateCw size={19} color="#38bdf8" />
                    <span>Revolve</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.SWEEP ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.SWEEP);
                      openPropertyPanel({ type: FEATURE_TYPES.SWEEP_BOSS });
                    }}
                    title="Swept Boss/Base"
                  >
                    <Spline size={19} color="#4ade80" />
                    <span>Sweep</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.LOFT ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.LOFT);
                      openPropertyPanel({ type: FEATURE_TYPES.LOFT_BOSS });
                    }}
                    title="Lofted Boss/Base"
                  >
                    <Layers size={19} color="#c084fc" />
                    <span>Loft</span>
                  </button>
                </div>
                <div className="tool-group-label">SOLIDS</div>
              </div>

              <div className="tool-group">
                <div className="tool-group-buttons">
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.FILLET ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.FILLET);
                      openPropertyPanel({ type: FEATURE_TYPES.FILLET });
                    }}
                    title="Fillet Edges"
                  >
                    <CircleDot size={19} color="#2dd4bf" />
                    <span>Fillet</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.CHAMFER ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.CHAMFER);
                      openPropertyPanel({ type: FEATURE_TYPES.CHAMFER });
                    }}
                    title="Chamfer Edges"
                  >
                    <Shield size={19} color="#fde047" />
                    <span>Chamfer</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.SHELL ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.SHELL);
                      openPropertyPanel({ type: FEATURE_TYPES.SHELL });
                    }}
                    title="Shell Hollow Part"
                  >
                    <Box size={19} color="#fbbf24" />
                    <span>Shell</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.HOLE ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.HOLE);
                      openPropertyPanel({ type: FEATURE_TYPES.HOLE });
                    }}
                    title="Hole Wizard"
                  >
                    <CircleDot size={19} color="#f87171" />
                    <span>Hole</span>
                  </button>
                </div>
                <div className="tool-group-label">FINISHING</div>
              </div>

              <div className="tool-group">
                <div className="tool-group-buttons">
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.LINEAR_PATTERN ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.LINEAR_PATTERN);
                      openPropertyPanel({ type: FEATURE_TYPES.LINEAR_PATTERN });
                    }}
                    title="Linear Pattern"
                  >
                    <Grid size={19} color="#93c5fd" />
                    <span>Lin Pattern</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.CIRCULAR_PATTERN ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.CIRCULAR_PATTERN);
                      openPropertyPanel({ type: FEATURE_TYPES.CIRCULAR_PATTERN });
                    }}
                    title="Circular Pattern"
                  >
                    <RotateCw size={19} color="#93c5fd" />
                    <span>Cir Pattern</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.MIRROR ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(TOOLS.MIRROR);
                      openPropertyPanel({ type: FEATURE_TYPES.MIRROR });
                    }}
                    title="Mirror Feature"
                  >
                    <Copy size={19} color="#e879f9" />
                    <span>Mirror</span>
                  </button>
                </div>
                <div className="tool-group-label">PATTERN</div>
              </div>
            </>
          )}

          {/* SKETCH TAB */}
          {activeTab === 'Sketch' && (
            <>
              <div className="tool-group">
                <div className="tool-group-buttons">
                  {!isSketchActive ? (
                    <button
                      className="ribbon-btn primary-action-btn"
                      onClick={() => startSketch('Front')}
                      title="Create 2D Sketch"
                    >
                      <PenTool size={19} color="#38bdf8" />
                      <span>New Sketch</span>
                    </button>
                  ) : (
                    <>
                      <button className="ribbon-btn active exit-sketch-btn" onClick={() => endSketch(true)} title="Confirm & Exit Sketch">
                        <CheckCircle2 size={19} color="#4ade80" />
                        <span>Exit Sketch</span>
                      </button>
                      <button className="ribbon-btn cancel-sketch-btn" onClick={() => endSketch(false)} title="Discard Sketch Changes">
                        <XCircle size={19} color="#f87171" />
                        <span>Discard</span>
                      </button>
                    </>
                  )}
                </div>
                <div className="tool-group-label">SKETCH</div>
              </div>

              <div className="tool-group">
                <div className="tool-group-buttons">
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.SKETCH_LINE ? 'active' : ''}`}
                    onClick={() => setActiveTool(TOOLS.SKETCH_LINE)}
                    title="Line Tool (L)"
                  >
                    <PenTool size={19} color="#f1f5f9" />
                    <span>Line</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.SKETCH_RECT ? 'active' : ''}`}
                    onClick={() => setActiveTool(TOOLS.SKETCH_RECT)}
                    title="Corner Rectangle (R)"
                  >
                    <Square size={19} color="#f1f5f9" />
                    <span>Rectangle</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.SKETCH_CIRCLE ? 'active' : ''}`}
                    onClick={() => setActiveTool(TOOLS.SKETCH_CIRCLE)}
                    title="Center Circle (C)"
                  >
                    <Circle size={19} color="#f1f5f9" />
                    <span>Circle</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.SKETCH_POINT ? 'active' : ''}`}
                    onClick={() => setActiveTool(TOOLS.SKETCH_POINT)}
                    title="Sketch Point"
                  >
                    <CircleDot size={19} color="#f1f5f9" />
                    <span>Point</span>
                  </button>
                </div>
                <div className="tool-group-label">DRAW</div>
              </div>

              <div className="tool-group">
                <div className="tool-group-buttons">
                  <button
                    className={`ribbon-btn ${constructionMode ? 'active' : ''}`}
                    onClick={toggleConstruction}
                    title="Toggle Construction Line"
                  >
                    <Hash size={19} color="#fbbf24" />
                    <span>Construct</span>
                  </button>
                  <button
                    className={`ribbon-btn ${activeTool === TOOLS.SKETCH_DIMENSION ? 'active' : ''}`}
                    onClick={() => setActiveTool(TOOLS.SKETCH_DIMENSION)}
                    title="Smart Dimension (D)"
                  >
                    <Scale size={19} color="#f97316" />
                    <span>Dimension</span>
                  </button>
                </div>
                <div className="tool-group-label">TOOLS</div>
              </div>
            </>
          )}

          {/* EVALUATE TAB */}
          {activeTab === 'Evaluate' && (
            <div className="tool-group">
              <div className="tool-group-buttons">
                <button className="ribbon-btn" onClick={onMassPropsClick} title="Compute Mass Properties">
                  <Scale size={19} color="#38bdf8" />
                  <span>Mass Props</span>
                </button>
                <button
                  className={`ribbon-btn ${sectionActive ? 'active' : ''}`}
                  onClick={toggleSectionView}
                  title="Cross-Section Cut View"
                >
                  <Eye size={19} color="#fbbf24" />
                  <span>Section</span>
                </button>
              </div>
              <div className="tool-group-label">MEASURE</div>
            </div>
          )}

          {/* ASSEMBLY TAB */}
          {activeTab === 'Assembly' && (
            <>
              {/* INSERT COMPONENTS */}
              <div className="tool-group">
                <div className="tool-group-buttons">
                  <button
                    className="ribbon-btn"
                    onClick={() => insertAssemblyPart('Base_Plate', 'box', { width: 50, height: 12, depth: 50 })}
                    title="Insert Base Mounting Plate"
                  >
                    <Box size={19} color="#38bdf8" />
                    <span>Plate</span>
                  </button>
                  <button
                    className="ribbon-btn"
                    onClick={() => insertAssemblyPart('Pin_Shaft', 'pin')}
                    title="Insert Cylindrical Alignment Pin"
                  >
                    <CircleDot size={19} color="#fbbf24" />
                    <span>Pin</span>
                  </button>
                  <button
                    className="ribbon-btn"
                    onClick={() => insertAssemblyPart('Flange_Ring', 'flange')}
                    title="Insert Circular Bolt Flange"
                  >
                    <Circle size={19} color="#2dd4bf" />
                    <span>Flange</span>
                  </button>
                  <button
                    className="ribbon-btn"
                    onClick={() => insertAssemblyPart('Cylinder_Rod', 'cylinder', { radius: 12, height: 35 })}
                    title="Insert Cylinder Rod"
                  >
                    <Box size={19} color="#a78bfa" />
                    <span>Cylinder</span>
                  </button>
                </div>
                <div className="tool-group-label">COMPONENTS</div>
              </div>

              {/* ASSEMBLY MATES */}
              <div className="tool-group">
                <div className="tool-group-buttons">
                  <button
                    className="ribbon-btn"
                    onClick={() => {
                      if (assemblyComponents.length < 2) {
                        alert('Please insert at least two components to mate.');
                        return;
                      }
                      addAssemblyMate('coincident', assemblyComponents[0].id, 'top', assemblyComponents[1].id, 'bottom', 0);
                    }}
                    title="Coincident Mate (Align top and bottom faces)"
                  >
                    <Layers size={19} color="#38bdf8" />
                    <span>Coincident</span>
                  </button>
                  <button
                    className="ribbon-btn"
                    onClick={() => {
                      if (assemblyComponents.length < 2) {
                        alert('Please insert at least two components to mate.');
                        return;
                      }
                      addAssemblyMate('distance', assemblyComponents[0].id, 'top', assemblyComponents[1].id, 'bottom', 15);
                    }}
                    title="Distance Mate (15mm Offset)"
                  >
                    <ArrowRight size={19} color="#fb923c" />
                    <span>Distance</span>
                  </button>
                  <button
                    className="ribbon-btn"
                    onClick={() => {
                      if (assemblyComponents.length < 2) {
                        alert('Please insert at least two components to mate.');
                        return;
                      }
                      addAssemblyMate('concentric', assemblyComponents[0].id, 'z', assemblyComponents[1].id, 'z', 0);
                    }}
                    title="Concentric Mate (Align cylindrical axes)"
                  >
                    <CircleDot size={19} color="#2dd4bf" />
                    <span>Concentric</span>
                  </button>
                  <button
                    className="ribbon-btn"
                    onClick={() => {
                      if (assemblyComponents.length < 2) {
                        alert('Please insert at least two components to mate.');
                        return;
                      }
                      addAssemblyMate('parallel', assemblyComponents[0].id, 'top', assemblyComponents[1].id, 'top', 0);
                    }}
                    title="Parallel Mate (Align face normals)"
                  >
                    <Spline size={19} color="#fde047" />
                    <span>Parallel</span>
                  </button>
                </div>
                <div className="tool-group-label">MATES</div>
              </div>

              {/* ACTIONS */}
              <div className="tool-group">
                <div className="tool-group-buttons">
                  <button
                    className="ribbon-btn"
                    onClick={solveAssembly}
                    title="Re-solve all assembly mates numerically"
                  >
                    <Play size={19} color="#4ade80" />
                    <span>Solve</span>
                  </button>
                  <button
                    className="ribbon-btn"
                    onClick={clearAssembly}
                    title="Remove all components and mates"
                  >
                    <Scissors size={19} color="#f87171" />
                    <span>Clear</span>
                  </button>
                </div>
                <div className="tool-group-label">ACTIONS</div>
              </div>
            </>
          )}

          {/* SURFACES, SHEET METAL, DRAWING tabs */}
          {(activeTab === 'Surfaces' || activeTab === 'Sheet Metal' || activeTab === 'Drawing') && (
            <div className="tool-group">
              <div className="tool-group-buttons">
                <button
                  className="ribbon-btn"
                  onClick={() => {
                    setActiveTool(TOOLS.EXTRUDE);
                    openPropertyPanel({ type: FEATURE_TYPES.EXTRUDE_BOSS, mode: activeTab });
                  }}
                >
                  <Box size={19} color="#38bdf8" />
                  <span>{activeTab} Tool</span>
                </button>
              </div>
              <div className="tool-group-label">ACTIONS</div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
