// CADWorks Pro - PropertyManager Side Panel (Elevated Modern Design)
import React, { useState, useEffect } from 'react';
import { Check, X, Layers, ArrowUpDown, Shield, Sliders, ChevronRight } from 'lucide-react';
import { useCADStore } from '../../store/cadStore';
import { FEATURE_TYPES, TOOLS } from '../../utils/constants';
import NumericInput from '../common/NumericInput';

export default function PropertyPanel() {
  const propertyPanelOpen = useCADStore(s => s.propertyPanelOpen);
  const propertyPanelContent = useCADStore(s => s.propertyPanelContent);
  const closePropertyPanel = useCADStore(s => s.closePropertyPanel);
  const addFeature = useCADStore(s => s.addFeature);
  const updateFeature = useCADStore(s => s.updateFeature);
  const cancelTool = useCADStore(s => s.cancelTool);
  const features = useCADStore(s => s.features);

  // Form State
  const [depth, setDepth] = useState(25);
  const [angle, setAngle] = useState(360);
  const [radius, setRadius] = useState(5);
  const [thickness, setThickness] = useState(2);
  const [diameter, setDiameter] = useState(10);
  const [direction, setDirection] = useState('blind');
  const [flipDir, setFlipDir] = useState(false);
  const [selectedSketchId, setSelectedSketchId] = useState('');

  // Available sketches for feature references
  const sketchFeatures = features.filter(f => f.type === FEATURE_TYPES.SKETCH);

  useEffect(() => {
    if (sketchFeatures.length > 0 && !selectedSketchId) {
      setSelectedSketchId(sketchFeatures[sketchFeatures.length - 1].sketchId);
    }
  }, [sketchFeatures, selectedSketchId]);

  useEffect(() => {
    if (propertyPanelContent) {
      if (propertyPanelContent.depth) setDepth(propertyPanelContent.depth);
      if (propertyPanelContent.angle) setAngle(propertyPanelContent.angle);
      if (propertyPanelContent.radius) setRadius(propertyPanelContent.radius);
      if (propertyPanelContent.thickness) setThickness(propertyPanelContent.thickness);
      if (propertyPanelContent.diameter) setDiameter(propertyPanelContent.diameter);
      if (propertyPanelContent.sketchId) setSelectedSketchId(propertyPanelContent.sketchId);
      if (propertyPanelContent.direction) setDirection(propertyPanelContent.direction);
      if (propertyPanelContent.flip !== undefined) setFlipDir(propertyPanelContent.flip);
    }
  }, [propertyPanelContent]);

  if (!propertyPanelOpen || !propertyPanelContent) return null;

  const featureType = propertyPanelContent.type;

  const handleApply = () => {
    const isEdit = propertyPanelContent.isEditing;
    const featId = propertyPanelContent.id;

    const featData = {
      type: featureType,
      name: propertyPanelContent.name || `${featureType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
      sketchId: selectedSketchId,
      depth,
      angle,
      radius,
      thickness,
      diameter,
      direction,
      flip: flipDir,
    };

    if (isEdit && featId) {
      updateFeature(featId, featData);
    } else {
      addFeature(featData);
    }

    closePropertyPanel();
    cancelTool();
  };

  const handleCancel = () => {
    closePropertyPanel();
    cancelTool();
  };

  return (
    <aside className="property-panel">
      {/* Header with SolidWorks style Check and Cancel icons */}
      <div className="property-actions-header">
        <button className="action-btn-green" onClick={handleApply} title="Apply & Close (Enter)">
          <Check size={16} strokeWidth={2.5} /> <span>OK</span>
        </button>
        <div className="property-header-title">
          <span>PropertyManager</span>
        </div>
        <button className="action-btn-red" onClick={handleCancel} title="Cancel (Esc)">
          <X size={16} strokeWidth={2.5} /> <span>Cancel</span>
        </button>
      </div>

      <div className="property-feature-banner">
        <div className="property-feature-name">
          {featureType.replace('_', ' ').toUpperCase()}
        </div>
      </div>

      <div className="panel-content property-scroll-area">
        {/* Sketch reference picker */}
        {(featureType === FEATURE_TYPES.EXTRUDE_BOSS ||
          featureType === FEATURE_TYPES.EXTRUDE_CUT ||
          featureType === FEATURE_TYPES.REVOLVE_BOSS) && (
          <div className="property-card">
            <div className="property-card-header">Profile & Sketch</div>
            <div className="property-card-body">
              <label className="property-label">Selected Sketch Profile</label>
              <select
                className="property-select"
                value={selectedSketchId}
                onChange={(e) => setSelectedSketchId(e.target.value)}
              >
                {sketchFeatures.map(sf => (
                  <option key={sf.sketchId} value={sf.sketchId}>
                    {sf.name} ({sf.plane} Plane)
                  </option>
                ))}
                {sketchFeatures.length === 0 && (
                  <option value="">No Sketches Created Yet</option>
                )}
              </select>
            </div>
          </div>
        )}

        {/* Extrude parameters */}
        {(featureType === FEATURE_TYPES.EXTRUDE_BOSS || featureType === FEATURE_TYPES.EXTRUDE_CUT) && (
          <div className="property-card">
            <div className="property-card-header">Direction 1</div>
            <div className="property-card-body">
              {/* Segmented condition control */}
              <div className="segmented-control">
                <button
                  className={`segment-btn ${direction === 'blind' ? 'active' : ''}`}
                  onClick={() => setDirection('blind')}
                >
                  Blind
                </button>
                <button
                  className={`segment-btn ${direction === 'midplane' ? 'active' : ''}`}
                  onClick={() => setDirection('midplane')}
                >
                  Mid Plane
                </button>
                <button
                  className={`segment-btn ${direction === 'throughall' ? 'active' : ''}`}
                  onClick={() => setDirection('throughall')}
                >
                  Through All
                </button>
              </div>

              {direction !== 'throughall' && (
                <div className="property-row">
                  <span className="property-label">Extrude Depth (D1):</span>
                  <NumericInput value={depth} onChange={setDepth} min={0.5} max={5000} step={5} unit="mm" />
                </div>
              )}

              <div className="property-row switch-row">
                <span className="property-label">Reverse Extrude Direction</span>
                <label className="custom-switch">
                  <input type="checkbox" checked={flipDir} onChange={(e) => setFlipDir(e.target.checked)} />
                  <span className="slider round" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Revolve parameters */}
        {(featureType === FEATURE_TYPES.REVOLVE_BOSS || featureType === FEATURE_TYPES.REVOLVE_CUT) && (
          <div className="property-card">
            <div className="property-card-header">Revolution Parameters</div>
            <div className="property-card-body">
              <div className="property-row">
                <span className="property-label">Angle:</span>
                <NumericInput value={angle} onChange={setAngle} min={1} max={360} step={15} unit="°" />
              </div>
            </div>
          </div>
        )}

        {/* Fillet parameters */}
        {featureType === FEATURE_TYPES.FILLET && (
          <div className="property-card">
            <div className="property-card-header">Fillet Parameters</div>
            <div className="property-card-body">
              <div className="property-row">
                <span className="property-label">Radius (R):</span>
                <NumericInput value={radius} onChange={setRadius} min={0.5} max={100} step={1} unit="mm" />
              </div>
            </div>
          </div>
        )}

        {/* Chamfer parameters */}
        {featureType === FEATURE_TYPES.CHAMFER && (
          <div className="property-card">
            <div className="property-card-header">Chamfer Parameters</div>
            <div className="property-card-body">
              <div className="property-row">
                <span className="property-label">Distance (D):</span>
                <NumericInput value={radius} onChange={setRadius} min={0.5} max={100} step={1} unit="mm" />
              </div>
            </div>
          </div>
        )}

        {/* Shell parameters */}
        {featureType === FEATURE_TYPES.SHELL && (
          <div className="property-card">
            <div className="property-card-header">Shell Parameters</div>
            <div className="property-card-body">
              <div className="property-row">
                <span className="property-label">Wall Thickness (T):</span>
                <NumericInput value={thickness} onChange={setThickness} min={0.5} max={50} step={0.5} unit="mm" />
              </div>
            </div>
          </div>
        )}

        {/* Hole Wizard parameters */}
        {featureType === FEATURE_TYPES.HOLE && (
          <div className="property-card">
            <div className="property-card-header">Hole Specification</div>
            <div className="property-card-body">
              <div className="property-row">
                <span className="property-label">Diameter (Ø):</span>
                <NumericInput value={diameter} onChange={setDiameter} min={1} max={200} step={1} unit="mm" />
              </div>
              <div className="property-row">
                <span className="property-label">Hole Depth:</span>
                <NumericInput value={depth} onChange={setDepth} min={1} max={500} step={5} unit="mm" />
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
