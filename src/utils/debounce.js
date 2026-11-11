// CADWorks Pro - High-Performance Debounce & Throttle Utilities
// Prevents UI thread freeze during continuous slider drags and geometry rebuilds

/**
 * Debounce a function call by delayMs
 * @param {Function} fn
 * @param {number} delayMs
 * @returns {Function}
 */
export function debounce(fn, delayMs = 120) {
  let timer = null;
  const debounced = function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, delayMs);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

/**
 * Throttle a function call by limitMs using requestAnimationFrame or timer
 * @param {Function} fn
 * @param {number} limitMs
 * @returns {Function}
 */
export function throttle(fn, limitMs = 50) {
  let inThrottle = false;
  let lastArgs = null;
  let lastContext = null;

  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn.apply(lastContext, lastArgs);
          lastArgs = null;
          lastContext = null;
        }
      }, limitMs);
    } else {
      lastArgs = args;
      lastContext = this;
    }
  };
}
