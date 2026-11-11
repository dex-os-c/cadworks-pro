// CADWorks Pro - 2D Engineering Drawing Sheet Viewer & Vector Exporter Modal
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Download, Eye, Layers, Settings2, FileText, Check } from 'lucide-react';
import { drawingEngine, SHEET_SIZES } from './DrawingEngine.js';
import { useCADStore } from '../store/cadStore.js';

export default function DrawingViewModal({ isOpen, onClose }) {
  const bodies = useCADStore(s => s.bodies);
  const documentName = useCADStore(s => s.documentName || 'Part1');
  const activeMaterial = useCADStore(s => s.activeMaterial || 'Steel 1020');

  const [enableHLR, setEnableHLR] = useState(true);
  const [sheetSizeKey, setSheetSizeKey] = useState('A4_LANDSCAPE');
  const [showDimensions, setShowDimensions] = useState(true);
  const [showGDT, setShowGDT] = useState(true);
  const [downloadSuccess, setDownloadSuccess] = useState(null);

  const downloadTimerRef = useRef(null);
  const revokeTimerRef = useRef(null);

  // Clean up any pending timers on unmount to prevent React state leaks
  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
      if (revokeTimerRef.current) clearTimeout(revokeTimerRef.current);
    };
  }, []);

  // Keyboard accessibility: Escape closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Compute 2D drawing sheet data whenever geometry or options change
  const sheetData = useMemo(() => {
    if (!isOpen || bodies.length === 0 || !bodies[0]?.geometry) return null;

    try {
      const sheetSize = SHEET_SIZES[sheetSizeKey] || SHEET_SIZES.A4_LANDSCAPE;
      const data = drawingEngine.createStandardSheet(bodies[0].geometry, {
        sheetSize,
        enableHLR,
        title: documentName.toUpperCase(),
        partNumber: 'DWG-' + (documentName.slice(0, 4).toUpperCase() || 'PART'),
        material: activeMaterial,
      });
      return data;
    } catch (err) {
      console.error('Failed to generate drawing sheet:', err);
      return null;
    }
  }, [isOpen, bodies, documentName, activeMaterial, enableHLR, sheetSizeKey]);

  if (!isOpen) return null;

  const handleExportSVG = () => {
    if (!sheetData) return;
    try {
      const svgStr = drawingEngine.exportSVG({
        ...sheetData,
        dimensions: showDimensions ? sheetData.dimensions : [],
        gdtFrames: showGDT ? sheetData.gdtFrames : [],
      });
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentName.replace(/\s+/g, '_')}_drawing.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      revokeTimerRef.current = setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (_) {}
      }, 1000);

      setDownloadSuccess('SVG Exported');
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = setTimeout(() => {
        setDownloadSuccess(null);
      }, 2500);
    } catch (err) {
      console.error('Failed to export SVG drawing:', err);
    }
  };

  const handleExportDXF = () => {
    if (!sheetData) return;
    try {
      const dxfStr = drawingEngine.exportDXF({
        ...sheetData,
        dimensions: showDimensions ? sheetData.dimensions : [],
      });
      const blob = new Blob([dxfStr], { type: 'application/dxf;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentName.replace(/\s+/g, '_')}_drawing.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      revokeTimerRef.current = setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (_) {}
      }, 1000);

      setDownloadSuccess('DXF Exported');
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = setTimeout(() => {
        setDownloadSuccess(null);
      }, 2500);
    } catch (err) {
      console.error('Failed to export DXF drawing:', err);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.82)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Top Header Bar */}
      <div style={{
        height: 48,
        background: '#1e1e1e',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={18} color="#38bdf8" />
          <span style={{ fontWeight: 600, fontSize: 14 }}>2D Engineering Drawing Sheet</span>
          <span style={{ fontSize: 12, color: '#888' }}>— {documentName}</span>
        </div>

        {/* Toolbar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* HLR Toggle */}
          <button
            onClick={() => setEnableHLR(!enableHLR)}
            style={{
              background: enableHLR ? '#094771' : '#2d2d30',
              border: '1px solid #4fc3f7',
              color: '#fff',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
            title="Toggle Hidden Line Removal"
          >
            <Eye size={13} />
            <span>Hidden Lines (HLR): {enableHLR ? 'ON' : 'OFF'}</span>
          </button>

          {/* Dimensions Toggle */}
          <button
            onClick={() => setShowDimensions(!showDimensions)}
            style={{
              background: showDimensions ? '#094771' : '#2d2d30',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Dimensions: {showDimensions ? 'ON' : 'OFF'}
          </button>

          {/* GD&T Toggle */}
          <button
            onClick={() => setShowGDT(!showGDT)}
            style={{
              background: showGDT ? '#094771' : '#2d2d30',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            GD&T: {showGDT ? 'ON' : 'OFF'}
          </button>

          {/* Sheet Size Selector */}
          <select
            value={sheetSizeKey}
            onChange={(e) => setSheetSizeKey(e.target.value)}
            style={{
              background: '#2d2d30',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <option value="A4_LANDSCAPE">A4 Landscape (297 x 210 mm)</option>
            <option value="A3_LANDSCAPE">A3 Landscape (420 x 297 mm)</option>
            <option value="ANSI_B">ANSI B (17 x 11 in)</option>
          </select>

          {/* Export SVG */}
          <button
            onClick={handleExportSVG}
            style={{
              background: '#0284c7',
              border: 'none',
              color: '#fff',
              borderRadius: 4,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Download size={13} />
            <span>Export SVG</span>
          </button>

          {/* Export DXF */}
          <button
            onClick={handleExportDXF}
            style={{
              background: '#059669',
              border: 'none',
              color: '#fff',
              borderRadius: 4,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Download size={13} />
            <span>Export DXF</span>
          </button>

          {downloadSuccess && (
            <span style={{ fontSize: 11, color: '#4caf50', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Check size={13} /> {downloadSuccess}
            </span>
          )}

          {/* Close Modal */}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#aaa',
              cursor: 'pointer',
              padding: 4,
              marginLeft: 8,
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Drawing Sheet Canvas */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#2b2b2b',
      }}>
        {sheetData ? (
          <div
            style={{
              background: '#ffffff',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              borderRadius: 2,
              padding: 0,
              maxWidth: '92vw',
              maxHeight: '82vh',
              overflow: 'hidden',
              display: 'flex',
            }}
            dangerouslySetInnerHTML={{
              __html: drawingEngine.exportSVG({
                ...sheetData,
                dimensions: showDimensions ? sheetData.dimensions : [],
                gdtFrames: showGDT ? sheetData.gdtFrames : [],
              }),
            }}
          />
        ) : (
          <div style={{ color: '#aaa', fontSize: 14 }}>
            No 3D solid body found. Create a solid body first to generate drawings.
          </div>
        )}
      </div>
    </div>
  );
}
