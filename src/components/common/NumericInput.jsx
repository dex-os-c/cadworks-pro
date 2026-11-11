// CADWorks Pro - Reusable Numeric Input Component
// Provides a number input with increment/decrement buttons and unit suffix

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

/**
 * NumericInput - A professional numeric input with spin buttons and unit display.
 * 
 * @param {number} value - Current value
 * @param {function} onChange - Callback when value changes
 * @param {number} [min] - Minimum allowed value
 * @param {number} [max] - Maximum allowed value
 * @param {number} [step=1] - Increment/decrement step size
 * @param {string} [unit=''] - Unit suffix to display (e.g., 'mm', 'deg')
 * @param {number} [precision=4] - Decimal precision
 * @param {boolean} [disabled=false] - Whether the input is disabled
 * @param {string} [label] - Optional label
 * @param {string} [className] - Additional CSS class
 */
const NumericInput = ({
  value = 0,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit = '',
  precision = 4,
  disabled = false,
  label,
  className = '',
}) => {
  // Internal string representation for editing
  const [editValue, setEditValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);
  const holdTimerRef = useRef(null);
  const holdIntervalRef = useRef(null);

  // Sync display value with prop when not actively editing
  useEffect(() => {
    if (!isEditing) {
      setEditValue(formatValue(value));
    }
  }, [value, isEditing, precision]);

  /** Format a numeric value for display */
  function formatValue(val) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    // Remove trailing zeros but keep up to `precision` decimals
    const fixed = Number(val).toFixed(precision);
    return parseFloat(fixed).toString();
  }

  /** Clamp a value between min and max */
  const clamp = useCallback((val) => {
    return Math.min(max, Math.max(min, val));
  }, [min, max]);

  /** Commit the current edit value */
  const commitValue = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (isNaN(parsed)) {
      setEditValue(formatValue(value));
    } else {
      const clamped = clamp(parsed);
      setEditValue(formatValue(clamped));
      if (clamped !== value && onChange) {
        onChange(clamped);
      }
    }
    setIsEditing(false);
  }, [editValue, value, clamp, onChange, precision]);

  /** Handle text input change */
  const handleInputChange = useCallback((e) => {
    setEditValue(e.target.value);
  }, []);

  /** Handle focus - select all text for easy replacement */
  const handleFocus = useCallback(() => {
    setIsEditing(true);
    // Select all text after a tiny delay so the DOM has time to update
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.select();
      }
    }, 0);
  }, []);

  /** Handle blur - commit value */
  const handleBlur = useCallback(() => {
    commitValue();
  }, [commitValue]);

  /** Handle keyboard events */
  const handleKeyDown = useCallback((e) => {
    // Stop typing/arrow keys from propagating to global shortcuts (L, R, C, D, Space, etc.)
    e.stopPropagation();

    if (e.key === 'Enter') {
      commitValue();
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setEditValue(formatValue(value));
      setIsEditing(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newVal = clamp((parseFloat(editValue) || 0) + step);
      setEditValue(formatValue(newVal));
      onChange?.(newVal);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newVal = clamp((parseFloat(editValue) || 0) - step);
      setEditValue(formatValue(newVal));
      onChange?.(newVal);
    }
  }, [commitValue, value, clamp, step, editValue, onChange, precision]);

  /** Increment the value by step */
  const increment = useCallback(() => {
    const current = parseFloat(editValue) || 0;
    const newVal = clamp(current + step);
    setEditValue(formatValue(newVal));
    onChange?.(newVal);
  }, [editValue, step, clamp, onChange, precision]);

  /** Decrement the value by step */
  const decrement = useCallback(() => {
    const current = parseFloat(editValue) || 0;
    const newVal = clamp(current - step);
    setEditValue(formatValue(newVal));
    onChange?.(newVal);
  }, [editValue, step, clamp, onChange, precision]);

  /** Start holding a spin button for continuous adjustment */
  const startHold = useCallback((direction) => {
    const fn = direction === 'up' ? increment : decrement;
    fn();
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(fn, 80);
    }, 400);
  }, [increment, decrement]);

  /** Stop holding */
  const stopHold = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimerRef.current = null;
    holdIntervalRef.current = null;
  }, []);

  // Clean up hold timers on unmount
  useEffect(() => {
    return () => stopHold();
  }, [stopHold]);

  return (
    <div className={`numeric-input ${disabled ? 'disabled' : ''} ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={label || 'Numeric input'}
      />
      {unit && <span className="unit-suffix">{unit}</span>}
      <div className="spin-buttons">
        <button
          className="spin-btn"
          onMouseDown={(e) => { e.preventDefault(); startHold('up'); }}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          disabled={disabled}
          tabIndex={-1}
          aria-label="Increment"
        >
          <ChevronUp size={10} />
        </button>
        <button
          className="spin-btn"
          onMouseDown={(e) => { e.preventDefault(); startHold('down'); }}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          disabled={disabled}
          tabIndex={-1}
          aria-label="Decrement"
        >
          <ChevronDown size={10} />
        </button>
      </div>
    </div>
  );
};

export default React.memo(NumericInput);
