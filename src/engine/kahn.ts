import type { DependencyGraph } from './types'
import { buildCondensationGraph, tarjanSCC, assignSCCIds } from './tarjan'

// Kahn's BFS-based topological sort on the condensation graph.
// Returns a map of nodeId → buildLayer (0 = no dependencies).
// All members of an SCC cluster get the same build layer.
export function kahnTopologicalSort(
  graph: DependencyGraph,
): {
  layers: Record<string, number>
  maxLayer: number
  orphanNodes: string[]   // nodes that couldn't be sorted (indicates unresolved cycle)
} {
  // First run Tarjan's to build condensation
  const clusters = tarjanSCC(graph)
  assignSCCIds(graph, clusters)
  const { condensedAdj, nodeToSCC } = buildCondensationGraph(graph, clusters)

  const representatives = Object.keys(condensedAdj)

  // Compute in-degree for each representative in the condensed graph
  const inDegree: Record<string, number> = {}
  for (const rep of representatives) {
    inDegree[rep] = 0
  }
  for (const rep of representatives) {
    for (const neighbor of condensedAdj[rep]) {
      inDegree[neighbor] = (inDegree[neighbor] ?? 0) + 1
    }
  }

  // BFS starting from all nodes with in-degree 0
  const queue: string[] = representatives.filter(r => inDegree[r] === 0)
  const repLayer: Record<string, number> = {}
  for (const rep of queue) {
    repLayer[rep] = 0
  }

  let processedCount = 0

  while (queue.length > 0) {
    const current = queue.shift()!
    processedCount++

    for (const neighbor of condensedAdj[current]) {
      inDegree[neighbor]--
      const newLayer = (repLayer[current] ?? 0) + 1
      repLayer[neighbor] = Math.max(repLayer[neighbor] ?? 0, newLayer)

      if (inDegree[neighbor] === 0) {
        queue.push(neighbor)
      }
    }
  }

  // Detect nodes that couldn't be sorted (cycle in condensation — shouldn't happen)
  const orphanNodes = representatives.filter(r => repLayer[r] === undefined)
  for (const orphan of orphanNodes) {
    repLayer[orphan] = -1
  }

  // Expand representative layers back to all original nodes
  const layers: Record<string, number> = {}
  for (const nodeId of Object.keys(graph.nodes)) {
    const rep = nodeToSCC[nodeId]
    layers[nodeId] = repLayer[rep] ?? 0
  }

  const maxLayer = Math.max(0, ...Object.values(layers).filter(l => l >= 0))

  return { layers, maxLayer, orphanNodes }
}

// Assigns buildLayer to every node in the graph
export function assignBuildLayers(graph: DependencyGraph): void {
  const { layers, maxLayer } = kahnTopologicalSort(graph)

  for (const [nodeId, layer] of Object.entries(layers)) {
    if (graph.nodes[nodeId]) {
      graph.nodes[nodeId].buildLayer = layer
    }
  }

  graph.metadata.criticalPathLength = maxLayer
}
