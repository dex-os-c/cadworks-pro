// CADWorks Pro - PropertyManager Side Panel (Elevated Modern Design)
import React, { useState, useEffect, useMemo } from 'react';
import {
  Check, X, Layers, ArrowUpDown, Shield, Sliders, ChevronRight,
  Maximize2, Play, CircleDot, Crosshair, ArrowRight, CornerDownRight,
  Sparkles, Cpu, Move, Grid
} from 'lucide-react';
import { useCADStore } from '../../store/cadStore';
import { FEATURE_TYPES, TOOLS, MATE_TYPES, MATERIALS } from '../../utils/constants';
import NumericInput from '../common/NumericInput';
import { debounce } from '../../utils/debounce';

export default function PropertyPanel() {
  const propertyPanelOpen = useCADStore(s => s.propertyPanelOpen);
  const propertyPanelContent = useCADStore(s => s.propertyPanelContent);
  const closePropertyPanel = useCADStore(s => s.closePropertyPanel);
  const addFeature = useCADStore(s => s.addFeature);
  const updateFeature = useCADStore(s => s.updateFeature);
  const cancelTool = useCADStore(s => s.cancelTool);
  const features = useCADStore(s => s.features);
  const assemblyComponents = useCADStore(s => s.assemblyComponents);
  const addAssemblyMate = useCADStore(s => s.addAssemblyMate);
  const solveAssembly = useCADStore(s => s.solveAssembly);
  const activeMaterial = useCADStore(s => s.activeMaterial);

  // Form State
  const [depth, setDepth] = useState(25);
  const [angle, setAngle] = useState(360);
  const [radius, setRadius] = useState(5);
  const [thickness, setThickness] = useState(2);
  const [diameter, setDiameter] = useState(10);
  const [direction, setDirection] = useState('blind');
  const [flipDir, setFlipDir] = useState(false);
  const [thin, setThin] = useState(false);
  const [wallThickness, setWallThickness] = useState(2);
  const [selectedSketchId, setSelectedSketchId] = useState('');

  // Assembly Mate State
  const [mateType, setMateType] = useState('coincident');
  const [comp1Id, setComp1Id] = useState('');
  const [comp2Id, setComp2Id] = useState('');
  const [ref1, setRef1] = useState('top');
  const [ref2, setRef2] = useState('bottom');
  const [mateOffset, setMateOffset] = useState(0);

  // Exploded View State
  const [explodeDist, setExplodeDist] = useState(40);

  // Drawing View State
  const [drawingViewType, setDrawingViewType] = useState('standard_3_view');
  const [drawingScale, setDrawingScale] = useState('1:1');
  const [drawingProjection, setDrawingProjection] = useState('third_angle');
  const [drawingDisplayStyle, setDrawingDisplayStyle] = useState('hlr');

  // Drawing Dimension State
  const [dimType, setDimType] = useState('linear');
  const [dimTolerance, setDimTolerance] = useState('bilateral');
  const [dimUpperTol, setDimUpperTol] = useState(0.05);
  const [dimLowerTol, setDimLowerTol] = useState(-0.05);
  const [dimPrefix, setDimPrefix] = useState('');
  const [dimSuffix, setDimSuffix] = useState('');

  // GD&T State
  const [gdtSymbol, setGdtSymbol] = useState('flatness');
  const [gdtTol, setGdtTol] = useState(0.02);
  const [gdtModifier, setGdtModifier] = useState('MMC');
  const [gdtDatumA, setGdtDatumA] = useState('A');
  const [gdtDatumB, setGdtDatumB] = useState('B');
  const [gdtDatumC, setGdtDatumC] = useState('');

  // Solid 3D FEA Simulation Setup State
  const [feaStudyName, setFeaStudyName] = useState('Linear Static Study 1');
  const [feaElementType, setFeaElementType] = useState('Tet10');
  const [feaMeshSize, setFeaMeshSize] = useState(10);
  const [feaFixtureType, setFeaFixtureType] = useState('fixed');
  const [feaLoadValue, setFeaLoadValue] = useState(1000);
  const [feaPressureValue, setFeaPressureValue] = useState(5);

  // Debounced slider handler to keep UI fluid
  const debouncedSetExplodeDist = useMemo(
    () => debounce((val) => setExplodeDist(val), 60),
    []
  );

  const debouncedSetMeshSize = useMemo(
    () => debounce((val) => setFeaMeshSize(val), 60),
    []
  );

  // Available sketches for feature references
  const sketchFeatures = features.filter(f => f.type === FEATURE_TYPES.SKETCH);

  useEffect(() => {
    if (sketchFeatures.length > 0 && !selectedSketchId) {
      setSelectedSketchId(sketchFeatures[sketchFeatures.length - 1].sketchId);
    }
  }, [sketchFeatures, selectedSketchId]);

  useEffect(() => {
    if (assemblyComponents.length >= 2) {
      if (!comp1Id) setComp1Id(assemblyComponents[0].id);
      if (!comp2Id) setComp2Id(assemblyComponents[1].id);
    }
  }, [assemblyComponents, comp1Id, comp2Id]);

  useEffect(() => {
    if (propertyPanelContent) {
      if (propertyPanelContent.depth !== undefined) setDepth(propertyPanelContent.depth);
      if (propertyPanelContent.angle !== undefined) setAngle(propertyPanelContent.angle);
      if (propertyPanelContent.radius !== undefined) setRadius(propertyPanelContent.radius);
      if (propertyPanelContent.thickness !== undefined) setThickness(propertyPanelContent.thickness);
      if (propertyPanelContent.diameter !== undefined) setDiameter(propertyPanelContent.diameter);
      if (propertyPanelContent.sketchId) setSelectedSketchId(propertyPanelContent.sketchId);
      if (propertyPanelContent.direction) setDirection(propertyPanelContent.direction);
      if (propertyPanelContent.flip !== undefined) setFlipDir(propertyPanelContent.flip);
      if (propertyPanelContent.thin !== undefined) setThin(propertyPanelContent.thin);
      if (propertyPanelContent.wallThickness !== undefined) setWallThickness(propertyPanelContent.wallThickness);
      if (propertyPanelContent.viewType) setDrawingViewType(propertyPanelContent.viewType);
      if (propertyPanelContent.dimType) setDimType(propertyPanelContent.dimType);
      if (propertyPanelContent.gdtType) setGdtSymbol(propertyPanelContent.gdtType === 'datum' ? 'datum' : 'flatness');
    }
  }, [propertyPanelContent]);

  if (!propertyPanelOpen || !propertyPanelContent) return null;

  const featureType = propertyPanelContent.type;

  const handleApply = () => {
    const isEdit = propertyPanelContent.isEditing;
    const featId = propertyPanelContent.id;

    if (featureType === 'mate' || featureType === 'assembly_mate') {
      if (comp1Id && comp2Id) {
        addAssemblyMate(mateType, comp1Id, ref1, comp2Id, ref2, mateOffset);
      }
    } else if (featureType === 'exploded_view') {
      solveAssembly();
    } else if (featureType === 'fea_setup' || featureType === 'simulation') {
      // FEA setup committed
    } else if (featureType.startsWith('drawing_')) {
      // Drawing annotation / view committed
    } else {
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
        thin,
        wallThickness,
      };

      if (isEdit && featId) {
        updateFeature(featId, featData);
      } else {
        addFeature(featData);
      }
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
          {featureType.replace(/_/g, ' ').toUpperCase()}
        </div>
      </div>

      <div className="panel-content property-scroll-area">
        {/* ==================== ASSEMBLY MATE CARD ==================== */}
        {(featureType === 'mate' || featureType === 'assembly_mate') && (
          <div className="property-card">
            <div className="property-card-header">Assembly Mate Configuration</div>
            <div className="property-card-body">
              <label className="property-label">Mate Type</label>
              <select className="property-select" value={mateType} onChange={(e) => setMateType(e.target.value)}>
                <option value="coincident">Coincident (Contact Align)</option>
                <option value="distance">Distance Offset</option>
                <option value="concentric">Concentric (Axis Align)</option>
                <option value="parallel">Parallel (Normals Match)</option>
                <option value="perpendicular">Perpendicular (90° Normals)</option>
                <option value="tangent">Tangent (Cylinder to Plane)</option>
                <option value="width">Width (Centering Tab in Slot)</option>
                <option value="path">Path (Guide Curve Polyline)</option>
              </select>

              <label className="property-label" style={{ marginTop: 8 }}>Component 1</label>
              <select className="property-select" value={comp1Id} onChange={(e) => setComp1Id(e.target.value)}>
                {assemblyComponents.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.isFixed ? '(Fixed)' : ''}</option>
                ))}
              </select>

              <label className="property-label" style={{ marginTop: 8 }}>Reference 1</label>
              <select className="property-select" value={ref1} onChange={(e) => setRef1(e.target.value)}>
                <option value="top">Top Face</option>
                <option value="bottom">Bottom Face</option>
                <option value="front">Front Face</option>
                <option value="back">Back Face</option>
                <option value="right">Right Face</option>
                <option value="left">Left Face</option>
                <option value="z">Z Axis (Cylinder)</option>
                <option value="tab">Tab Reference</option>
              </select>

              <label className="property-label" style={{ marginTop: 8 }}>Component 2</label>
              <select className="property-select" value={comp2Id} onChange={(e) => setComp2Id(e.target.value)}>
                {assemblyComponents.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.isFixed ? '(Fixed)' : ''}</option>
                ))}
              </select>

              <label className="property-label" style={{ marginTop: 8 }}>Reference 2</label>
              <select className="property-select" value={ref2} onChange={(e) => setRef2(e.target.value)}>
                <option value="bottom">Bottom Face</option>
                <option value="top">Top Face</option>
                <option value="front">Front Face</option>
                <option value="back">Back Face</option>
                <option value="right">Right Face</option>
                <option value="left">Left Face</option>
                <option value="z">Z Axis (Cylinder)</option>
                <option value="boundary">Boundary Face</option>
              </select>

              {(mateType === 'distance' || mateType === 'width') && (
                <div className="property-row" style={{ marginTop: 8 }}>
                  <span className="property-label">Offset / Gap:</span>
                  <NumericInput value={mateOffset} onChange={setMateOffset} min={-500} max={500} step={1} unit="mm" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== EXPLODED VIEW CARD ==================== */}
        {featureType === 'exploded_view' && (
          <div className="property-card">
            <div className="property-card-header">Exploded View Properties</div>
            <div className="property-card-body">
              <div className="property-row">
                <span className="property-label">Explode Distance:</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8' }}>{explodeDist} mm</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                step="2"
                value={explodeDist}
                onChange={(e) => debouncedSetExplodeDist(parseFloat(e.target.value))}
                style={{ width: '100%', margin: '8px 0', accentColor: '#38bdf8' }}
              />
              <div className="property-row">
                <span className="property-label">Leader Lines:</span>
                <span style={{ fontSize: 11, color: '#4ade80' }}>Enabled (3D Dash)</span>
              </div>
            </div>
          </div>
        )}

        {/* ==================== DRAWING VIEW CARD ==================== */}
        {featureType === 'drawing_view' && (
          <div className="property-card">
            <div className="property-card-header">2D Drawing View Setup</div>
            <div className="property-card-body">
              <label className="property-label">View Orientation</label>
              <select className="property-select" value={drawingViewType} onChange={(e) => setDrawingViewType(e.target.value)}>
                <option value="standard_3_view">Standard 3-View (Front, Top, Right)</option>
                <option value="projected">Projected Orthographic View</option>
                <option value="section">Full Section Cut View</option>
                <option value="isometric">Isometric 30° Projected View</option>
                <option value="detail">Detail Circular Zoom View</option>
              </select>

              <label className="property-label" style={{ marginTop: 8 }}>Sheet Scale</label>
              <select className="property-select" value={drawingScale} onChange={(e) => setDrawingScale(e.target.value)}>
                <option value="1:1">1:1 (Full Size)</option>
                <option value="1:2">1:2 (Half Scale)</option>
                <option value="2:1">2:1 (Double Scale)</option>
                <option value="1:5">1:5</option>
                <option value="1:10">1:10</option>
              </select>

              <label className="property-label" style={{ marginTop: 8 }}>Projection Standard</label>
              <div className="segmented-control">
                <button
                  className={`segment-btn ${drawingProjection === 'third_angle' ? 'active' : ''}`}
                  onClick={() => setDrawingProjection('third_angle')}
                >
                  Third Angle (USA/ISO)
                </button>
                <button
                  className={`segment-btn ${drawingProjection === 'first_angle' ? 'active' : ''}`}
                  onClick={() => setDrawingProjection('first_angle')}
                >
                  First Angle (Europe)
                </button>
              </div>

              <label className="property-label" style={{ marginTop: 8 }}>Display Style</label>
              <select className="property-select" value={drawingDisplayStyle} onChange={(e) => setDrawingDisplayStyle(e.target.value)}>
                <option value="hlr">Hidden Lines Removed (Solid Contours Only)</option>
                <option value="hlv">Hidden Lines Visible (Dashed Line Font)</option>
                <option value="shaded">Shaded with Tangent Edges</option>
              </select>
            </div>
          </div>
        )}

        {/* ==================== DRAWING DIMENSION CARD ==================== */}
        {featureType === 'drawing_dimension' && (
          <div className="property-card">
            <div className="property-card-header">Drawing Dimension & Tolerances</div>
            <div className="property-card-body">
              <label className="property-label">Dimension Type</label>
              <select className="property-select" value={dimType} onChange={(e) => setDimType(e.target.value)}>
                <option value="linear">Linear Horizontal / Vertical</option>
                <option value="diameter">Diameter Callout (Ø)</option>
                <option value="radius">Radius Callout (R)</option>
                <option value="angular">Angular Dimension (°)</option>
              </select>

              <label className="property-label" style={{ marginTop: 8 }}>Tolerance Standard</label>
              <select className="property-select" value={dimTolerance} onChange={(e) => setDimTolerance(e.target.value)}>
                <option value="none">None (Nominal Only)</option>
                <option value="bilateral">Bilateral (+/- Deviations)</option>
                <option value="symmetric">Symmetric (± Value)</option>
                <option value="limit">Limit Dimensions</option>
                <option value="basic">Basic Theoretical Box</option>
              </select>

              {dimTolerance !== 'none' && dimTolerance !== 'basic' && (
                <>
                  <div className="property-row" style={{ marginTop: 8 }}>
                    <span className="property-label">Upper Tol (+):</span>
                    <NumericInput value={dimUpperTol} onChange={setDimUpperTol} step={0.01} precision={3} unit="mm" />
                  </div>
                  <div className="property-row">
                    <span className="property-label">Lower Tol (-):</span>
                    <NumericInput value={dimLowerTol} onChange={setDimLowerTol} step={0.01} precision={3} unit="mm" />
                  </div>
                </>
              )}

              <div className="property-row" style={{ marginTop: 8 }}>
                <span className="property-label">Prefix (e.g. 2X, Ø):</span>
                <input
                  type="text"
                  className="property-select"
                  style={{ width: 80, padding: '2px 6px' }}
                  value={dimPrefix}
                  onChange={(e) => setDimPrefix(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ==================== GD&T FEATURE CONTROL FRAME CARD ==================== */}
        {featureType === 'drawing_gdt' && (
          <div className="property-card">
            <div className="property-card-header">Geometric Dimensioning & Tolerancing (GD&T)</div>
            <div className="property-card-body">
              <label className="property-label">Geometric Characteristic</label>
              <select className="property-select" value={gdtSymbol} onChange={(e) => setGdtSymbol(e.target.value)}>
                <option value="flatness">Flatness [⏥]</option>
                <option value="perpendicularity">Perpendicularity [⟂]</option>
                <option value="parallelism">Parallelism [∥]</option>
                <option value="position">True Position [⌖]</option>
                <option value="concentricity">Concentricity [◎]</option>
                <option value="circular_runout">Circular Runout [↗]</option>
                <option value="total_runout">Total Runout [⌰]</option>
                <option value="datum">Datum Feature Symbol</option>
              </select>

              {gdtSymbol !== 'datum' ? (
                <>
                  <div className="property-row" style={{ marginTop: 8 }}>
                    <span className="property-label">Tolerance Value:</span>
                    <NumericInput value={gdtTol} onChange={setGdtTol} min={0.001} max={5} step={0.005} precision={3} unit="mm" />
                  </div>

                  <label className="property-label" style={{ marginTop: 8 }}>Material Condition Modifier</label>
                  <select className="property-select" value={gdtModifier} onChange={(e) => setGdtModifier(e.target.value)}>
                    <option value="MMC">Maximum Material Condition [Ⓜ]</option>
                    <option value="LMC">Least Material Condition [Ⓛ]</option>
                    <option value="RFS">Regardless of Feature Size [None]</option>
                  </select>

                  <div className="property-row" style={{ marginTop: 8 }}>
                    <span className="property-label">Datum References:</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input type="text" className="property-select" style={{ width: 32, textAlign: 'center' }} value={gdtDatumA} onChange={(e) => setGdtDatumA(e.target.value)} />
                      <input type="text" className="property-select" style={{ width: 32, textAlign: 'center' }} value={gdtDatumB} onChange={(e) => setGdtDatumB(e.target.value)} />
                      <input type="text" className="property-select" style={{ width: 32, textAlign: 'center' }} value={gdtDatumC} onChange={(e) => setGdtDatumC(e.target.value)} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="property-row" style={{ marginTop: 8 }}>
                  <span className="property-label">Datum Label:</span>
                  <input type="text" className="property-select" style={{ width: 60, textAlign: 'center', fontWeight: 700 }} value={gdtDatumA} onChange={(e) => setGdtDatumA(e.target.value)} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== SOLID 3D FEA SIMULATION SETUP CARD ==================== */}
        {(featureType === 'fea_setup' || featureType === 'simulation') && (
          <div className="property-card">
            <div className="property-card-header">3D Solid FEA Linear Static Setup</div>
            <div className="property-card-body">
              <label className="property-label">Study Name</label>
              <input
                type="text"
                className="property-select"
                value={feaStudyName}
                onChange={(e) => setFeaStudyName(e.target.value)}
              />

              <label className="property-label" style={{ marginTop: 8 }}>Solid Element Type</label>
              <select className="property-select" value={feaElementType} onChange={(e) => setFeaElementType(e.target.value)}>
                <option value="Tet10">Tet10 (Quadratic 10-Node Tetrahedron - High Accuracy)</option>
                <option value="Tet4">Tet4 (Linear 4-Node Tetrahedron - Fast Mesh)</option>
              </select>

              <div className="property-row" style={{ marginTop: 8 }}>
                <span className="property-label">Mesh Element Size:</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8' }}>{feaMeshSize} mm</span>
              </div>
              <input
                type="range"
                min="2"
                max="30"
                step="1"
                value={feaMeshSize}
                onChange={(e) => debouncedSetMeshSize(parseFloat(e.target.value))}
                style={{ width: '100%', margin: '4px 0 8px 0', accentColor: '#38bdf8' }}
              />

              <label className="property-label">Boundary Support Fixture</label>
              <select className="property-select" value={feaFixtureType} onChange={(e) => setFeaFixtureType(e.target.value)}>
                <option value="fixed">Fixed Support (Displacement u_x = u_y = u_z = 0)</option>
                <option value="roller">Roller Support (Normal constrained)</option>
                <option value="pin">Pinned Support</option>
              </select>

              <div className="property-row" style={{ marginTop: 8 }}>
                <span className="property-label">Total Applied Force:</span>
                <NumericInput value={feaLoadValue} onChange={setFeaLoadValue} min={1} max={100000} step={100} unit="N" />
              </div>

              <div className="property-row">
                <span className="property-label">Distributed Pressure:</span>
                <NumericInput value={feaPressureValue} onChange={setFeaPressureValue} min={0.1} max={500} step={1} unit="MPa" />
              </div>

              <div style={{ marginTop: 8, padding: 8, background: 'rgba(56,189,248,0.08)', borderRadius: 4, fontSize: 11 }}>
                <div style={{ color: '#94a3b8' }}>Active Material: <strong style={{ color: '#38bdf8' }}>{MATERIALS[activeMaterial]?.name || activeMaterial}</strong></div>
                <div style={{ color: '#94a3b8', marginTop: 2 }}>
                  E = {((MATERIALS[activeMaterial]?.youngsModulus || 200e9) / 1e9).toFixed(1)} GPa | ν = {MATERIALS[activeMaterial]?.poissonsRatio || 0.29}
                </div>
              </div>
            </div>
          </div>
        )}

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
          <>
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

            {/* Thin Feature Card */}
            <div className="property-card">
              <div className="property-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Thin Feature</span>
                <label className="custom-switch" style={{ width: 34, height: 18 }}>
                  <input type="checkbox" checked={thin} onChange={(e) => setThin(e.target.checked)} />
                  <span className="slider round" />
                </label>
              </div>
              {thin && (
                <div className="property-card-body">
                  <div className="property-row">
                    <span className="property-label">Wall Thickness (T1):</span>
                    <NumericInput value={wallThickness} onChange={setWallThickness} min={0.2} max={100} step={0.5} unit="mm" />
                  </div>
                </div>
              )}
            </div>
          </>
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
