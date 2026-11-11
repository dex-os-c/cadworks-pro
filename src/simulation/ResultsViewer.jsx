// CADWorks Pro - FEA Results Viewer (Responsive Mobile & Desktop, 3D Solid & Beam FEA)
import React, { useState } from 'react';
import { Play, ShieldAlert, Award, ChevronDown, ChevronUp, Layers, FileText } from 'lucide-react';
import { useCADStore } from '../store/cadStore.js';
import { feaEngine, ELEMENT_TYPES } from './FEAEngine.js';
import { materialLibrary } from '../kernel/MaterialLibrary.js';
import DrawingViewModal from '../drawings/DrawingViewModal.jsx';

export default function ResultsViewer() {
  const bodies = useCADStore(s => s.bodies);
  const activeMaterial = useCADStore(s => s.activeMaterial);

  const [load, setLoad] = useState(5000); // 5000 N
  const [results, setResults] = useState(null);
  const [minimized, setMinimized] = useState(window.innerWidth <= 768);
  const [elementType, setElementType] = useState(ELEMENT_TYPES.TET4);
  const [showTensors, setShowTensors] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);

  const handleRunFEA = () => {
    if (bodies.length === 0 || !bodies[0]?.geometry) {
      alert('Please create a 3D solid body first!');
      return;
    }

    try {
      const mat = materialLibrary.getMaterial(activeMaterial) || { yieldStrength: 250e6, youngsModulus: 200e9, poissonRatio: 0.3 };
      feaEngine.generateMesh(bodies[0].geometry, { elementType });
      const res = feaEngine.solve(
        load,
        mat.yieldStrength || 250e6,
        mat.youngsModulus || 200e9,
        mat.poissonRatio !== undefined ? mat.poissonRatio : 0.3
      );
      setResults(res);
    } catch (err) {
      console.error('FEA solve failed:', err);
      alert('Simulation error: ' + (err.message || 'Unable to solve FEA model.'));
      setResults(null);
    }
  };

  return (
    <>
      {minimized ? (
        <div style={{ position: 'absolute', bottom: 32, right: 12, display: 'flex', gap: 8, zIndex: 50 }}>
          <button
            className="fea-minimized-badge"
            onClick={() => setMinimized(false)}
            title="Open FEA Simulation"
            style={{
              background: 'rgba(9, 71, 113, 0.92)',
              border: '1px solid #4fc3f7',
              color: '#fff',
              borderRadius: 20,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <Play size={12} color="#4fc3f7" />
            <span>3D FEA Stress</span>
          </button>

          <button
            onClick={() => setDrawingOpen(true)}
            title="Open 2D Engineering Drawing"
            style={{
              background: 'rgba(16, 85, 45, 0.92)',
              border: '1px solid #34d399',
              color: '#fff',
              borderRadius: 20,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <FileText size={12} color="#34d399" />
            <span>2D Drawing</span>
          </button>
        </div>
      ) : (
        <div className="fea-panel" style={{
          position: 'absolute',
          bottom: 34,
          right: 12,
          background: 'rgba(25, 25, 28, 0.95)',
          border: '1px solid #444',
          borderRadius: 8,
          padding: 12,
          width: 290,
          maxWidth: 'calc(100vw - 24px)',
          color: '#fff',
          zIndex: 50,
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#4fc3f7' }}>3D Solid FEA Simulation</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setDrawingOpen(true)}
                title="2D Engineering Drawing"
                style={{
                  background: '#059669',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '3px 7px',
                  cursor: 'pointer',
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <FileText size={11} /> 2D Dwg
              </button>
              <button
                onClick={handleRunFEA}
                style={{
                  background: '#007acc',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Play size={12} /> Solve
              </button>
              <button
                className="icon-btn"
                onClick={() => setMinimized(true)}
                title="Minimize"
                style={{ padding: 2, background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Mesh Element:</span>
            <select
              value={elementType}
              onChange={(e) => setElementType(e.target.value)}
              style={{ background: '#111', color: '#fff', border: '1px solid #444', borderRadius: 3, padding: '2px 4px', fontSize: 10 }}
            >
              <option value={ELEMENT_TYPES.TET4}>Tet4 (Linear)</option>
              <option value={ELEMENT_TYPES.TET10}>Tet10 (Quadratic)</option>
            </select>
          </div>

          <div style={{ fontSize: 11, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Applied Force:</span>
            <div>
              <input
                type="number"
                value={load}
                onChange={(e) => setLoad(parseFloat(e.target.value) || 0)}
                style={{ width: 65, background: '#111', color: '#fff', border: '1px solid #444', borderRadius: 3, padding: '3px 6px', fontSize: 11 }}
              /> N
            </div>
          </div>

          {results && (
            <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div><strong>Max von Mises:</strong> {results.maxStressMPa.toFixed(1)} MPa</div>
              <div><strong>Max Deflection:</strong> {(results.maxDisplacementMM * 1000).toFixed(3)} μm</div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: results.factorOfSafety >= 1.5 ? '#4caf50' : '#f44336',
                fontWeight: 700,
              }}>
                {results.factorOfSafety >= 1.5 ? <Award size={14} /> : <ShieldAlert size={14} />}
                <span>Safety Factor: {results.factorOfSafety.toFixed(2)}</span>
              </div>

              {/* Color Gradient Legend */}
              <div style={{ marginTop: 4 }}>
                <div style={{
                  height: 10,
                  borderRadius: 3,
                  background: 'linear-gradient(90deg, #0000ff 0%, #00ffff 25%, #00ff00 50%, #ffff00 75%, #ff0000 100%)',
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#aaa', marginTop: 2 }}>
                  <span>{results.minStressMPa.toFixed(0)} MPa</span>
                  <span>{results.maxStressMPa.toFixed(0)} MPa</span>
                </div>
              </div>

              {/* 3D Cauchy & Principal Stress Details Toggle */}
              <button
                onClick={() => setShowTensors(!showTensors)}
                style={{
                  marginTop: 6,
                  background: 'transparent',
                  border: '1px solid #444',
                  color: '#4fc3f7',
                  borderRadius: 4,
                  padding: '2px 6px',
                  fontSize: 10,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>3D Stress Tensors (Cauchy)</span>
                {showTensors ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showTensors && results.solidResult?.elementStresses?.length > 0 && results.solidResult.elementStresses[0]?.stress && (
                <div style={{
                  background: '#18181b',
                  padding: 6,
                  borderRadius: 4,
                  fontSize: 9,
                  color: '#ccc',
                  fontFamily: 'monospace',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}>
                  <div>σ_xx: {((results.solidResult.elementStresses[0].stress[0] || 0) / 1e6).toFixed(2)} MPa</div>
                  <div>σ_yy: {((results.solidResult.elementStresses[0].stress[1] || 0) / 1e6).toFixed(2)} MPa</div>
                  <div>σ_zz: {((results.solidResult.elementStresses[0].stress[2] || 0) / 1e6).toFixed(2)} MPa</div>
                  <div>τ_xy: {((results.solidResult.elementStresses[0].stress[3] || 0) / 1e6).toFixed(2)} MPa</div>
                  {results.solidResult.elementStresses[0].principalStresses && (
                    <div style={{ color: '#4fc3f7', marginTop: 2 }}>
                      σ_1: {((results.solidResult.elementStresses[0].principalStresses[0] || 0) / 1e6).toFixed(2)} |
                      σ_2: {((results.solidResult.elementStresses[0].principalStresses[1] || 0) / 1e6).toFixed(2)} |
                      σ_3: {((results.solidResult.elementStresses[0].principalStresses[2] || 0) / 1e6).toFixed(2)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <DrawingViewModal isOpen={drawingOpen} onClose={() => setDrawingOpen(false)} />
    </>
  );
}

