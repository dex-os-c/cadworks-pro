// CADWorks Pro - Bottom Status Bar (Modern Engineering Pill Layout)
import React from 'react';
import { useCADStore } from '../../store/cadStore';
import { Magnet, Grid, Layers, Eye, Box, Compass, Sparkles } from 'lucide-react';

export default function StatusBar() {
  const statusMessage = useCADStore(s => s.statusMessage);
  const activeTool = useCADStore(s => s.activeTool);
  const isSketchActive = useCADStore(s => s.isSketchActive);
  const selectedEntities = useCADStore(s => s.selectedEntities);
  const showGrid = useCADStore(s => s.showGrid);
  const toggleGrid = useCADStore(s => s.toggleGrid);
  const snapEnabled = useCADStore(s => s.snapEnabled);
  const wireframeMode = useCADStore(s => s.wireframeMode);
  const toggleWireframe = useCADStore(s => s.toggleWireframe);
  const edgeDisplay = useCADStore(s => s.edgeDisplay);
  const toggleEdges = useCADStore(s => s.toggleEdges);
  const perspectiveView = useCADStore(s => s.perspectiveView);
  const togglePerspective = useCADStore(s => s.togglePerspective);

  return (
    <footer className="status-bar">
      <div className="status-left">
        <div className="status-indicator">
          <span className="status-pulse-dot" />
          <span className="status-msg-text">{statusMessage}</span>
        </div>

        {isSketchActive && (
          <span className="sketch-active-tag">
            <span className="sketch-tag-dot" />
            <span>Editing Sketch</span>
          </span>
        )}
      </div>

      <div className="status-right">
        {/* Quick Viewport Visual Toggles */}
        <button
          className={`status-btn-pill ${showGrid ? 'active' : ''}`}
          onClick={toggleGrid}
          title="Toggle Model Grid"
        >
          <Grid size={12} />
          <span>Grid</span>
        </button>

        <button
          className={`status-btn-pill ${edgeDisplay ? 'active' : ''}`}
          onClick={toggleEdges}
          title="Toggle Sharp Edges"
        >
          <Box size={12} />
          <span>Edges</span>
        </button>

        <button
          className={`status-btn-pill ${wireframeMode ? 'active' : ''}`}
          onClick={toggleWireframe}
          title="Toggle Wireframe Mode"
        >
          <Layers size={12} />
          <span>Wireframe</span>
        </button>

        <button
          className="status-btn-pill"
          onClick={togglePerspective}
          title="Switch Perspective / Orthographic Camera"
        >
          <Compass size={12} />
          <span>{perspectiveView ? 'Persp' : 'Ortho'}</span>
        </button>

        <div className="status-separator" />

        {/* Selected Counter */}
        <div className="status-item-pill">
          <Layers size={12} color="#94a3b8" />
          <span>Selected: <strong style={{ color: '#38bdf8' }}>{selectedEntities.length}</strong></span>
        </div>

        {/* Unit Pill */}
        <div className="status-unit-badge" title="Units: Millimeter, Gram, Second">
          <span>MMGS</span>
        </div>
      </div>
    </footer>
  );
}
