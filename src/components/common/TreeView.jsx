// CADWorks Pro - Reusable TreeView Component
// Provides expandable/collapsible tree with icons, selection, context menu, and drag-and-drop

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

/**
 * TreeView - Renders a hierarchical tree of nodes.
 *
 * @param {Array} nodes - Array of tree node objects:
 *   { id, label, icon, children, expanded, selected, draggable, data }
 * @param {function} onSelect - Called with (nodeId, nodeData) on click
 * @param {function} onToggle - Called with (nodeId) to expand/collapse
 * @param {function} onDoubleClick - Called with (nodeId, nodeData) on double-click
 * @param {function} onContextMenu - Called with (e, nodeId, nodeData) on right-click
 * @param {function} onDrop - Called with (draggedId, targetId, position) on drop
 * @param {number} [indentLevel=0] - Current indentation level (used internally)
 * @param {string} [selectedId] - Currently selected node id
 * @param {Set} [expandedIds] - Set of expanded node ids
 */
const TreeView = ({
  nodes = [],
  onSelect,
  onToggle,
  onDoubleClick,
  onContextMenu,
  onDrop,
  indentLevel = 0,
  selectedId,
  expandedIds = new Set(),
}) => {
  return (
    <div className="tree-view" role="tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          indentLevel={indentLevel}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggle={onToggle}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
};

/**
 * TreeNode - Individual node in the tree.
 */
const TreeNode = ({
  node,
  indentLevel,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  onDoubleClick,
  onContextMenu,
  onDrop,
}) => {
  const [dragOver, setDragOver] = useState(null); // 'top' | 'bottom' | null
  const nodeRef = useRef(null);
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  /** Handle click to select */
  const handleClick = useCallback((e) => {
    e.stopPropagation();
    onSelect?.(node.id, node.data || node);
  }, [node, onSelect]);

  /** Handle double click */
  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggle?.(node.id);
    }
    onDoubleClick?.(node.id, node.data || node);
  }, [node, hasChildren, onToggle, onDoubleClick]);

  /** Handle right-click context menu */
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(node.id, node.data || node);
    onContextMenu?.(e, node.id, node.data || node);
  }, [node, onSelect, onContextMenu]);

  /** Toggle expand/collapse */
  const handleToggle = useCallback((e) => {
    e.stopPropagation();
    onToggle?.(node.id);
  }, [node.id, onToggle]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e) => {
    if (!node.draggable) return;
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
  }, [node]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!nodeRef.current) return;
    const rect = nodeRef.current.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOver(e.clientY < midY ? 'top' : 'bottom');
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== node.id) {
      onDrop?.(draggedId, node.id, dragOver || 'bottom');
    }
    setDragOver(null);
  }, [node.id, dragOver, onDrop]);

  const dragOverClass = dragOver === 'top' ? 'drag-over-top' : dragOver === 'bottom' ? 'drag-over-bottom' : '';

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <div
        ref={nodeRef}
        className={`tree-node ${isSelected ? 'selected' : ''} ${node.className || ''} ${dragOverClass}`}
        style={{ '--tree-indent': indentLevel }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        draggable={node.draggable || false}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Expand/Collapse button */}
        {hasChildren ? (
          <button className="tree-expand-btn" onClick={handleToggle} tabIndex={-1}>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}

        {/* Node icon */}
        {node.icon && (
          <span className={`tree-node-icon ${node.iconClass || ''}`}>
            {node.icon}
          </span>
        )}

        {/* Node label */}
        <span className="tree-node-label">{node.label}</span>

        {/* Extra actions (visibility toggle, etc.) */}
        {node.actions}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <TreeView
          nodes={node.children}
          indentLevel={indentLevel + 1}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggle={onToggle}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onDrop={onDrop}
        />
      )}
    </div>
  );
};

export default React.memo(TreeView);
