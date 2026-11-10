// CADWorks Pro - Export Dialog
import React, { useState } from 'react';
import { X, Download, FileText } from 'lucide-react';
import { useCADStore } from '../../store/cadStore';
import { exportEngine } from '../../kernel/ExportEngine';

export default function ExportDialog({ isOpen, onClose }) {
  const bodies = useCADStore(s => s.bodies);
  const documentName = useCADStore(s => s.documentName);
  const activeSketchId = useCADStore(s => s.activeSketchId);
  const sketchEntities = useCADStore(s => s.sketchEntities);

  const [format, setFormat] = useState('stl_binary');

  if (!isOpen) return null;

  const handleExport = () => {
    const filenameBase = documentName.replace(/\s+/g, '_');

    // Get active or first body geometry
    const primaryGeometry = bodies.length > 0 ? bodies[0].geometry : null;

    if (!primaryGeometry && !format.startsWith('dxf')) {
      alert('No 3D solid bodies to export! Create an extrude or feature first.');
      return;
    }

    if (format === 'stl_binary') {
      const blob = exportEngine.exportSTL(primaryGeometry, true);
      exportEngine.downloadFile(blob, `${filenameBase}.stl`, 'application/sla');
    } else if (format === 'stl_ascii') {
      const blob = exportEngine.exportSTL(primaryGeometry, false);
      exportEngine.downloadFile(blob, `${filenameBase}_ascii.stl`, 'text/plain');
    } else if (format === 'obj') {
      const blob = exportEngine.exportOBJ(primaryGeometry, filenameBase);
      exportEngine.downloadFile(blob, `${filenameBase}.obj`, 'text/plain');
    } else if (format === 'step') {
      const blob = exportEngine.exportSTEP(primaryGeometry, filenameBase);
      exportEngine.downloadFile(blob, `${filenameBase}.stp`, 'application/step');
    } else if (format === 'dxf') {
      const entities = (activeSketchId && sketchEntities[activeSketchId]) || [];
      const blob = exportEngine.exportDXF(entities);
      exportEngine.downloadFile(blob, `${filenameBase}.dxf`, 'application/dxf');
    }

    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={16} color="#4fc3f7" />
            <span>Export CAD Model</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="dialog-body">
          <p style={{ color: '#aaa', fontSize: 12 }}>
            Choose an engineering export format for 3D printing, CNC machining, or downstream CAD software.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="format" checked={format === 'stl_binary'} onChange={() => setFormat('stl_binary')} />
              <span><strong>STL (Binary)</strong> — Recommended for 3D printing (.stl)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="format" checked={format === 'stl_ascii'} onChange={() => setFormat('stl_ascii')} />
              <span><strong>STL (ASCII)</strong> — Text-based STL format (.stl)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="format" checked={format === 'step'} onChange={() => setFormat('step')} />
              <span><strong>STEP AP203/AP214</strong> — Standard ISO 10303 Solid Exchange (.stp)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="format" checked={format === 'obj'} onChange={() => setFormat('obj')} />
              <span><strong>Wavefront OBJ</strong> — Mesh format for rendering & animation (.obj)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="format" checked={format === 'dxf'} onChange={() => setFormat('dxf')} />
              <span><strong>DXF (AutoCAD)</strong> — 2D Drawing Exchange for Laser cutting & Sketch (.dxf)</span>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleExport}>
            <Download size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Export File
          </button>
        </div>
      </div>
    </div>
  );
}
