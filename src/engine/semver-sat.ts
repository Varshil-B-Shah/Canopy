import semver from 'semver'
import type {
  DependencyGraph,
  ConflictDetail,
  ConstraintSource,
} from './types'

// Represents a half-open semver interval [lower, upper)
// If upperInclusive is true, the interval is [lower, upper]
interface SemverInterval {
  lower: string | null       // null = -∞ (no lower bound)
  upper: string | null       // null = +∞ (no upper bound)
  lowerInclusive: boolean
  upperInclusive: boolean
}

// Normalises a semver range string to a list of intervals (union form).
// "^4.18.0" → [{ lower: "4.18.0", upper: "5.0.0", lowerInclusive: true, upperInclusive: false }]
// ">=1.0.0 <2.0.0 || >=3.0.0" → two intervals
function rangeToIntervals(rangeStr: string): SemverInterval[] {
  if (!rangeStr || rangeStr === '*' || rangeStr === '') {
    return [{ lower: null, upper: null, lowerInclusive: true, upperInclusive: true }]
  }

  // Use semver library to get the min version satisfying the range
  // This handles ^ ~ >= <= exact version etc.
  try {
    const range = new semver.Range(rangeStr)
    const intervals: SemverInterval[] = []

    // semver.Range has a .set property: array of comparator sets (OR groups)
    for (const comparatorSet of range.set) {
      let lower: string | null = null
      let upper: string | null = null
      let lowerInclusive = true
      let upperInclusive = false

      for (const comparator of comparatorSet) {
        const op = comparator.operator
        const ver = comparator.semver?.version ?? null

        if (!ver || ver === '') continue

        if (op === '>=' || op === '') {
          lower = ver
          lowerInclusive = true
        } else if (op === '>') {
          lower = ver
          lowerInclusive = false
        } else if (op === '<') {
          upper = ver
          upperInclusive = false
        } else if (op === '<=') {
          upper = ver
          upperInclusive = true
        } else if (op === '=') {
          lower = ver
          upper = ver
          lowerInclusive = true
          upperInclusive = true
        }
      }

      intervals.push({ lower, upper, lowerInclusive, upperInclusive })
    }

    return intervals.length > 0
      ? intervals
      : [{ lower: null, upper: null, lowerInclusive: true, upperInclusive: true }]
  } catch {
    // Unparseable range — treat as wildcard
    return [{ lower: null, upper: null, lowerInclusive: true, upperInclusive: true }]
  }
}

// Intersects two intervals. Returns null if intersection is empty.
function intersectIntervals(
  a: SemverInterval,
  b: SemverInterval,
): SemverInterval | null {
  // Compute lower bound = max(a.lower, b.lower)
  let lower: string | null
  let lowerInclusive: boolean

  if (a.lower === null && b.lower === null) {
    lower = null
    lowerInclusive = true
  } else if (a.lower === null) {
    lower = b.lower
    lowerInclusive = b.lowerInclusive
  } else if (b.lower === null) {
    lower = a.lower
    lowerInclusive = a.lowerInclusive
  } else {
    const cmp = semver.compare(a.lower, b.lower)
    if (cmp > 0) {
      lower = a.lower
      lowerInclusive = a.lowerInclusive
    } else if (cmp < 0) {
      lower = b.lower
      lowerInclusive = b.lowerInclusive
    } else {
      lower = a.lower
      lowerInclusive = a.lowerInclusive && b.lowerInclusive
    }
  }

  // Compute upper bound = min(a.upper, b.upper)
  let upper: string | null
  let upperInclusive: boolean

  if (a.upper === null && b.upper === null) {
    upper = null
    upperInclusive = true
  } else if (a.upper === null) {
    upper = b.upper
    upperInclusive = b.upperInclusive
  } else if (b.upper === null) {
    upper = a.upper
    upperInclusive = a.upperInclusive
  } else {
    const cmp = semver.compare(a.upper, b.upper)
    if (cmp < 0) {
      upper = a.upper
      upperInclusive = a.upperInclusive
    } else if (cmp > 0) {
      upper = b.upper
      upperInclusive = b.upperInclusive
    } else {
      upper = a.upper
      upperInclusive = a.upperInclusive && b.upperInclusive
    }
  }

  // Check if intersection is empty: lower > upper
  if (lower !== null && upper !== null) {
    const cmp = semver.compare(lower, upper)
    if (cmp > 0) return null
    if (cmp === 0 && (!lowerInclusive || !upperInclusive)) return null
  }

  return { lower, upper, lowerInclusive, upperInclusive }
}

// Intersects two lists of intervals (handles OR conditions).
// intersect(A ∪ B, C ∪ D) = (A∩C) ∪ (A∩D) ∪ (B∩C) ∪ (B∩D)
function intersectIntervalLists(
  listA: SemverInterval[],
  listB: SemverInterval[],
): SemverInterval[] {
  const result: SemverInterval[] = []
  for (const a of listA) {
    for (const b of listB) {
      const intersection = intersectIntervals(a, b)
      if (intersection !== null) {
        result.push(intersection)
      }
    }
  }
  return result
}

// Formats an interval list back to a human-readable range string
function intervalsToString(intervals: SemverInterval[]): string | null {
  if (intervals.length === 0) return null
  return intervals
    .map(iv => {
      if (iv.lower === null && iv.upper === null) return '*'
      const parts: string[] = []
      if (iv.lower !== null) {
        parts.push(`${iv.lowerInclusive ? '>=' : '>'}${iv.lower}`)
      }
      if (iv.upper !== null) {
        parts.push(`${iv.upperInclusive ? '<=' : '<'}${iv.upper}`)
      }
      return parts.join(' ')
    })
    .join(' || ')
}

// Main conflict detector.
// For every package that is required by more than one package,
// compute the intersection of all constraints.
// If intersection is empty → conflict.
export function detectVersionConflicts(
  graph: DependencyGraph,
): ConflictDetail[] {
  // Collect all constraints per target package
  const constraintMap: Record<string, ConstraintSource[]> = {}

  for (const edge of graph.edges) {
    if (!edge.constraint) continue
    if (!constraintMap[edge.to]) constraintMap[edge.to] = []
    constraintMap[edge.to].push({
      imposedBy: edge.from,
      constraint: edge.constraint,
    })
  }

  const conflicts: ConflictDetail[] = []

  for (const [packageId, sources] of Object.entries(constraintMap)) {
    if (sources.length < 2) continue  // Only one constraint — no conflict possible

    // Compute intersection of all constraints
    let currentIntervals = rangeToIntervals(sources[0].constraint)

    for (let i = 1; i < sources.length; i++) {
      const nextIntervals = rangeToIntervals(sources[i].constraint)
      currentIntervals = intersectIntervalLists(currentIntervals, nextIntervals)
      if (currentIntervals.length === 0) break  // Empty = conflict found
    }

    if (currentIntervals.length === 0) {
      conflicts.push({
        packageName: graph.nodes[packageId]?.name ?? packageId,
        constraints: sources,
        intersection: null,
        severity: 'error',
      })

      // Mark the node and edges as conflicting
      if (graph.nodes[packageId]) {
        graph.nodes[packageId].hasVersionConflict = true
        graph.nodes[packageId].conflictDetails.push({
          packageName: graph.nodes[packageId].name,
          constraints: sources,
          intersection: null,
          severity: 'error',
        })
      }
      for (const edge of graph.edges) {
        if (edge.to === packageId) edge.isConflicting = true
      }
    } else {
      // Non-empty intersection — check if it's a near-conflict (warning)
      const compatibleRange = intervalsToString(currentIntervals)
      const node = graph.nodes[packageId]

      // If the compatible range is very narrow (exact version), flag as warning
      if (
        compatibleRange &&
        currentIntervals.length === 1 &&
        currentIntervals[0].lower === currentIntervals[0].upper &&
        currentIntervals[0].lower !== null
      ) {
        conflicts.push({
          packageName: node?.name ?? packageId,
          constraints: sources,
          intersection: compatibleRange,
          severity: 'warning',
        })
      }
    }
  }

  return conflicts
}
