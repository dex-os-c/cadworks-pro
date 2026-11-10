// CADWorks Pro - Keyboard Shortcuts Listener
import { TOOLS } from './constants';

export function setupKeyboardShortcuts(store) {
  const handleKeyDown = (e) => {
    // Ignore keystrokes when typing into text/numeric input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      store.getState().undo();
    } else if (isCtrl && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
      e.preventDefault();
      store.getState().redo();
    } else if (isCtrl && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      const json = store.getState().saveProject();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${store.getState().documentName}.cadproj`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (e.key === 'F5') {
      e.preventDefault();
      store.getState().rebuild();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      store.getState().cancelTool();
    } else if (!isCtrl) {
      switch (e.key.toLowerCase()) {
        case 'l':
          store.getState().setActiveTool(TOOLS.SKETCH_LINE);
          break;
        case 'r':
          store.getState().setActiveTool(TOOLS.SKETCH_RECT);
          break;
        case 'c':
          store.getState().setActiveTool(TOOLS.SKETCH_CIRCLE);
          break;
        case 'd':
          store.getState().setActiveTool(TOOLS.SKETCH_DIMENSION);
          break;
        case 'e':
          store.getState().setActiveTool(TOOLS.EXTRUDE);
          store.getState().openPropertyPanel({ type: 'extrude_boss' });
          break;
        case ' ': // Space bar - toggle isometric
          store.getState().setViewOrientation('isometric');
          break;
        default:
          break;
      }
    } else if (isCtrl) {
      // SolidWorks Ctrl+1..7 view orientations
      const views = {
        '1': 'front',
        '2': 'back',
        '3': 'left',
        '4': 'right',
        '5': 'top',
        '6': 'bottom',
        '7': 'isometric',
      };
      if (views[e.key]) {
        e.preventDefault();
        store.getState().setViewOrientation(views[e.key]);
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}
