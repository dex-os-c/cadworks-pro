// CADWorks Pro - Material Selection Dialog
import React, { useState } from 'react';
import { X, Check, Sliders, Info } from 'lucide-react';
import { useCADStore } from '../../store/cadStore';
import { materialLibrary } from '../../kernel/MaterialLibrary';

export default function MaterialDialog({ isOpen, onClose }) {
  const activeMaterial = useCADStore(s => s.activeMaterial);
  const setMaterial = useCADStore(s => s.setMaterial);

  const [selectedKey, setSelectedKey] = useState(activeMaterial);
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const allMaterials = materialLibrary.getAllMaterials();
  const filtered = allMaterials.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedData = materialLibrary.getMaterial(selectedKey);

  const handleApply = () => {
    setMaterial(selectedKey);
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-box" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={16} color="#ba68c8" />
            <span>Material Selection</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="dialog-body">
          <input
            type="text"
            placeholder="Search engineering materials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              background: '#1e1e22',
              border: '1px solid #444',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: 4,
              fontSize: 12,
              outline: 'none',
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, minHeight: 220 }}>
            {/* Material List */}
            <div style={{ overflowY: 'auto', maxHeight: 240, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map(mat => (
                <div
                  key={mat.key}
                  className={`material-card ${selectedKey === mat.key ? 'active' : ''}`}
                  onClick={() => setSelectedKey(mat.key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: mat.color, border: '1px solid #666' }} />
                    <span style={{ fontSize: 12, fontWeight: selectedKey === mat.key ? 600 : 400 }}>{mat.name}</span>
                  </div>
                  {selectedKey === mat.key && <Check size={14} color="#4fc3f7" />}
                </div>
              ))}
            </div>

            {/* Material Properties View */}
            <div style={{ background: '#1c1c1f', padding: 10, borderRadius: 4, border: '1px solid #333', fontSize: 12 }}>
              <h4 style={{ color: '#4fc3f7', marginBottom: 8 }}>{selectedData.name}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><strong>Density:</strong> {selectedData.density} kg/m³</div>
                <div><strong>Elastic Modulus:</strong> {(selectedData.youngsModulus / 1e9).toFixed(1)} GPa</div>
                <div><strong>Poisson's Ratio:</strong> {selectedData.poissonsRatio}</div>
                <div><strong>Yield Strength:</strong> {(selectedData.yieldStrength / 1e6).toFixed(1)} MPa</div>
              </div>
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleApply}>Apply Material</button>
        </div>
      </div>
    </div>
  );
}
