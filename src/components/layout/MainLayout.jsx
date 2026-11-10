// CADWorks Pro - Main Application Layout (Responsive Desktop & Mobile)
import React, { useState } from 'react';
import CommandManager from './CommandManager';
import FeatureTree from './FeatureTree';
import PropertyPanel from './PropertyPanel';
import StatusBar from './StatusBar';
import Viewport3D from '../../viewport/Viewport3D';
import { useCADStore } from '../../store/cadStore';

export default function MainLayout({ onExportClick, onMaterialClick, onMassPropsClick }) {
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const propertyPanelOpen = useCADStore(s => s.propertyPanelOpen);
  const closePropertyPanel = useCADStore(s => s.closePropertyPanel);

  return (
    <div className="app-container">
      <CommandManager
        onExportClick={onExportClick}
        onMaterialClick={onMaterialClick}
        onMassPropsClick={onMassPropsClick}
        onToggleTree={() => setMobileTreeOpen(prev => !prev)}
      />

      <div className="workspace-middle">
        {/* Mobile backdrop for FeatureTree drawer */}
        {mobileTreeOpen && (
          <div
            className="mobile-backdrop"
            onClick={() => setMobileTreeOpen(false)}
            title="Tap to close"
          />
        )}

        {/* FeatureManager Tree Drawer */}
        <FeatureTree
          onMaterialClick={onMaterialClick}
          isOpen={mobileTreeOpen}
          onClose={() => setMobileTreeOpen(false)}
        />

        {/* 3D Viewport Area */}
        <div className="viewport-wrapper" style={{ flex: 1, position: 'relative', height: '100%', overflow: 'hidden' }}>
          <Viewport3D />
        </div>

        {/* PropertyManager Side / Bottom Sheet */}
        <PropertyPanel />
      </div>

      <StatusBar />
    </div>
  );
}
