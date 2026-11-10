// CADWorks Pro - FeatureManager Design Tree (Iconic SolidWorks Layout)
import React, { useState } from 'react';
import {
  Folder, Box, PenTool, Eye, EyeOff, Trash2,
  ChevronRight, ChevronDown, Check, Sliders, Globe,
  Shield, Layers, CircleDot, X, Search, Sparkles, MoreVertical
} from 'lucide-react';
import { useCADStore } from '../../store/cadStore';
import { FEATURE_TYPES } from '../../utils/constants';

export default function FeatureTree({ onMaterialClick, isOpen, onClose }) {
  const documentName = useCADStore(s => s.documentName);
  const activeMaterial = useCADStore(s => s.activeMaterial);
  const features = useCADStore(s => s.features);
  const activeFeatureIndex = useCADStore(s => s.activeFeatureIndex);
  const setActiveFeature = useCADStore(s => s.setActiveFeature);
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

          return (
            <div
              key={feat.id}
              className={`tree-node-item feature-item ${isSelected ? 'selected' : ''}`}
              onClick={() => setActiveFeature(index)}
              onDoubleClick={() => handleDoubleClick(feat, index)}
              style={{ opacity: feat.suppressed ? 0.45 : 1 }}
              title="Double-click to edit feature parameters"
            >
              <div className="tree-icon-badge" style={{ background: `${badge.color}20` }}>
                {badge.icon}
              </div>
              <span className="tree-node-label">{feat.name || feat.type}</span>

              <div className="tree-node-actions">
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFeatureVisibility(feat.id);
                  }}
                  title={feat.visible ? 'Hide Feature' : 'Show Feature'}
                >
                  {feat.visible ? <Eye size={13} color="#94a3b8" /> : <EyeOff size={13} color="#64748b" />}
                </button>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFeature(feat.id);
                  }}
                  title="Delete Feature"
                >
                  <Trash2 size={13} color="#f87171" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Iconic SolidWorks Rollback Bar */}
        <div className="tree-rollback-bar" title="Rollback Bar: Drag to roll back features in history">
          <div className="rollback-line" />
          <div className="rollback-handle" />
        </div>
      </div>
    </aside>
  );
}
