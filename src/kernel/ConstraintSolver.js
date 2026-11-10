// CADWorks Pro - 2D Geometric Constraint Solver
import { distance2D, EPSILON } from '../utils/math';
import { CONSTRAINT_TYPES } from '../utils/constants';

export class ConstraintSolver {
  constructor(maxIterations = 50, tolerance = 1e-4) {
    this.maxIterations = maxIterations;
    this.tolerance = tolerance;
  }

  /**
   * Solve constraints iteratively on sketch entities
   * @param {Array} entities - Array of sketch entities
   * @param {Array} constraints - Array of constraints
   * @returns {{ converged: boolean, error: number, iterations: number }}
   */
  solve(entities, constraints) {
    if (!constraints || constraints.length === 0) {
      return { converged: true, error: 0, iterations: 0 };
    }

    const entityMap = new Map();
    entities.forEach(e => entityMap.set(e.id, e));

    let maxError = 0;
    let iteration = 0;

    for (iteration = 0; iteration < this.maxIterations; iteration++) {
      maxError = 0;

      for (const c of constraints) {
        const err = this._applyConstraint(c, entityMap);
        if (err > maxError) maxError = err;
      }

      if (maxError < this.tolerance) {
        return { converged: true, error: maxError, iterations: iteration + 1 };
      }
    }

    return { converged: false, error: maxError, iterations: this.maxIterations };
  }

  _applyConstraint(constraint, entityMap) {
    switch (constraint.type) {
      case CONSTRAINT_TYPES.COINCIDENT: {
        const e1 = entityMap.get(constraint.entity1Id);
        const e2 = entityMap.get(constraint.entity2Id);
        if (!e1 || !e2) return 0;

        const p1 = this._getPoint(e1, constraint.pointIndex1);
        const p2 = this._getPoint(e2, constraint.pointIndex2);
        if (!p1 || !p2) return 0;

        const err = distance2D(p1, p2);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;

        if (!constraint.fixed1) { p1.x = mx; p1.y = my; }
        if (!constraint.fixed2) { p2.x = mx; p2.y = my; }
        return err;
      }

      case CONSTRAINT_TYPES.HORIZONTAL: {
        const e = entityMap.get(constraint.entityId);
        if (!e || !e.p1 || !e.p2) return 0;
        const dy = e.p2.y - e.p1.y;
        const midY = (e.p1.y + e.p2.y) / 2;
        e.p1.y = midY;
        e.p2.y = midY;
        return Math.abs(dy);
      }

      case CONSTRAINT_TYPES.VERTICAL: {
        const e = entityMap.get(constraint.entityId);
        if (!e || !e.p1 || !e.p2) return 0;
        const dx = e.p2.x - e.p1.x;
        const midX = (e.p1.x + e.p2.x) / 2;
        e.p1.x = midX;
        e.p2.x = midX;
        return Math.abs(dx);
      }

      case CONSTRAINT_TYPES.PARALLEL: {
        const e1 = entityMap.get(constraint.entity1Id);
        const e2 = entityMap.get(constraint.entity2Id);
        if (!e1 || !e2 || !e1.p1 || !e2.p1) return 0;

        const a1 = Math.atan2(e1.p2.y - e1.p1.y, e1.p2.x - e1.p1.x);
        const a2 = Math.atan2(e2.p2.y - e2.p1.y, e2.p2.x - e2.p1.x);
        const len2 = distance2D(e2.p1, e2.p2);

        // Align e2 direction to a1
        const mid2X = (e2.p1.x + e2.p2.x) / 2;
        const mid2Y = (e2.p1.y + e2.p2.y) / 2;
        const halfLen = len2 / 2;

        e2.p1.x = mid2X - halfLen * Math.cos(a1);
        e2.p1.y = mid2Y - halfLen * Math.sin(a1);
        e2.p2.x = mid2X + halfLen * Math.cos(a1);
        e2.p2.y = mid2Y + halfLen * Math.sin(a1);

        return Math.abs(a1 - a2);
      }

      case CONSTRAINT_TYPES.PERPENDICULAR: {
        const e1 = entityMap.get(constraint.entity1Id);
        const e2 = entityMap.get(constraint.entity2Id);
        if (!e1 || !e2 || !e1.p1 || !e2.p1) return 0;

        const a1 = Math.atan2(e1.p2.y - e1.p1.y, e1.p2.x - e1.p1.x);
        const targetA = a1 + Math.PI / 2;
        const len2 = distance2D(e2.p1, e2.p2);

        const mid2X = (e2.p1.x + e2.p2.x) / 2;
        const mid2Y = (e2.p1.y + e2.p2.y) / 2;
        const halfLen = len2 / 2;

        e2.p1.x = mid2X - halfLen * Math.cos(targetA);
        e2.p1.y = mid2Y - halfLen * Math.sin(targetA);
        e2.p2.x = mid2X + halfLen * Math.cos(targetA);
        e2.p2.y = mid2Y + halfLen * Math.sin(targetA);

        return 0;
      }

      case CONSTRAINT_TYPES.EQUAL: {
        const e1 = entityMap.get(constraint.entity1Id);
        const e2 = entityMap.get(constraint.entity2Id);
        if (!e1 || !e2) return 0;

        if (e1.p1 && e2.p1) {
          // Lines equal length
          const l1 = distance2D(e1.p1, e1.p2);
          const l2 = distance2D(e2.p1, e2.p2);
          const targetL = (l1 + l2) / 2;

          this._scaleLine(e1, targetL);
          this._scaleLine(e2, targetL);
          return Math.abs(l1 - l2);
        } else if (e1.radius && e2.radius) {
          // Circles/arcs equal radius
          const r = (e1.radius + e2.radius) / 2;
          const err = Math.abs(e1.radius - e2.radius);
          e1.radius = r;
          e2.radius = r;
          return err;
        }
        return 0;
      }

      case CONSTRAINT_TYPES.CONCENTRIC: {
        const e1 = entityMap.get(constraint.entity1Id);
        const e2 = entityMap.get(constraint.entity2Id);
        if (!e1 || !e2 || !e1.center || !e2.center) return 0;
        const err = distance2D(e1.center, e2.center);
        const mx = (e1.center.x + e2.center.x) / 2;
        const my = (e1.center.y + e2.center.y) / 2;
        e1.center.x = mx; e1.center.y = my;
        e2.center.x = mx; e2.center.y = my;
        return err;
      }

      case CONSTRAINT_TYPES.DIMENSION: {
        const e = entityMap.get(constraint.entityId);
        if (!e) return 0;
        const targetVal = constraint.value;

        if (e.p1 && e.p2) {
          const curLen = distance2D(e.p1, e.p2);
          this._scaleLine(e, targetVal);
          return Math.abs(curLen - targetVal);
        } else if (e.radius !== undefined) {
          const curR = e.radius;
          e.radius = targetVal;
          return Math.abs(curR - targetVal);
        }
        return 0;
      }

      default:
        return 0;
    }
  }

  _getPoint(entity, index) {
    if (index === 0 && entity.p1) return entity.p1;
    if (index === 1 && entity.p2) return entity.p2;
    if (entity.center) return entity.center;
    return entity.p1 || null;
  }

  _scaleLine(line, targetLength) {
    const curLen = distance2D(line.p1, line.p2);
    if (curLen < EPSILON) return;
    const midX = (line.p1.x + line.p2.x) / 2;
    const midY = (line.p1.y + line.p2.y) / 2;
    const angle = Math.atan2(line.p2.y - line.p1.y, line.p2.x - line.p1.x);
    const half = targetLength / 2;

    line.p1.x = midX - half * Math.cos(angle);
    line.p1.y = midY - half * Math.sin(angle);
    line.p2.x = midX + half * Math.cos(angle);
    line.p2.y = midY + half * Math.sin(angle);
  }
}

export const constraintSolver = new ConstraintSolver();
export default ConstraintSolver;
