// CADWorks Pro - Industrial-Strength 2D Geometric Constraint Solver
// Features:
// - Full Levenberg-Marquardt with QR decomposition (Householder column pivoting)
// - Numerical Jacobian via central finite differences (2nd order accuracy)
// - Degrees of Freedom (DOF) Analysis (nVars - rank(J))
// - State classification: Under-Constrained, Fully Constrained, Over-Constrained
// - Over-Constrained & Conflict Diagnostics (redundant vs inconsistent/conflicting constraints)
// - Complete 2D geometric constraints: coincident, horizontal, vertical, parallel,
//   perpendicular, equal, fix, midpoint, concentric, colinear, tangent, distance/dimensions,
//   angle, symmetric.

import { distance2D, EPSILON } from '../utils/math.js';
import { CONSTRAINT_TYPES } from '../utils/constants.js';

/**
 * Householder QR Decomposition with Column Pivoting
 * Decomposes A * P = Q * R where:
 * - A is m x n
 * - P is column permutation matrix
 * - Q is m x m orthogonal matrix
 * - R is m x n upper triangular matrix
 */
export class QRDecomposition {
  constructor(A, enablePivoting = true) {
    const m = A.length;
    const n = A[0].length;
    this.m = m;
    this.n = n;

    // Working copy of A
    const QR = Array.from({ length: m }, (_, i) => new Float64Array(A[i]));
    const p = new Int32Array(n);
    for (let j = 0; j < n; j++) p[j] = j;

    const colNormsSq = new Float64Array(n);
    if (enablePivoting) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let i = 0; i < m; i++) sum += QR[i][j] * QR[i][j];
        colNormsSq[j] = sum;
      }
    }

    const minDim = Math.min(m, n);
    const beta = new Float64Array(minDim);

    for (let k = 0; k < minDim; k++) {
      // 1. Column pivoting: select column with maximum remaining norm
      if (enablePivoting) {
        let maxCol = k;
        let maxNormSq = colNormsSq[k];
        for (let j = k + 1; j < n; j++) {
          if (colNormsSq[j] > maxNormSq) {
            maxNormSq = colNormsSq[j];
            maxCol = j;
          }
        }

        if (maxCol !== k) {
          // Swap columns in QR
          for (let i = 0; i < m; i++) {
            const tmp = QR[i][k];
            QR[i][k] = QR[i][maxCol];
            QR[i][maxCol] = tmp;
          }
          // Swap permutation
          const tmpP = p[k];
          p[k] = p[maxCol];
          p[maxCol] = tmpP;
          // Swap norm
          colNormsSq[maxCol] = colNormsSq[k];
          colNormsSq[k] = maxNormSq;
        }
      }

      // 2. Householder reflector for column k below diagonal
      let normSq = 0;
      for (let i = k; i < m; i++) normSq += QR[i][k] * QR[i][k];
      const norm = Math.sqrt(normSq);

      if (norm < 1e-15) {
        beta[k] = 0;
        continue;
      }

      const alpha = QR[k][k];
      const sigma = alpha >= 0 ? -norm : norm;
      const v0 = alpha - sigma;

      // Store Householder vector in QR[k...m-1][k] scaled by v0
      QR[k][k] = sigma;
      for (let i = k + 1; i < m; i++) {
        QR[i][k] /= v0;
      }
      beta[k] = -v0 / sigma;

      // 3. Apply Householder transformation to remaining columns
      for (let j = k + 1; j < n; j++) {
        let dot = QR[k][j];
        for (let i = k + 1; i < m; i++) {
          dot += QR[i][k] * QR[i][j];
        }
        dot *= beta[k];

        QR[k][j] -= dot;
        for (let i = k + 1; i < m; i++) {
          QR[i][j] -= dot * QR[i][k];
        }

        if (enablePivoting) {
          colNormsSq[j] = Math.max(0, colNormsSq[j] - QR[k][j] * QR[k][j]);
        }
      }
    }

    this.QR = QR;
    this.p = p;
    this.beta = beta;

    // Evaluate numerical rank
    const tol = Math.max(m, n) * 1e-12 * (Math.abs(QR[0][0]) || 1.0);
    let rank = 0;
    for (let i = 0; i < minDim; i++) {
      if (Math.abs(QR[i][i]) > tol) rank++;
    }
    this.rank = rank;
  }

  /**
   * Solve least-squares problem min ||A * x - b|| using QR decomposition
   * @param {Float64Array|Array<number>} b - Right-hand side vector (length m)
   * @returns {Float64Array} x - Solution vector (length n)
   */
  solve(b) {
    const { m, n, QR, beta, p, rank } = this;
    const minDim = Math.min(m, n);

    // Compute Q^T * b in place
    const d = new Float64Array(b);
    for (let k = 0; k < minDim; k++) {
      if (beta[k] === 0) continue;
      let dot = d[k];
      for (let i = k + 1; i < m; i++) {
        dot += QR[i][k] * d[i];
      }
      dot *= beta[k];

      d[k] -= dot;
      for (let i = k + 1; i < m; i++) {
        d[i] -= dot * QR[i][k];
      }
    }

    // Back-substitution on R * y = d[0:n]
    const y = new Float64Array(n);
    const tol = Math.max(m, n) * 1e-12 * (Math.abs(QR[0][0]) || 1.0);

    for (let i = Math.min(rank, n) - 1; i >= 0; i--) {
      if (Math.abs(QR[i][i]) < tol) {
        y[i] = 0;
        continue;
      }
      let sum = d[i];
      for (let j = i + 1; j < n; j++) {
        sum -= QR[i][j] * y[j];
      }
      y[i] = sum / QR[i][i];
    }

    // Apply column permutation x = P * y
    const x = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      x[p[j]] = y[j];
    }
    return x;
  }
}

export class ConstraintSolver {
  constructor(maxIterations = 60, tolerance = 1e-5) {
    this.maxIterations = maxIterations;
    this.tolerance = tolerance;
  }

  /**
   * Solve all geometric constraints simultaneously on sketch entities
   * @param {Array} entities - Array of sketch entities
   * @param {Array} constraints - Array of constraints
   * @returns {{
   *   converged: boolean,
   *   error: number,
   *   iterations: number,
   *   dof: number,
   *   rank: number,
   *   status: 'fully_constrained'|'under_constrained'|'over_constrained',
   *   diagnostics: Array<{ type: 'conflict'|'redundant', constraintIds: string[], message: string }>,
   *   conflict: { type: 'conflict', constraintIds: string[] }|null,
   *   redundant: { type: 'redundant', constraintIds: string[] }|null
   * }}
   */
  solve(entities, constraints) {
    if (!constraints || constraints.length === 0 || !entities || entities.length === 0) {
      return {
        converged: true,
        error: 0,
        iterations: 0,
        dof: entities ? entities.length * 2 : 0,
        rank: 0,
        status: 'under_constrained',
        diagnostics: [],
        conflict: null,
        redundant: null,
      };
    }

    // 1. Build variable registry
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

    // Index points, centers, radii with entity-scoped keys
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
      if (ent.x !== undefined && ent.y !== undefined && !ent.p1 && !ent.p2) {
        registerVar(ent, 'x', `${ent.id}_x`);
        registerVar(ent, 'y', `${ent.id}_y`);
      }
    }

    const nVars = varMap.length;
    if (nVars === 0) {
      return {
        converged: true,
        error: 0,
        iterations: 0,
        dof: 0,
        rank: 0,
        status: 'fully_constrained',
        diagnostics: [],
        conflict: null,
        redundant: null,
      };
    }

    // Initial state vector X0 and current X
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

    // Record initial tangents / orientations to keep solution on the correct branch
    const constraintMeta = this._prepareConstraintMeta(constraints, entityMap, X0, varIndexMap);

    // 2. Residual evaluation function
    const evaluateResiduals = () => {
      return this._evaluateResidualVector(constraints, entityMap, X0, varIndexMap, constraintMeta);
    };

    // Initial residual evaluation
    let { residuals: r, constraintRowMap } = evaluateResiduals();
    if (r.length === 0) {
      return {
        converged: true,
        error: 0,
        iterations: 0,
        dof: nVars,
        rank: 0,
        status: 'under_constrained',
        diagnostics: [],
        conflict: null,
        redundant: null,
      };
    }

    let currentError = this._normInf(r);

    // Levenberg-Marquardt parameters
    let lambda = 1e-3;
    const mu = 1e-9; // Tikhonov regularization towards initial geometry
    let iter = 0;

    for (iter = 0; iter < this.maxIterations; iter++) {
      if (currentError < this.tolerance) break;

      const mConstraints = r.length;

      // 3. Central-difference numerical Jacobian J (mConstraints x nVars)
      const J = Array.from({ length: mConstraints }, () => new Float64Array(nVars));
      const h = 1e-7;

      for (let j = 0; j < nVars; j++) {
        const orig = X[j];

        X[j] = orig + h;
        setVars(X);
        const rPlus = evaluateResiduals().residuals;

        X[j] = orig - h;
        setVars(X);
        const rMinus = evaluateResiduals().residuals;

        const twoH = 2.0 * h;
        for (let i = 0; i < mConstraints; i++) {
          J[i][j] = (rPlus[i] - rMinus[i]) / twoH;
        }

        X[j] = orig;
      }
      setVars(X);

      // 4. Form augmented system for Levenberg-Marquardt with QR decomposition:
      // min || [ J               ] * delta - [ -r                            ] ||^2
      //     || [ sqrt(lambda)*I  ]           [ 0                             ] ||
      //     || [ sqrt(mu)*I      ]           [ -sqrt(mu) * (X - X0)          ] ||
      const totalRows = mConstraints + 2 * nVars;
      const A_aug = Array.from({ length: totalRows }, () => new Float64Array(nVars));
      const b_aug = new Float64Array(totalRows);

      // Fill J and -r
      for (let i = 0; i < mConstraints; i++) {
        A_aug[i].set(J[i]);
        b_aug[i] = -r[i];
      }

      // Fill Levenberg damping sqrt(lambda) * I
      const sqrtLambda = Math.sqrt(lambda);
      for (let j = 0; j < nVars; j++) {
        A_aug[mConstraints + j][j] = sqrtLambda;
        b_aug[mConstraints + j] = 0;
      }

      // Fill Tikhonov regularization sqrt(mu) * I towards initial configuration X0
      const sqrtMu = Math.sqrt(mu);
      for (let j = 0; j < nVars; j++) {
        A_aug[mConstraints + nVars + j][j] = sqrtMu;
        b_aug[mConstraints + nVars + j] = -sqrtMu * (X[j] - X0[j]);
      }

      // Solve augmented system with QR Decomposition
      const qrAug = new QRDecomposition(A_aug, true);
      const delta = qrAug.solve(b_aug);

      // 5. Test step
      const X_trial = new Float64Array(nVars);
      for (let i = 0; i < nVars; i++) {
        X_trial[i] = X[i] + delta[i];
      }
      setVars(X_trial);

      const trialEval = evaluateResiduals();
      const trialError = this._normInf(trialEval.residuals);

      if (trialError < currentError) {
        // Accept step
        for (let i = 0; i < nVars; i++) X[i] = X_trial[i];
        r = trialEval.residuals;
        constraintRowMap = trialEval.constraintRowMap;
        currentError = trialError;
        lambda = Math.max(1e-9, lambda * 0.4);
      } else {
        // Reject step & increase damping
        setVars(X);
        lambda = Math.min(1e8, lambda * 5.0);
      }
    }

    setVars(X);

    // 6. Rank Evaluation & Degrees of Freedom (DOF) Analysis
    const mConstraints = r.length;
    const finalJ = Array.from({ length: mConstraints }, () => new Float64Array(nVars));
    const h = 1e-7;
    for (let j = 0; j < nVars; j++) {
      const orig = X[j];
      X[j] = orig + h;
      setVars(X);
      const rPlus = evaluateResiduals().residuals;
      X[j] = orig - h;
      setVars(X);
      const rMinus = evaluateResiduals().residuals;
      for (let i = 0; i < mConstraints; i++) {
        finalJ[i][j] = (rPlus[i] - rMinus[i]) / (2.0 * h);
      }
      X[j] = orig;
    }
    setVars(X);

    const qrJ = new QRDecomposition(finalJ, true);
    const rank = qrJ.rank;
    const dof = Math.max(0, nVars - rank);

    // 7. Over-Constrained & Conflict Diagnostics
    const converged = currentError < this.tolerance * 10;
    const diagnostics = this._diagnoseConstraints(
      constraints,
      constraintRowMap,
      r,
      finalJ,
      converged,
      this.tolerance
    );

    let status = 'under_constrained';
    const conflictDiag = diagnostics.find(d => d.type === 'conflict') || null;
    const redundantDiag = diagnostics.find(d => d.type === 'redundant') || null;

    if (!converged || conflictDiag) {
      status = 'over_constrained';
    } else if (redundantDiag) {
      status = 'over_constrained';
    } else if (dof === 0) {
      status = 'fully_constrained';
    } else {
      status = 'under_constrained';
    }

    return {
      converged,
      error: currentError,
      iterations: iter,
      dof,
      rank,
      nVars,
      nConstraints: constraints.length,
      status,
      diagnostics,
      conflict: conflictDiag,
      redundant: redundantDiag,
    };
  }

  /**
   * Prepare metadata such as initial sign of distances or angles to retain correct branch
   */
  _prepareConstraintMeta(constraints, entityMap, X0, varIndexMap) {
    const meta = new Map();
    for (const c of constraints) {
      const e1 = entityMap.get(c.entity1Id || c.entityId);
      const e2 = c.entity2Id ? entityMap.get(c.entity2Id) : null;
      if (!c.id) c.id = `c_${Math.random().toString(36).substring(2, 9)}`;

      if (c.type === CONSTRAINT_TYPES.TANGENT && e1 && e2) {
        // Line-circle or circle-circle tangent branch sign
        let line = null;
        let circle = null;
        if (e1.p1 && e1.p2 && e2.center) { line = e1; circle = e2; }
        else if (e2.p1 && e2.p2 && e1.center) { line = e2; circle = e1; }

        if (line && circle) {
          const dx = line.p2.x - line.p1.x;
          const dy = line.p2.y - line.p1.y;
          const cross = (circle.center.x - line.p1.x) * dy - (circle.center.y - line.p1.y) * dx;
          meta.set(c.id, { side: cross >= 0 ? 1 : -1 });
        }
      }
    }
    return meta;
  }

  /**
   * Evaluate all constraint residuals and return mapping of constraint -> row indices
   */
  _evaluateResidualVector(constraints, entityMap, X0, varIndexMap, constraintMeta) {
    const residuals = [];
    const constraintRowMap = new Map();

    for (const c of constraints) {
      const startRow = residuals.length;
      const e1 = entityMap.get(c.entity1Id || c.entityId);
      const e2 = c.entity2Id ? entityMap.get(c.entity2Id) : null;
      const e3 = c.entity3Id ? entityMap.get(c.entity3Id) : null;

      switch (c.type) {
        case CONSTRAINT_TYPES.COINCIDENT: {
          if (!e1 || !e2) break;
          // Point-to-point coincident
          const pt1 = c.pointIndex1 !== undefined ? c.pointIndex1 : (c.point1 !== undefined ? c.point1 : 0);
          const pt2 = c.pointIndex2 !== undefined ? c.pointIndex2 : (c.point2 !== undefined ? c.point2 : 0);
          const p1 = this._getPoint(e1, pt1);
          const p2 = this._getPoint(e2, pt2);

          if (p1 && p2) {
            residuals.push(p1.x - p2.x);
            residuals.push(p1.y - p2.y);
          } else if (p1 && e2.p1 && e2.p2) {
            // Point on line
            const dx = e2.p2.x - e2.p1.x;
            const dy = e2.p2.y - e2.p1.y;
            const len = Math.hypot(dx, dy) || 1.0;
            const dist = ((p1.x - e2.p1.x) * dy - (p1.y - e2.p1.y) * dx) / len;
            residuals.push(dist);
          } else if (p1 && e2.center && e2.radius !== undefined) {
            // Point on circle
            const dist = Math.hypot(p1.x - e2.center.x, p1.y - e2.center.y);
            residuals.push(dist - e2.radius);
          }
          break;
        }

        case CONSTRAINT_TYPES.HORIZONTAL: {
          if (e1) {
            if (e1.p1 && e1.p2) {
              residuals.push(e1.p2.y - e1.p1.y);
            } else if (e2) {
              const p1 = this._getPoint(e1, c.point1 ?? 0);
              const p2 = this._getPoint(e2, c.point2 ?? 0);
              if (p1 && p2) residuals.push(p2.y - p1.y);
            }
          }
          break;
        }

        case CONSTRAINT_TYPES.VERTICAL: {
          if (e1) {
            if (e1.p1 && e1.p2) {
              residuals.push(e1.p2.x - e1.p1.x);
            } else if (e2) {
              const p1 = this._getPoint(e1, c.point1 ?? 0);
              const p2 = this._getPoint(e2, c.point2 ?? 0);
              if (p1 && p2) residuals.push(p2.x - p1.x);
            }
          }
          break;
        }

        case CONSTRAINT_TYPES.PARALLEL: {
          if (e1 && e2 && e1.p1 && e1.p2 && e2.p1 && e2.p2) {
            const dx1 = e1.p2.x - e1.p1.x;
            const dy1 = e1.p2.y - e1.p1.y;
            const dx2 = e2.p2.x - e2.p1.x;
            const dy2 = e2.p2.y - e2.p1.y;
            const len1 = Math.hypot(dx1, dy1) || 1.0;
            const len2 = Math.hypot(dx2, dy2) || 1.0;
            // Normalized cross product
            residuals.push((dx1 * dy2 - dy1 * dx2) / (len1 * len2));
          }
          break;
        }

        case CONSTRAINT_TYPES.PERPENDICULAR: {
          if (e1 && e2 && e1.p1 && e1.p2 && e2.p1 && e2.p2) {
            const dx1 = e1.p2.x - e1.p1.x;
            const dy1 = e1.p2.y - e1.p1.y;
            const dx2 = e2.p2.x - e2.p1.x;
            const dy2 = e2.p2.y - e2.p1.y;
            const len1 = Math.hypot(dx1, dy1) || 1.0;
            const len2 = Math.hypot(dx2, dy2) || 1.0;
            // Normalized dot product
            residuals.push((dx1 * dx2 + dy1 * dy2) / (len1 * len2));
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

        case CONSTRAINT_TYPES.COLINEAR: {
          if (e1 && e2 && e1.p1 && e1.p2 && e2.p1 && e2.p2) {
            const dx1 = e1.p2.x - e1.p1.x;
            const dy1 = e1.p2.y - e1.p1.y;
            const len1 = Math.hypot(dx1, dy1) || 1.0;
            const dx2 = e2.p2.x - e2.p1.x;
            const dy2 = e2.p2.y - e2.p1.y;
            const len2 = Math.hypot(dx2, dy2) || 1.0;

            // 1. Parallel directions
            residuals.push((dx1 * dy2 - dy1 * dx2) / (len1 * len2));
            // 2. Point e2.p1 lies on line e1
            residuals.push(((e2.p1.x - e1.p1.x) * dy1 - (e2.p1.y - e1.p1.y) * dx1) / len1);
          }
          break;
        }

        case CONSTRAINT_TYPES.TANGENT: {
          if (e1 && e2) {
            let line = null;
            let circle = null;
            if (e1.p1 && e1.p2 && e2.center) { line = e1; circle = e2; }
            else if (e2.p1 && e2.p2 && e1.center) { line = e2; circle = e1; }

            if (line && circle) {
              const dx = line.p2.x - line.p1.x;
              const dy = line.p2.y - line.p1.y;
              const len = Math.hypot(dx, dy) || 1.0;
              const dist = ((circle.center.x - line.p1.x) * dy - (circle.center.y - line.p1.y) * dx) / len;
              const meta = constraintMeta.get(c.id);
              const side = meta ? meta.side : 1;
              residuals.push(dist - side * (circle.radius ?? 10));
            } else if (e1.center && e2.center) {
              // Two circles tangent
              const dist = Math.hypot(e1.center.x - e2.center.x, e1.center.y - e2.center.y);
              const r1 = e1.radius ?? 10;
              const r2 = e2.radius ?? 10;
              residuals.push(dist - (r1 + r2));
            }
          }
          break;
        }

        case CONSTRAINT_TYPES.SYMMETRIC: {
          // e1, e2 symmetric about axis line e3 (or c.axisEntityId)
          const axisLine = e3 || (c.axisId ? entityMap.get(c.axisId) : (c.axisEntityId ? entityMap.get(c.axisEntityId) : null));
          const p1 = this._getPoint(e1, c.point1 ?? 0);
          const p2 = this._getPoint(e2, c.point2 ?? 0);

          if (p1 && p2 && axisLine && axisLine.p1 && axisLine.p2) {
            const adx = axisLine.p2.x - axisLine.p1.x;
            const ady = axisLine.p2.y - axisLine.p1.y;
            const alen = Math.hypot(adx, ady) || 1.0;

            // 1. Midpoint of p1 and p2 lies on axis line
            const mx = 0.5 * (p1.x + p2.x);
            const my = 0.5 * (p1.y + p2.y);
            const distMid = ((mx - axisLine.p1.x) * ady - (my - axisLine.p1.y) * adx) / alen;
            residuals.push(distMid);

            // 2. Vector (p2 - p1) is perpendicular to axis line
            const vdx = p2.x - p1.x;
            const vdy = p2.y - p1.y;
            residuals.push((vdx * adx + vdy * ady) / alen);
          }
          break;
        }

        case CONSTRAINT_TYPES.FIX: {
          const pt1 = c.pointIndex1 !== undefined ? c.pointIndex1 : c.point1;
          // Fix entire line if no specific endpoint given
          if (pt1 === undefined && c.pointIndex2 === undefined && c.point2 === undefined && e1 && e1.p1 && e1.p2) {
            const fixP1X = c.p1x !== undefined ? c.p1x : (X0[varIndexMap.get(`${e1.id}_p1_x`)] ?? e1.p1.x);
            const fixP1Y = c.p1y !== undefined ? c.p1y : (X0[varIndexMap.get(`${e1.id}_p1_y`)] ?? e1.p1.y);
            const fixP2X = c.p2x !== undefined ? c.p2x : (X0[varIndexMap.get(`${e1.id}_p2_x`)] ?? e1.p2.x);
            const fixP2Y = c.p2y !== undefined ? c.p2y : (X0[varIndexMap.get(`${e1.id}_p2_y`)] ?? e1.p2.y);
            residuals.push(e1.p1.x - fixP1X);
            residuals.push(e1.p1.y - fixP1Y);
            residuals.push(e1.p2.x - fixP2X);
            residuals.push(e1.p2.y - fixP2Y);
          } else if (pt1 === undefined && e1 && e1.center) {
            const fixCX = c.x !== undefined ? c.x : (X0[varIndexMap.get(`${e1.id}_center_x`)] ?? e1.center.x);
            const fixCY = c.y !== undefined ? c.y : (X0[varIndexMap.get(`${e1.id}_center_y`)] ?? e1.center.y);
            residuals.push(e1.center.x - fixCX);
            residuals.push(e1.center.y - fixCY);
          } else {
            const p = this._getPoint(e1, pt1);
            if (p) {
              const ptName = (pt1 === 1 || pt1 === 'p2' || pt1 === 'end') ? 'p2' : ((pt1 === 'center') ? 'center' : 'p1');
              const x0Idx = varIndexMap.get(`${e1.id}_${ptName}_x`) ?? varIndexMap.get(`${e1.id}_x`);
              const y0Idx = varIndexMap.get(`${e1.id}_${ptName}_y`) ?? varIndexMap.get(`${e1.id}_y`);
              const fixX = c.x !== undefined ? c.x : (c.targetX ?? (x0Idx !== undefined ? X0[x0Idx] : p.x));
              const fixY = c.y !== undefined ? c.y : (c.targetY ?? (y0Idx !== undefined ? X0[y0Idx] : p.y));
              residuals.push(p.x - fixX);
              residuals.push(p.y - fixY);
            }
          }
          break;
        }

        case CONSTRAINT_TYPES.DIMENSION: {
          const targetVal = c.value ?? c.targetValue ?? 10;
          if (e1 && e2) {
            // Distance between two entities
            const p1 = this._getPoint(e1, c.point1 ?? 0);
            const p2 = this._getPoint(e2, c.point2 ?? 0);
            if (p1 && p2) {
              residuals.push(distance2D(p1, p2) - targetVal);
            } else if (p1 && e2.p1 && e2.p2) {
              // Point to line distance
              const dx = e2.p2.x - e2.p1.x;
              const dy = e2.p2.y - e2.p1.y;
              const len = Math.hypot(dx, dy) || 1.0;
              const dist = Math.abs((p1.x - e2.p1.x) * dy - (p1.y - e2.p1.y) * dx) / len;
              residuals.push(dist - targetVal);
            }
          } else if (e1) {
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

            const u1x = dx1 / len1;
            const u1y = dy1 / len1;
            const u2x = dx2 / len2;
            const u2y = dy2 / len2;

            const cosA = u1x * u2x + u1y * u2y;
            const sinA = u1x * u2y - u1y * u2x;
            const currentAngle = Math.atan2(sinA, cosA);

            const targetDeg = c.angle ?? c.value ?? 90;
            const targetRad = (targetDeg * Math.PI) / 180;

            // Angle difference wrapped to [-PI, PI]
            let diff = currentAngle - targetRad;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            residuals.push(diff);
          }
          break;
        }

        default:
          break;
      }

      const endRow = residuals.length;
      const rows = [];
      for (let rIdx = startRow; rIdx < endRow; rIdx++) rows.push(rIdx);
      constraintRowMap.set(c.id, rows);
    }

    return { residuals, constraintRowMap };
  }

  /**
   * Identify redundant constraints vs inconsistent/conflicting constraints
   */
  _diagnoseConstraints(constraints, constraintRowMap, residuals, J, converged, tol) {
    const diagnostics = [];
    const nConstraints = constraints.length;

    // 1. Conflict detection: find constraints with persistent high residual
    if (!converged) {
      const conflictingIds = [];
      for (const c of constraints) {
        const rows = constraintRowMap.get(c.id) || [];
        let maxRes = 0;
        for (const row of rows) {
          const res = Math.abs(residuals[row] || 0);
          if (res > maxRes) maxRes = res;
        }
        if (maxRes > tol * 5) {
          conflictingIds.push(c.id);
        }
      }

      if (conflictingIds.length > 0) {
        diagnostics.push({
          type: 'conflict',
          constraintIds: conflictingIds,
          message: `Inconsistent/conflicting constraints detected: ${conflictingIds.join(', ')}`,
        });
      }
    }

    // 2. Redundancy detection: check for linearly dependent constraint gradient rows
    const basis = []; // Orthonormal basis vectors
    for (let cIdx = 0; cIdx < nConstraints; cIdx++) {
      const c = constraints[cIdx];
      const rows = constraintRowMap.get(c.id) || [];
      if (rows.length === 0) continue;

      let isRedundant = true;
      for (const row of rows) {
        const grad = new Float64Array(J[row]);
        const gradNorm = Math.hypot(...grad);
        if (gradNorm < 1e-8) continue;

        // Project grad onto existing basis
        const proj = new Float64Array(grad);
        for (const b of basis) {
          let dot = 0;
          for (let k = 0; k < grad.length; k++) dot += grad[k] * b[k];
          for (let k = 0; k < grad.length; k++) proj[k] -= dot * b[k];
        }

        const projNorm = Math.hypot(...proj);
        if (projNorm > 1e-4 * gradNorm) {
          // Independent component exists
          isRedundant = false;
          // Add normalized projection to basis
          const newB = new Float64Array(proj.length);
          for (let k = 0; k < proj.length; k++) newB[k] = proj[k] / projNorm;
          basis.push(newB);
        }
      }

      // If all rows of this constraint are linearly dependent on previous constraints
      if (isRedundant && rows.length > 0) {
        let maxRes = 0;
        for (const row of rows) {
          const res = Math.abs(residuals[row] || 0);
          if (res > maxRes) maxRes = res;
        }

        if (maxRes <= tol * 10) {
          diagnostics.push({
            type: 'redundant',
            constraintIds: [c.id],
            message: `Redundant constraint detected: ${c.id} (${c.type})`,
          });
        }
      }
    }

    return diagnostics;
  }

  /**
   * Helper to resolve point reference from entity
   */
  _getPoint(entity, index) {
    if (!entity) return null;
    if (entity.x !== undefined && entity.y !== undefined && !entity.p1 && !entity.p2) return entity;
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
}

export const constraintSolver = new ConstraintSolver();
export default ConstraintSolver;