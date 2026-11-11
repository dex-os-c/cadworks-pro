// CADWorks Pro - FeatureManager Design Tree (Iconic SolidWorks Layout with Real Rollback & Dependency Graph)
import React, { useState } from 'react';
import {
  Folder, Box, PenTool, Eye, EyeOff, Trash2,
  ChevronRight, ChevronDown, Check, Sliders, Globe,
  Shield, Layers, CircleDot, X, Search, Sparkles,
  Ban, AlertTriangle, ArrowDownToLine, RotateCcw, ChevronUp
} from 'lucide-react';
import { useCADStore } from '../../store/cadStore';
import { FEATURE_TYPES } from '../../utils/constants';

export default function FeatureTree({ onMaterialClick, isOpen, onClose }) {
  const documentName = useCADStore(s => s.documentName);
  const activeMaterial = useCADStore(s => s.activeMaterial);
  const features = useCADStore(s => s.features);
  const activeFeatureIndex = useCADStore(s => s.activeFeatureIndex);
  const rollbackIndex = useCADStore(s => s.rollbackIndex);
  const rebuildErrors = useCADStore(s => s.rebuildErrors);
  const setActiveFeature = useCADStore(s => s.setActiveFeature);
  const setRollbackIndex = useCADStore(s => s.setRollbackIndex);
  const toggleFeatureVisibility = useCADStore(s => s.toggleFeatureVisibility);
  const toggleFeatureSuppressed = useCADStore(s => s.toggleFeatureSuppressed);
  const removeFeature = useCADStore(s => s.removeFeature);
  const editSketch = useCADStore(s => s.editSketch);
  const openPropertyPanel = useCADStore(s => s.openPropertyPanel);

  const [originExpanded, setOriginExpanded] = useState(true);
  const [filterText, setFilterText] = useState('');

  const getFeatureBadge = (type) => {
    switch (type) {
      case FEATURE_TYPES.SKETCH:
        return { label: 'SK', color: '#ffb74d', icon: <PenTool size={13} color="#ffb74d" /> };
      case FEATURE_TYPES.EXTRUDE_BOSS:
        return { label: 'EXT', color: '#38bdf8', icon: <Box size={13} color="#38bdf8" /> };
      case FEATURE_TYPES.EXTRUDE_CUT:
        return { label: 'CUT', color: '#fb923c', icon: <Box size={13} color="#fb923c" /> };
      case FEATURE_TYPES.REVOLVE_BOSS:
        return { label: 'REV', color: '#38bdf8', icon: <Box size={13} color="#38bdf8" /> };
      case FEATURE_TYPES.FILLET:
        return { label: 'FIL', color: '#2dd4bf', icon: <CircleDot size={13} color="#2dd4bf" /> };
      case FEATURE_TYPES.CHAMFER:
        return { label: 'CHM', color: '#fde047', icon: <Shield size={13} color="#fde047" /> };
      case FEATURE_TYPES.SHELL:
        return { label: 'SHL', color: '#fbbf24', icon: <Layers size={13} color="#fbbf24" /> };
      default:
        return { label: 'FEAT', color: '#93c5fd', icon: <Box size={13} color="#93c5fd" /> };
    }
  };

  const handleDoubleClick = (feat, index) => {
    setActiveFeature(index);
    if (feat.type === FEATURE_TYPES.SKETCH) {
      editSketch(feat.id);
    } else {
      openPropertyPanel({ ...feat, isEditing: true });
    }
  };

  const isRolledBack = (index) => {
    return rollbackIndex >= 0 && index > rollbackIndex;
  };

  const effectiveRollback = rollbackIndex === -1 ? features.length - 1 : rollbackIndex;

  const handleRollUp = () => {
    const nextIdx = effectiveRollback - 1;
    setRollbackIndex(nextIdx < 0 ? 0 : nextIdx);
  };

  const handleRollDown = () => {
    if (rollbackIndex === -1 || effectiveRollback >= features.length - 1) {
      return;
    }
    const nextIdx = effectiveRollback + 1;
    if (nextIdx >= features.length - 1) {
      setRollbackIndex(-1);
    } else {
      setRollbackIndex(nextIdx);
    }
  };

  const filteredFeatures = features.filter(f =>
    !filterText || (f.name || f.type).toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <aside className={`feature-tree-panel ${isOpen ? 'open' : ''}`}>
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Layers size={14} color="#38bdf8" />
          <span>FeatureManager</span>
        </div>
        {onClose && (
          <button className="icon-btn mobile-close-btn" onClick={onClose} title="Close tree">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Quick Search Filter */}
      <div className="tree-search-bar">
        <Search size={12} color="#888" />
        <input
          type="text"
          placeholder="Filter tree items..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        {filterText && (
          <button className="tree-clear-btn" onClick={() => setFilterText('')}>✕</button>
        )}
      </div>

      <div className="panel-content tree-scroll-area">
        {/* Document root */}
        <div className="tree-node-item doc-root-node">
          <div className="tree-icon-badge" style={{ background: 'rgba(56, 189, 248, 0.15)' }}>
            <Box size={13} color="#38bdf8" />
          </div>
          <span className="tree-node-label" style={{ fontWeight: 600 }}>{documentName}</span>
        </div>

        {/* Material Node */}
        <div className="tree-node-item" onClick={onMaterialClick} title="Click to assign material">
          <div className="tree-icon-badge" style={{ background: 'rgba(192, 132, 252, 0.15)' }}>
            <Sliders size={13} color="#c084fc" />
          </div>
          <span className="tree-node-label">Material &lt;<strong style={{ color: '#c084fc' }}>{activeMaterial}</strong>&gt;</span>
        </div>

        {/* Origin / Reference planes Folder */}
        <div className="tree-node-item folder-node" onClick={() => setOriginExpanded(!originExpanded)}>
          {originExpanded ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
          <div className="tree-icon-badge" style={{ background: 'rgba(251, 191, 36, 0.15)' }}>
            <Folder size={13} color="#fbbf24" />
          </div>
          <span className="tree-node-label">Reference Geometry</span>
        </div>

        {originExpanded && (
          <div className="tree-nested-group">
            <div className="tree-node-item plane-node">
              <Globe size={12} color="#38bdf8" />
              <span className="tree-node-label">Front Plane (XY)</span>
            </div>
            <div className="tree-node-item plane-node">
              <Globe size={12} color="#4ade80" />
              <span className="tree-node-label">Top Plane (XZ)</span>
            </div>
            <div className="tree-node-item plane-node">
              <Globe size={12} color="#c084fc" />
              <span className="tree-node-label">Right Plane (YZ)</span>
            </div>
            <div className="tree-node-item origin-node">
              <CircleDot size={12} color="#f87171" />
              <span className="tree-node-label">Origin (0,0,0)</span>
            </div>
          </div>
        )}

        <div className="tree-divider" />

        {/* Dynamic Feature List */}
        {filteredFeatures.map((feat, index) => {
          const badge = getFeatureBadge(feat.type);
          const isSelected = activeFeatureIndex === index;
          const rolledBack = isRolledBack(index);
          const err = rebuildErrors?.find(e => e.featureId === feat.id);

          return (
            <React.Fragment key={feat.id}>
              <div
                className={`tree-node-item feature-item ${isSelected ? 'selected' : ''} ${rolledBack ? 'rolled-back' : ''}`}
                onClick={() => setActiveFeature(index)}
                onDoubleClick={() => handleDoubleClick(feat, index)}
                style={{
                  opacity: rolledBack ? 0.35 : (feat.suppressed ? 0.5 : 1),
                  background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  borderLeft: isSelected ? '3px solid #38bdf8' : '3px solid transparent',
                  cursor: 'pointer',
                }}
                title={rolledBack ? 'Feature is rolled back (inactive)' : (feat.suppressed ? 'Feature is suppressed' : 'Double-click to edit')}
              >
                <div className="tree-icon-badge" style={{ background: `${badge.color}20` }}>
                  {badge.icon}
                </div>
                <span
                  className="tree-node-label"
                  style={{
                    textDecoration: feat.suppressed ? 'line-through' : 'none',
                    color: rolledBack ? '#71717a' : (feat.suppressed ? '#94a3b8' : '#f1f5f9'),
                    fontStyle: rolledBack ? 'italic' : 'normal',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {feat.name || feat.type}
                  {feat.suppressed && <span style={{ fontSize: 9, color: '#f87171', padding: '1px 4px', background: 'rgba(248,113,113,0.1)', borderRadius: 3 }}>[Suppressed]</span>}
                  {rolledBack && <span style={{ fontSize: 9, color: '#a1a1aa', padding: '1px 4px', background: 'rgba(161,161,170,0.1)', borderRadius: 3 }}>[Rolled Back]</span>}
                </span>

                {/* Error warning badge if rebuild failed */}
                {err && (
                  <span title={`Rebuild Error: ${err.error}`} style={{ color: '#ef4444', marginRight: 4 }}>
                    <AlertTriangle size={13} />
                  </span>
                )}

                <div className="tree-node-actions">
                  {/* Roll to Here */}
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRollbackIndex(index === features.length - 1 ? -1 : index);
                    }}
                    title="Roll to Here"
                  >
                    <ArrowDownToLine size={12} color="#fbbf24" />
                  </button>

                  {/* Suppress / Unsuppress */}
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFeatureSuppressed(feat.id);
                    }}
                    title={feat.suppressed ? 'Unsuppress Feature' : 'Suppress Feature'}
                  >
                    <Ban size={12} color={feat.suppressed ? '#4ade80' : '#f87171'} />
                  </button>

                  {/* Visibility */}
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFeatureVisibility(feat.id);
                    }}
                    title={feat.visible ? 'Hide Feature' : 'Show Feature'}
                  >
                    {feat.visible ? <Eye size={12} color="#94a3b8" /> : <EyeOff size={12} color="#64748b" />}
                  </button>

                  {/* Delete */}
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFeature(feat.id);
                    }}
                    title="Delete Feature"
                  >
                    <Trash2 size={12} color="#f87171" />
                  </button>
                </div>
              </div>

              {/* Dynamic Rollback Bar sitting between active and rolled-back features */}
              {rollbackIndex >= 0 && index === rollbackIndex && (
                <div className="tree-rollback-bar active" style={{ margin: '4px 0', padding: '4px 8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', letterSpacing: '0.5px' }}>ROLLBACK BAR</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>({rollbackIndex + 1}/{features.length})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <button
                        className="icon-btn"
                        onClick={handleRollUp}
                        title="Roll Up (Previous Feature)"
                        style={{ padding: 2 }}
                      >
                        <ChevronUp size={12} color="#fbbf24" />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={handleRollDown}
                        title="Roll Down (Next Feature)"
                        style={{ padding: 2 }}
                      >
                        <ChevronDown size={12} color="#fbbf24" />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => setRollbackIndex(-1)}
                        title="Roll to End of Tree"
                        style={{ padding: '2px 4px', fontSize: 9, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 2 }}
                      >
                        <RotateCcw size={10} /> Roll to End
                      </button>
                    </div>
                  </div>
                  <div className="rollback-line" style={{ height: 3, background: 'linear-gradient(90deg, #3b82f6, #fbbf24)' }} />
                  <div className="rollback-handle" />
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Rollback Bar at very end when not rolled back */}
        {(rollbackIndex === -1 || rollbackIndex >= features.length - 1) && features.length > 0 && (
          <div
            className="tree-rollback-bar end"
            title="Rollback Bar: Click or use buttons on features to roll back history"
            style={{ marginTop: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>ROLLBACK BAR (End of Tree)</span>
              <button
                className="icon-btn"
                onClick={handleRollUp}
                title="Roll Up"
                style={{ padding: 2 }}
              >
                <ChevronUp size={12} color="#fbbf24" />
              </button>
            </div>
            <div className="rollback-line" />
            <div className="rollback-handle" />
          </div>
        )}
      </div>
    </aside>
  );
}
