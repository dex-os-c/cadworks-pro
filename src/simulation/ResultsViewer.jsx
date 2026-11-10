// CADWorks Pro - FEA Results Viewer (Responsive Mobile & Desktop)
import React, { useState } from 'react';
import { Play, ShieldAlert, Award, ChevronDown } from 'lucide-react';
import { useCADStore } from '../store/cadStore';
import { feaEngine } from './FEAEngine';
import { materialLibrary } from '../kernel/MaterialLibrary';

export default function ResultsViewer() {
  const bodies = useCADStore(s => s.bodies);
  const activeMaterial = useCADStore(s => s.activeMaterial);

  const [load, setLoad] = useState(5000); // 5000 N
  const [results, setResults] = useState(null);
  const [minimized, setMinimized] = useState(window.innerWidth <= 768);

  const handleRunFEA = () => {
    if (bodies.length === 0 || !bodies[0].geometry) {
      alert('Please create a 3D solid body first!');
      return;
    }

    const mat = materialLibrary.getMaterial(activeMaterial);
    feaEngine.generateMesh(bodies[0].geometry);
    const res = feaEngine.solve(load, mat.yieldStrength);
    setResults(res);
  };

  if (minimized) {
    return (
      <button
        className="fea-minimized-badge"
        onClick={() => setMinimized(false)}
        title="Open FEA Simulation"
        style={{
          position: 'absolute',
          bottom: 32,
          right: 12,
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
          zIndex: 50,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Play size={12} color="#4fc3f7" />
        <span>FEA Stress</span>
      </button>
    );
  }

  return (
    <div className="fea-panel" style={{
      position: 'absolute',
      bottom: 34,
      right: 12,
      background: 'rgba(25, 25, 28, 0.94)',
      border: '1px solid #444',
      borderRadius: 8,
      padding: 12,
      width: 260,
      maxWidth: 'calc(100vw - 24px)',
      color: '#fff',
      zIndex: 50,
      boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: '#4fc3f7' }}>FEA Stress Analysis</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
            style={{ padding: 2 }}
          >
            <ChevronDown size={14} />
          </button>
        </div>
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
          <div style={{ marginTop: 6 }}>
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
        </div>
      )}
    </div>
  );
}
