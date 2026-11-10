// CADWorks Pro - Mass Properties Dialog
import React, { useMemo } from 'react';
import { X, Scale, Info } from 'lucide-react';
import { useCADStore } from '../../store/cadStore';
import { materialLibrary } from '../../kernel/MaterialLibrary';
import { geometryEngine } from '../../kernel/GeometryEngine';

export default function MassPropsDialog({ isOpen, onClose }) {
  const bodies = useCADStore(s => s.bodies);
  const activeMaterial = useCADStore(s => s.activeMaterial);

  const matData = materialLibrary.getMaterial(activeMaterial);

  const massProps = useMemo(() => {
    if (bodies.length === 0 || !bodies[0].geometry) {
      return null;
    }
    return geometryEngine.computeMassProperties(bodies[0].geometry, matData);
  }, [bodies, matData]);

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-box" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Scale size={16} color="#4fc3f7" />
            <span>Mass Properties: {matData.name}</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="dialog-body">
          {massProps ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
              <div style={{ background: '#1c1c1f', padding: 8, borderRadius: 4 }}>
                <strong>Material:</strong> {matData.name} (Density: {matData.density} kg/m³)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: '#252529', padding: 8, borderRadius: 4 }}>
                  <div style={{ color: '#aaa' }}>Total Mass</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#4fc3f7', marginTop: 4 }}>
                    {(massProps.mass * 1000).toFixed(2)} g
                    <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>({massProps.mass.toFixed(4)} kg)</span>
                  </div>
                </div>

                <div style={{ background: '#252529', padding: 8, borderRadius: 4 }}>
                  <div style={{ color: '#aaa' }}>Volume</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#81c784', marginTop: 4 }}>
                    {(massProps.volume / 1000).toFixed(2)} cm³
                  </div>
                </div>

                <div style={{ background: '#252529', padding: 8, borderRadius: 4 }}>
                  <div style={{ color: '#aaa' }}>Surface Area</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#ffb74d', marginTop: 4 }}>
                    {(massProps.surfaceArea / 100).toFixed(2)} cm²
                  </div>
                </div>

                <div style={{ background: '#252529', padding: 8, borderRadius: 4 }}>
                  <div style={{ color: '#aaa' }}>Center of Mass (X, Y, Z)</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#ce93d8', marginTop: 4 }}>
                    ({massProps.centerOfMass.x.toFixed(2)}, {massProps.centerOfMass.y.toFixed(2)}, {massProps.centerOfMass.z.toFixed(2)}) mm
                  </div>
                </div>
              </div>

              <div style={{ background: '#1c1c1f', padding: 8, borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }}>
                <div style={{ color: '#aaa', marginBottom: 4 }}>Moments of Inertia (g · mm²):</div>
                <div>Ixx: {(massProps.momentsOfInertia.Ixx * 1e9).toFixed(1)}</div>
                <div>Iyy: {(massProps.momentsOfInertia.Iyy * 1e9).toFixed(1)}</div>
                <div>Izz: {(massProps.momentsOfInertia.Izz * 1e9).toFixed(1)}</div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>
              No 3D solid bodies currently active in model.
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
