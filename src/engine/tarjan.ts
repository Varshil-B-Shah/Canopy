import type { DependencyGraph, SCCCluster } from './types'

interface TarjanState {
  disc: Record<string, number>
  low: Record<string, number>
  onStack: Record<string, boolean>
  stack: string[]
  timer: number
  sccs: string[][]
}

// Tarjan's Strongly Connected Components algorithm.
// O(V + E) time complexity. Single DFS pass.
// Returns: array of SCCs (each SCC is an array of node IDs).
// SCCs are returned in reverse topological order.
export function tarjanSCC(graph: DependencyGraph): SCCCluster[] {
  const nodeIds = Object.keys(graph.nodes)
  if (nodeIds.length === 0) return []

  const state: TarjanState = {
    disc: {},
    low: {},
    onStack: {},
    stack: [],
    timer: 0,
    sccs: [],
  }

  // Iterative DFS implementation to avoid call stack overflow on deep graphs
  function dfs(startId: string): void {
    // Explicit stack: each frame holds [nodeId, neighborIndex]
    const callStack: Array<{ id: string; neighborIdx: number }> = []
    callStack.push({ id: startId, neighborIdx: 0 })

    state.disc[startId] = state.low[startId] = state.timer++
    state.onStack[startId] = true
    state.stack.push(startId)

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1]
      const { id } = frame
      const neighbors = graph.adjacencyList[id] ?? []

      if (frame.neighborIdx < neighbors.length) {
        const neighborId = neighbors[frame.neighborIdx]
        frame.neighborIdx++

        if (state.disc[neighborId] === undefined) {
          // Tree edge — recurse into neighbor
          state.disc[neighborId] = state.low[neighborId] = state.timer++
          state.onStack[neighborId] = true
          state.stack.push(neighborId)
          callStack.push({ id: neighborId, neighborIdx: 0 })
        } else if (state.onStack[neighborId]) {
          // Back edge — neighbor is an ancestor on the stack (cycle!)
          state.low[id] = Math.min(state.low[id], state.disc[neighborId])
        }
      } else {
        // Done with all neighbors — pop this frame
        callStack.pop()

        if (callStack.length > 0) {
          const parentFrame = callStack[callStack.length - 1]
          const parentId = parentFrame.id
          // Update parent's low value
          state.low[parentId] = Math.min(state.low[parentId], state.low[id])
        }

        // Check if this node is an SCC root
        if (state.low[id] === state.disc[id]) {
          const scc: string[] = []
          let popped: string
          do {
            popped = state.stack.pop()!
            state.onStack[popped] = false
            scc.push(popped)
          } while (popped !== id)
          state.sccs.push(scc)
        }
      }
    }
  }

  // Run DFS from every unvisited node
  for (const nodeId of nodeIds) {
    if (state.disc[nodeId] === undefined) {
      dfs(nodeId)
    }
  }

  // Convert raw SCCs to SCCCluster objects
  const clusters: SCCCluster[] = []
  let clusterId = 0

  for (const scc of state.sccs) {
    if (scc.length > 1) {
      // Find cycle edges within this SCC
      const memberSet = new Set(scc)
      const cycleEdges: string[][] = []
      for (const memberId of scc) {
        for (const neighborId of (graph.adjacencyList[memberId] ?? [])) {
          if (memberSet.has(neighborId)) {
            cycleEdges.push([memberId, neighborId])
          }
        }
      }

      clusters.push({
        id: clusterId,
        members: scc,
        cycleEdges,
      })
      clusterId++
    }
  }

  return clusters
}

// Assigns SCC IDs to nodes in the graph.
// Nodes in a single-member SCC (no cycle) get sccId = -1.
export function assignSCCIds(
  graph: DependencyGraph,
  clusters: SCCCluster[],
): void {
  // Reset all sccIds
  for (const node of Object.values(graph.nodes)) {
    node.sccId = -1
  }

  for (const cluster of clusters) {
    for (const memberId of cluster.members) {
      if (graph.nodes[memberId]) {
        graph.nodes[memberId].sccId = cluster.id
      }
    }
  }

  // Mark circular edges
  for (const cluster of clusters) {
    const memberSet = new Set(cluster.members)
    for (const edge of graph.edges) {
      if (memberSet.has(edge.from) && memberSet.has(edge.to)) {
        edge.isCircular = true
      }
    }
  }
}

// Builds the condensation graph: a DAG where each node is an SCC.
// Each SCC is represented by its lowest-ID member.
export function buildCondensationGraph(
  graph: DependencyGraph,
  clusters: SCCCluster[],
): {
  condensedAdj: Record<string, Set<string>>
  nodeToSCC: Record<string, string>
} {
  // Map each node to its SCC representative
  const nodeToSCC: Record<string, string> = {}

  // Single-member nodes map to themselves
  for (const nodeId of Object.keys(graph.nodes)) {
    nodeToSCC[nodeId] = nodeId
  }

  // Multi-member nodes map to the first member (alphabetically)
  for (const cluster of clusters) {
    const representative = cluster.members.slice().sort()[0]
    for (const memberId of cluster.members) {
      nodeToSCC[memberId] = representative
    }
  }

  // Build condensed adjacency list
  const condensedAdj: Record<string, Set<string>> = {}
  for (const rep of new Set(Object.values(nodeToSCC))) {
    condensedAdj[rep] = new Set()
  }

  for (const edge of graph.edges) {
    const fromRep = nodeToSCC[edge.from]
    const toRep = nodeToSCC[edge.to]
    if (fromRep !== toRep) {
      condensedAdj[fromRep].add(toRep)
    }
  }

  return { condensedAdj, nodeToSCC }
}
