import type { DependencyGraph, LicenseConflict } from './types'

// License compatibility matrix.
// matrix[dependent][dependency] = compatibility
// true = compatible, false = incompatible, 'warn' = compatible with restrictions
type Compat = true | false | 'warn'

const COMPAT_MATRIX: Record<string, Record<string, Compat>> = {
  'MIT': {
    'MIT': true, 'ISC': true, 'BSD-2-Clause': true, 'BSD-3-Clause': true,
    'Apache-2.0': true, 'LGPL-2.1': 'warn', 'LGPL-3.0': 'warn',
    'GPL-2.0': false, 'GPL-3.0': false, 'AGPL-3.0': false,
  },
  'Apache-2.0': {
    'MIT': true, 'ISC': true, 'BSD-2-Clause': true, 'BSD-3-Clause': true,
    'Apache-2.0': true, 'LGPL-2.1': 'warn', 'LGPL-3.0': 'warn',
    'GPL-2.0': false, 'GPL-3.0': false, 'AGPL-3.0': false,
  },
  'BSD-2-Clause': {
    'MIT': true, 'ISC': true, 'BSD-2-Clause': true, 'BSD-3-Clause': true,
    'Apache-2.0': true, 'LGPL-2.1': 'warn', 'LGPL-3.0': 'warn',
    'GPL-2.0': false, 'GPL-3.0': false, 'AGPL-3.0': false,
  },
  'BSD-3-Clause': {
    'MIT': true, 'ISC': true, 'BSD-2-Clause': true, 'BSD-3-Clause': true,
    'Apache-2.0': true, 'LGPL-2.1': 'warn', 'LGPL-3.0': 'warn',
    'GPL-2.0': false, 'GPL-3.0': false, 'AGPL-3.0': false,
  },
  'LGPL-2.1': {
    'MIT': true, 'ISC': true, 'BSD-2-Clause': true, 'BSD-3-Clause': true,
    'Apache-2.0': true, 'LGPL-2.1': true, 'LGPL-3.0': true,
    'GPL-2.0': true, 'GPL-3.0': true, 'AGPL-3.0': true,
  },
  'GPL-2.0': {
    'MIT': true, 'ISC': true, 'BSD-2-Clause': true, 'BSD-3-Clause': true,
    'Apache-2.0': false, 'LGPL-2.1': true, 'LGPL-3.0': false,
    'GPL-2.0': true, 'GPL-3.0': false, 'AGPL-3.0': false,
  },
  'GPL-3.0': {
    'MIT': true, 'ISC': true, 'BSD-2-Clause': true, 'BSD-3-Clause': true,
    'Apache-2.0': true, 'LGPL-2.1': true, 'LGPL-3.0': true,
    'GPL-2.0': true, 'GPL-3.0': true, 'AGPL-3.0': true,
  },
}

// Normalize common license string variations to SPDX identifiers
export function normalizeLicense(raw: string | undefined): string {
  if (!raw) return 'UNKNOWN'
  const s = raw.trim()
  const map: Record<string, string> = {
    'MIT License': 'MIT',
    'MIT license': 'MIT',
    'Apache 2.0': 'Apache-2.0',
    'Apache-2': 'Apache-2.0',
    'Apache License 2.0': 'Apache-2.0',
    'ISC License': 'ISC',
    'BSD': 'BSD-2-Clause',
    '2-Clause BSD License': 'BSD-2-Clause',
    '3-Clause BSD License': 'BSD-3-Clause',
    'GNU GPL v3': 'GPL-3.0',
    'GPLv3': 'GPL-3.0',
    'GPL-3': 'GPL-3.0',
    'GPL v2': 'GPL-2.0',
    'GPLv2': 'GPL-2.0',
  }
  return map[s] ?? s
}

// Checks compatibility between a dependent's license and a dependency's license.
// Returns 'ok', 'warn', or 'error'
function checkCompatibility(
  dependentLicense: string,
  dependencyLicense: string,
): 'ok' | 'warn' | 'error' {
  if (dependencyLicense === 'UNKNOWN') return 'warn'
  if (dependentLicense === 'UNKNOWN') return 'warn'

  const depMatrix = COMPAT_MATRIX[dependentLicense]
  if (!depMatrix) return 'warn'  // Unknown dependent license

  const compat = depMatrix[dependencyLicense]
  if (compat === undefined) return 'warn'  // Unknown dependency license
  if (compat === false) return 'error'
  if (compat === 'warn') return 'warn'
  return 'ok'
}

// Detects license conflicts across the full dependency graph using DFS.
export function detectLicenseConflicts(
  graph: DependencyGraph,
): LicenseConflict[] {
  const conflicts: LicenseConflict[] = []
  const rootLicense = graph.nodes[graph.rootId]?.license ?? 'MIT'

  // DFS to check all paths from root
  function dfs(nodeId: string, pathSoFar: string[], visited: Set<string>): void {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const node = graph.nodes[nodeId]
    if (!node) return

    // Check compatibility of root license with this node's license
    if (nodeId !== graph.rootId && pathSoFar.length > 0) {
      const compat = checkCompatibility(rootLicense, node.license)
      if (compat === 'error' || compat === 'warn') {
        const conflict: LicenseConflict = {
          packageName: node.name,
          license: node.license,
          path: [...pathSoFar, nodeId],
          severity: compat === 'error' ? 'error' : 'warning',
        }
        conflicts.push(conflict)

        // Mark the node
        graph.nodes[nodeId].hasLicenseConflict = true

        // Mark edges on the conflict path
        for (let i = 0; i < pathSoFar.length - 1; i++) {
          const from = pathSoFar[i]
          const to = pathSoFar[i + 1]
          for (const edge of graph.edges) {
            if (edge.from === from && edge.to === to) {
              edge.crossesLicenseBoundary = true
            }
          }
        }

        return  // Don't descend further into a conflicting branch
      }
    }

    for (const childId of (graph.adjacencyList[nodeId] ?? [])) {
      dfs(childId, [...pathSoFar, nodeId], new Set(visited))
    }
  }

  dfs(graph.rootId, [], new Set())
  return conflicts
}
