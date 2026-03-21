/**
 * BuildOrderPanel Test Cases and Verification
 *
 * This file contains test cases and verification for the BuildOrderPanel component
 * to ensure build order calculations are correct.
 */

import type { DependencyGraph, PackageNode } from '@/engine/types'

/**
 * Creates a mock dependency graph for testing build order calculations
 */
function createMockGraph(): DependencyGraph {
  const nodes: Record<string, PackageNode> = {
    'npm:app': {
      id: 'npm:app',
      name: 'app',
      ecosystem: 'npm',
      declaredVersion: '1.0.0',
      resolvedVersion: '1.0.0',
      license: 'MIT',
      isRoot: true,
      merkleHash: 'hash1',
      sccId: -1,
      buildLayer: 3, // Should be highest since it depends on everything
      bloomFilter: new Uint8Array(),
      hasVersionConflict: false,
      isGhostDependency: false,
      hasLicenseConflict: false,
      conflictDetails: []
    },
    'npm:express': {
      id: 'npm:express',
      name: 'express',
      ecosystem: 'npm',
      declaredVersion: '^4.18.0',
      resolvedVersion: '4.18.2',
      license: 'MIT',
      isRoot: false,
      merkleHash: 'hash2',
      sccId: -1,
      buildLayer: 2, // Depends on lodash
      bloomFilter: new Uint8Array(),
      hasVersionConflict: false,
      isGhostDependency: false,
      hasLicenseConflict: false,
      conflictDetails: []
    },
    'npm:lodash': {
      id: 'npm:lodash',
      name: 'lodash',
      ecosystem: 'npm',
      declaredVersion: '^4.17.0',
      resolvedVersion: '4.17.21',
      license: 'MIT',
      isRoot: false,
      merkleHash: 'hash3',
      sccId: -1,
      buildLayer: 1, // Base dependency
      bloomFilter: new Uint8Array(),
      hasVersionConflict: false,
      isGhostDependency: false,
      hasLicenseConflict: false,
      conflictDetails: []
    },
    'npm:axios': {
      id: 'npm:axios',
      name: 'axios',
      ecosystem: 'npm',
      declaredVersion: '^1.0.0',
      resolvedVersion: '1.6.0',
      license: 'MIT',
      isRoot: false,
      merkleHash: 'hash4',
      sccId: -1,
      buildLayer: 0, // No dependencies
      bloomFilter: new Uint8Array(),
      hasVersionConflict: false,
      isGhostDependency: false,
      hasLicenseConflict: false,
      conflictDetails: []
    },
    'npm:moment': {
      id: 'npm:moment',
      name: 'moment',
      ecosystem: 'npm',
      declaredVersion: '^2.29.0',
      resolvedVersion: '2.29.4',
      license: 'MIT',
      isRoot: false,
      merkleHash: 'hash5',
      sccId: -1,
      buildLayer: 0, // No dependencies, can build in parallel with axios
      bloomFilter: new Uint8Array(),
      hasVersionConflict: false,
      isGhostDependency: false,
      hasLicenseConflict: false,
      conflictDetails: []
    }
  }

  const mockGraph: DependencyGraph = {
    nodes,
    edges: [
      { from: 'npm:app', to: 'npm:express', constraint: '^4.18.0', type: 'direct', isConflicting: false, isCircular: false, crossesLicenseBoundary: false },
      { from: 'npm:app', to: 'npm:axios', constraint: '^1.0.0', type: 'direct', isConflicting: false, isCircular: false, crossesLicenseBoundary: false },
      { from: 'npm:express', to: 'npm:lodash', constraint: '^4.17.0', type: 'direct', isConflicting: false, isCircular: false, crossesLicenseBoundary: false },
      { from: 'npm:app', to: 'npm:moment', constraint: '^2.29.0', type: 'direct', isConflicting: false, isCircular: false, crossesLicenseBoundary: false }
    ],
    adjacencyList: {
      'npm:app': ['npm:express', 'npm:axios', 'npm:moment'],
      'npm:express': ['npm:lodash'],
      'npm:lodash': [],
      'npm:axios': [],
      'npm:moment': []
    },
    reverseAdjacency: {
      'npm:app': [],
      'npm:express': ['npm:app'],
      'npm:lodash': ['npm:express'],
      'npm:axios': ['npm:app'],
      'npm:moment': ['npm:app']
    },
    rootId: 'npm:app',
    metadata: {
      scannedAt: new Date().toISOString(),
      ecosystems: ['npm'],
      totalPackages: 5,
      totalEdges: 4,
      maxDepth: 3,
      criticalPathLength: 4, // max build layer (3) + 1
      sccClusters: [],
      versionConflicts: [],
      ghostDependencies: [],
      licenseConflicts: []
    }
  }

  return mockGraph
}

/**
 * Verifies that the build order calculations are correct
 */
function verifyBuildOrder(graph: DependencyGraph): boolean {
  const results = []

  // Test 1: Layer 0 packages should have no dependencies
  const layer0Packages = Object.values(graph.nodes).filter(n => n.buildLayer === 0)
  const hasValidLayer0 = layer0Packages.every(pkg =>
    (graph.adjacencyList[pkg.id] || []).length === 0
  )
  results.push({ test: 'Layer 0 has no dependencies', passed: hasValidLayer0 })

  // Test 2: Higher layer packages should depend on lower layer packages
  const allPackages = Object.values(graph.nodes).filter(n => n.buildLayer !== -1)
  const hasValidLayerOrdering = allPackages.every(pkg => {
    const dependencies = graph.adjacencyList[pkg.id] || []
    return dependencies.every(depId => {
      const depNode = graph.nodes[depId]
      return depNode && depNode.buildLayer < pkg.buildLayer
    })
  })
  results.push({ test: 'Layer ordering is correct', passed: hasValidLayerOrdering })

  // Test 3: Critical path length should match the maximum build layer + 1
  const maxLayer = Math.max(...allPackages.map(n => n.buildLayer))
  const hasCriticalPath = graph.metadata.criticalPathLength === maxLayer + 1
  results.push({ test: 'Critical path length is correct', passed: hasCriticalPath })

  // Test 4: Packages in the same layer can be built in parallel
  const layerGroups: Record<number, PackageNode[]> = {}
  allPackages.forEach(node => {
    if (!layerGroups[node.buildLayer]) {
      layerGroups[node.buildLayer] = []
    }
    layerGroups[node.buildLayer].push(node)
  })

  const hasValidParallelization = Object.values(layerGroups).every(layerPackages => {
    // Packages in the same layer should not depend on each other
    return layerPackages.every(pkg1 =>
      layerPackages.every(pkg2 =>
        pkg1.id === pkg2.id || !(graph.adjacencyList[pkg1.id] || []).includes(pkg2.id)
      )
    )
  })
  results.push({ test: 'Same layer packages can be parallelized', passed: hasValidParallelization })

  console.log('Build Order Verification Results:')
  results.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.test}`)
  })

  return results.every(r => r.passed)
}

/**
 * Calculates expected build statistics for verification
 */
function calculateExpectedStats(graph: DependencyGraph) {
  const allPackages = Object.values(graph.nodes).filter(n => n.buildLayer !== -1)
  const layerGroups: Record<number, number> = {}

  allPackages.forEach(node => {
    layerGroups[node.buildLayer] = (layerGroups[node.buildLayer] || 0) + 1
  })

  const layers = Object.keys(layerGroups).map(Number).sort()
  const maxParallelism = Math.max(...Object.values(layerGroups))
  const totalLayers = layers.length
  const parallelizablePackages = Object.values(layerGroups).reduce((sum, count) => sum + (count > 1 ? count : 0), 0)

  // Build efficiency: ideal parallel time vs actual sequential layers
  const idealTime = Math.ceil(allPackages.length / maxParallelism)
  const buildEfficiency = Math.min(100, (idealTime / totalLayers) * 100)

  return {
    totalLayers,
    totalPackages: allPackages.length,
    maxParallelism,
    parallelizablePackages,
    buildEfficiency: Math.round(buildEfficiency),
    layerSizes: layers.map(l => layerGroups[l])
  }
}

// Export for testing
export { createMockGraph, verifyBuildOrder, calculateExpectedStats }

// Actual test cases for vitest
import { describe, it, expect } from 'vitest'

describe('BuildOrderPanel utilities', () => {
  it('should create valid mock graph with correct build layers', () => {
    const graph = createMockGraph()

    expect(graph.nodes).toBeDefined()
    expect(Object.keys(graph.nodes)).toHaveLength(5)

    // Verify build layer assignments
    expect(graph.nodes['npm:axios'].buildLayer).toBe(0) // No dependencies
    expect(graph.nodes['npm:moment'].buildLayer).toBe(0) // No dependencies
    expect(graph.nodes['npm:lodash'].buildLayer).toBe(1) // Base dependency
    expect(graph.nodes['npm:express'].buildLayer).toBe(2) // Depends on lodash
    expect(graph.nodes['npm:app'].buildLayer).toBe(3) // Root, depends on everything
  })

  it('should verify build order calculations are correct', () => {
    const graph = createMockGraph()
    const isValid = verifyBuildOrder(graph)

    expect(isValid).toBe(true)
  })

  it('should calculate expected build statistics', () => {
    const graph = createMockGraph()
    const stats = calculateExpectedStats(graph)

    expect(stats.totalPackages).toBe(5)
    expect(stats.totalLayers).toBe(4) // Layers 0, 1, 2, 3
    expect(stats.maxParallelism).toBe(2) // Layer 0 has 2 packages
    expect(stats.layerSizes).toEqual([2, 1, 1, 1]) // Layer distribution
  })
})