// CADWorks Pro - Professional 2D Geometric Constraint Solver
// Uses Levenberg-Marquardt non-linear least squares with Tikhonov regularization
import { distance2D, EPSILON } from '../utils/math.js';
import { CONSTRAINT_TYPES } from '../utils/constants.js';

export class ConstraintSolver {
  constructor(maxIterations = 50, tolerance = 1e-5) {
    this.maxIterations = maxIterations;
    this.tolerance = tolerance;
  }

  /**
   * Solve all geometric constraints simultaneously on sketch entities
   * @param {Array} entities - Array of sketch entities
   * @param {Array} constraints - Array of constraints
   * @returns {{ converged: boolean, error: number, iterations: number }}
   */
  solve(entities, constraints) {
    if (!constraints || constraints.length === 0 || !entities || entities.length === 0) {
      return { converged: true, error: 0, iterations: 0 };
    }

    // 1. Collect all variable references from entities
    const entityMap = new Map();
    entities.forEach(e => entityMap.set(e.id, e));

    const varMap = []; // [{ obj, key, id }]
    const varIndexMap = new Map();

    const registerVar = (obj, key, explicitId = null) => {
      const id = explicitId || `${obj.id || 'obj'}_${key}`;
      if (!varIndexMap.has(id)) {
        const index = varMap.length;
        varMap.push({ obj, key, id });
        varIndexMap.set(id, index);
      }
      return varIndexMap.get(id);
    };

    // Index points and radii with unique entity-scoped keys
    for (const ent of entities) {
      if (ent.p1) {
        registerVar(ent.p1, 'x', `${ent.id}_p1_x`);
        registerVar(ent.p1, 'y', `${ent.id}_p1_y`);
      }
      if (ent.p2) {
        registerVar(ent.p2, 'x', `${ent.id}_p2_x`);
        registerVar(ent.p2, 'y', `${ent.id}_p2_y`);
      }
      if (ent.center) {
        registerVar(ent.center, 'x', `${ent.id}_center_x`);
        registerVar(ent.center, 'y', `${ent.id}_center_y`);
      }
      if (ent.radius !== undefined) {
        registerVar(ent, 'radius', `${ent.id}_radius`);
      }
    }

    const nVars = varMap.length;
    if (nVars === 0) return { converged: true, error: 0, iterations: 0 };

    // Initial state vector X0
    const X0 = new Float64Array(nVars);
    const X = new Float64Array(nVars);
    for (let i = 0; i < nVars; i++) {
      X[i] = varMap[i].obj[varMap[i].key];
      X0[i] = X[i];
    }

    const setVars = (vec) => {
      for (let i = 0; i < nVars; i++) {
        varMap[i].obj[varMap[i].key] = vec[i];
      }
    };

    // Evaluate residual vector F(X)
    const evaluateResiduals = () => {
      const residuals = [];

      for (const c of constraints) {
        const e1 = entityMap.get(c.entity1Id || c.entityId);
        const e2 = c.entity2Id ? entityMap.get(c.entity2Id) : null;

        switch (c.type) {
          case CONSTRAINT_TYPES.COINCIDENT: {
            if (!e1 || !e2) break;
            const pt1 = c.pointIndex1 !== undefined ? c.pointIndex1 : (c.point1 !== undefined ? c.point1 : 0);
            const pt2 = c.pointIndex2 !== undefined ? c.pointIndex2 : (c.point2 !== undefined ? c.point2 : 0);
            const p1 = this._getPoint(e1, pt1);
            const p2 = this._getPoint(e2, pt2);
            if (p1 && p2) {
              residuals.push(p1.x - p2.x);
              residuals.push(p1.y - p2.y);
            }
            break;
          }

          case CONSTRAINT_TYPES.HORIZONTAL: {
            if (e1 && e1.p1 && e1.p2) {
              residuals.push(e1.p2.y - e1.p1.y);
            }
            break;
          }

          case CONSTRAINT_TYPES.VERTICAL: {
            if (e1 && e1.p1 && e1.p2) {
              residuals.push(e1.p2.x - e1.p1.x);
            }
            break;
          }

          case CONSTRAINT_TYPES.PARALLEL: {
            if (e1 && e2 && e1.p1 && e1.p2 && e2.p1 && e2.p2) {
              const dx1 = e1.p2.x - e1.p1.x;
              const dy1 = e1.p2.y - e1.p1.y;
              const dx2 = e2.p2.x - e2.p1.x;
              const dy2 = e2.p2.y - e2.p1.y;
              // Cross product = 0
              residuals.push(dx1 * dy2 - dy1 * dx2);
            }
            break;
          }

          case CONSTRAINT_TYPES.PERPENDICULAR: {
            if (e1 && e2 && e1.p1 && e1.p2 && e2.p1 && e2.p2) {
              const dx1 = e1.p2.x - e1.p1.x;
              const dy1 = e1.p2.y - e1.p1.y;
              const dx2 = e2.p2.x - e2.p1.x;
              const dy2 = e2.p2.y - e2.p1.y;
              // Dot product = 0
              residuals.push(dx1 * dx2 + dy1 * dy2);
            }
            break;
          }

          case CONSTRAINT_TYPES.EQUAL: {
            if (e1 && e2) {
              if (e1.p1 && e1.p2 && e2.p1 && e2.p2) {
                const len1 = distance2D(e1.p1, e1.p2);
                const len2 = distance2D(e2.p1, e2.p2);
                residuals.push(len1 - len2);
              } else if (e1.radius !== undefined && e2.radius !== undefined) {
                residuals.push(e1.radius - e2.radius);
              }
            }
            break;
          }

          case CONSTRAINT_TYPES.CONCENTRIC: {
            if (e1 && e2 && e1.center && e2.center) {
              residuals.push(e1.center.x - e2.center.x);
              residuals.push(e1.center.y - e2.center.y);
            }
            break;
          }

          case CONSTRAINT_TYPES.MIDPOINT: {
            if (e1 && e2) {
              const pt1 = c.pointIndex1 !== undefined ? c.pointIndex1 : (c.point1 !== undefined ? c.point1 : 0);
              const pMid = this._getPoint(e1, pt1);
              if (pMid && e2.p1 && e2.p2) {
                residuals.push(pMid.x - (e2.p1.x + e2.p2.x) * 0.5);
                residuals.push(pMid.y - (e2.p1.y + e2.p2.y) * 0.5);
              }
            }
            break;
          }

          case CONSTRAINT_TYPES.FIX: {
            const pt1 = c.pointIndex1 !== undefined ? c.pointIndex1 : c.point1;
            // If no specific pointIndex given and entity has both p1 and p2, fix BOTH endpoints
            if (pt1 === undefined && c.pointIndex2 === undefined && c.point2 === undefined && e1 && e1.p1 && e1.p2) {
              // Record original coords at first evaluation via X0
              const fixP1X = c.p1x !== undefined ? c.p1x : X0[varIndexMap.get(`${e1.id}_p1_x`)] ?? e1.p1.x;
              const fixP1Y = c.p1y !== undefined ? c.p1y : X0[varIndexMap.get(`${e1.id}_p1_y`)] ?? e1.p1.y;
              const fixP2X = c.p2x !== undefined ? c.p2x : X0[varIndexMap.get(`${e1.id}_p2_x`)] ?? e1.p2.x;
              const fixP2Y = c.p2y !== undefined ? c.p2y : X0[varIndexMap.get(`${e1.id}_p2_y`)] ?? e1.p2.y;
              residuals.push(e1.p1.x - fixP1X);
              residuals.push(e1.p1.y - fixP1Y);
              residuals.push(e1.p2.x - fixP2X);
              residuals.push(e1.p2.y - fixP2Y);
            } else if (pt1 === undefined && e1 && e1.center) {
              // Fix circle center
              const fixCX = c.x !== undefined ? c.x : X0[varIndexMap.get(`${e1.id}_center_x`)] ?? e1.center.x;
              const fixCY = c.y !== undefined ? c.y : X0[varIndexMap.get(`${e1.id}_center_y`)] ?? e1.center.y;
              residuals.push(e1.center.x - fixCX);
              residuals.push(e1.center.y - fixCY);
            } else {
              // Fix a single point
              const p = this._getPoint(e1, pt1);
              if (p) {
                const ptName = (pt1 === 1 || pt1 === 'p2' || pt1 === 'end') ? 'p2' : ((pt1 === 'center') ? 'center' : 'p1');
                const x0Idx = varIndexMap.get(`${e1.id}_${ptName}_x`);
                const y0Idx = varIndexMap.get(`${e1.id}_${ptName}_y`);
                const fixX = c.x !== undefined ? c.x : (c.targetX ?? (x0Idx !== undefined ? X0[x0Idx] : p.x));
                const fixY = c.y !== undefined ? c.y : (c.targetY ?? (y0Idx !== undefined ? X0[y0Idx] : p.y));
                residuals.push(p.x - fixX);
                residuals.push(p.y - fixY);
              }
            }
            break;
          }

          case CONSTRAINT_TYPES.DIMENSION: {
            if (e1) {
              const targetVal = c.value ?? c.targetValue ?? 10;
              if (e1.p1 && e1.p2) {
                const currentLen = distance2D(e1.p1, e1.p2);
                residuals.push(currentLen - targetVal);
              } else if (e1.radius !== undefined) {
                residuals.push(e1.radius - targetVal);
              }
            }
            break;
          }

          case CONSTRAINT_TYPES.ANGLE: {
            if (e1 && e2 && e1.p1 && e1.p2 && e2.p1 && e2.p2) {
              const dx1 = e1.p2.x - e1.p1.x;
              const dy1 = e1.p2.y - e1.p1.y;
              const dx2 = e2.p2.x - e2.p1.x;
              const dy2 = e2.p2.y - e2.p1.y;
              const len1 = Math.hypot(dx1, dy1) || 1e-6;
              const len2 = Math.hypot(dx2, dy2) || 1e-6;
              const cosAlpha = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
              const targetDeg = c.angle ?? c.value ?? 90;
              const targetRad = (targetDeg * Math.PI) / 180;
              residuals.push(cosAlpha - Math.cos(targetRad));
            }
            break;
          }

          default:
            break;
        }
      }

      return residuals;
    };

    let lambda = 1e-4;
    const mu = 1e-8; // Gentle regularization to handle rank-deficiency without pulling against constraints
    let iter = 0;

    let r = evaluateResiduals();
    if (r.length === 0) return { converged: true, error: 0, iterations: 0 };

    let currentError = this._normInf(r);

    for (iter = 0; iter < this.maxIterations; iter++) {
      if (currentError < this.tolerance) {
        return { converged: true, error: currentError, iterations: iter };
      }

      const mConstraints = r.length;

      // 2. Numerical Jacobian J (mConstraints x nVars)
      const J = Array.from({ length: mConstraints }, () => new Float64Array(nVars));
      const h = 1e-6;

      for (let j = 0; j < nVars; j++) {
        const orig = X[j];
        X[j] = orig + h;
        setVars(X);
        const rPlus = evaluateResiduals();

        for (let i = 0; i < mConstraints; i++) {
          J[i][j] = (rPlus[i] - r[i]) / h;
        }

        X[j] = orig;
      }
      setVars(X);

      // 3. Normal equations: (J^T * J + (lambda + mu) * I) * delta = -J^T * r - mu * (X - X0)
      const A = Array.from({ length: nVars }, () => new Float64Array(nVars));
      const b = new Float64Array(nVars);

      for (let i = 0; i < nVars; i++) {
        for (let j = 0; j < nVars; j++) {
          let sum = 0;
          for (let k = 0; k < mConstraints; k++) {
            sum += J[k][i] * J[k][j];
          }
          if (i === j) {
            sum += (lambda + mu);
          }
          A[i][j] = sum;
        }

        let rhs = 0;
        for (let k = 0; k < mConstraints; k++) {
          rhs -= J[k][i] * r[k];
        }
        rhs -= mu * (X[i] - X0[i]); // Regularization towards original geometry
        b[i] = rhs;
      }

      // 4. Solve linear system A * delta = b using Gaussian elimination with partial pivoting
      const delta = this._solveLinearSystem(A, b);
      if (!delta) {
        lambda *= 5;
        continue;
      }

      // 5. Test step
      const X_trial = new Float64Array(nVars);
      for (let i = 0; i < nVars; i++) {
        X_trial[i] = X[i] + delta[i];
      }
      setVars(X_trial);
      const r_trial = evaluateResiduals();
      const trialError = this._normInf(r_trial);

      if (trialError < currentError) {
        // Accept step
        for (let i = 0; i < nVars; i++) {
          X[i] = X_trial[i];
        }
        r = r_trial;
        currentError = trialError;
        lambda = Math.max(1e-7, lambda * 0.5);
      } else {
        // Reject step and increase damping
        setVars(X);
        lambda = Math.min(1e5, lambda * 4.0);
      }
    }

    setVars(X);
    return {
      converged: currentError < this.tolerance * 10,
      error: currentError,
      iterations: iter,
    };
  }

  _getPoint(entity, index) {
    if (!entity) return null;
    if ((index === 0 || index === 'p1' || index === 'start') && entity.p1) return entity.p1;
    if ((index === 1 || index === 'p2' || index === 'end') && entity.p2) return entity.p2;
    if (index === 'center' && entity.center) return entity.center;
    if (index === 0 && entity.p1) return entity.p1;
    if (index === 1 && entity.p2) return entity.p2;
    if (entity.center) return entity.center;
    return entity.p1 || null;
  }

  _normInf(v) {
    let max = 0;
    for (let i = 0; i < v.length; i++) {
      const abs = Math.abs(v[i]);
      if (abs > max) max = abs;
    }
    return max;
  }

  /**
   * Solve A * x = b via Gaussian elimination with partial pivoting
   */
  _solveLinearSystem(A, b) {
    const n = b.length;
    const M = Array.from({ length: n }, (_, i) => {
      const row = new Float64Array(n + 1);
      row.set(A[i]);
      row[n] = b[i];
      return row;
    });

    for (let p = 0; p < n; p++) {
      let maxRow = p;
      let maxVal = Math.abs(M[p][p]);
      for (let i = p + 1; i < n; i++) {
        const val = Math.abs(M[i][p]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = i;
        }
      }

      if (maxVal < 1e-12) return null; // Singular

      if (maxRow !== p) {
        const tmp = M[p];
        M[p] = M[maxRow];
        M[maxRow] = tmp;
      }

      const pivot = M[p][p];
      for (let j = p; j <= n; j++) {
        M[p][j] /= pivot;
      }

      for (let i = 0; i < n; i++) {
        if (i !== p) {
          const factor = M[i][p];
          if (Math.abs(factor) > 1e-14) {
            for (let j = p; j <= n; j++) {
              M[i][j] -= factor * M[p][j];
            }
          }
        }
      }
    }

    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = M[i][n];
    }
    return x;
  }
}

export const constraintSolver = new ConstraintSolver();
export default ConstraintSolver;
