import type {
  PackageNode,
  DependencyEdge,
  DependencyGraph,
  Ecosystem,
} from './types'

// Creates an empty PackageNode with all defaults
export function createNode(
  id: string,
  name: string,
  ecosystem: Ecosystem,
  declaredVersion: string,
  resolvedVersion: string,
  isRoot = false,
  license = 'UNKNOWN',
): PackageNode {
  return {
    id,
    name,
    ecosystem,
    declaredVersion,
    resolvedVersion,
    license,
    isRoot,
    merkleHash: '',
    sccId: -1,
    buildLayer: -1,
    bloomFilter: new Uint8Array(128),
    hasVersionConflict: false,
    isGhostDependency: false,
    hasLicenseConflict: false,
    conflictDetails: [],
  }
}

// Generates a stable node ID from name + ecosystem
export function nodeId(name: string, ecosystem: Ecosystem): string {
  return `${ecosystem}:${name}`
}

// Creates an empty DependencyGraph
export function createGraph(rootId: string): DependencyGraph {
  return {
    nodes: {},
    edges: [],
    adjacencyList: {},
    reverseAdjacency: {},
    rootId,
    metadata: {
      scannedAt: new Date().toISOString(),
      ecosystems: [],
      totalPackages: 0,
      totalEdges: 0,
      maxDepth: 0,
      criticalPathLength: 0,
      sccClusters: [],
      versionConflicts: [],
      ghostDependencies: [],
      licenseConflicts: [],
    },
  }
}

// Adds a node to the graph (idempotent — skips if already present)
export function addNode(graph: DependencyGraph, node: PackageNode): void {
  if (!graph.nodes[node.id]) {
    graph.nodes[node.id] = node
    graph.adjacencyList[node.id] = []
    graph.reverseAdjacency[node.id] = []
  }
}

// Adds a directed edge from → to
export function addEdge(
  graph: DependencyGraph,
  edge: DependencyEdge,
): void {
  graph.edges.push(edge)
  if (!graph.adjacencyList[edge.from]) graph.adjacencyList[edge.from] = []
  if (!graph.reverseAdjacency[edge.to]) graph.reverseAdjacency[edge.to] = []
  if (!graph.adjacencyList[edge.from].includes(edge.to)) {
    graph.adjacencyList[edge.from].push(edge.to)
  }
  if (!graph.reverseAdjacency[edge.to].includes(edge.from)) {
    graph.reverseAdjacency[edge.to].push(edge.from)
  }
}

// BFS from a start node — returns all reachable node IDs
export function bfsReachable(
  graph: DependencyGraph,
  startId: string,
): string[] {
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const neighbor of (graph.adjacencyList[current] ?? [])) {
      if (!visited.has(neighbor)) queue.push(neighbor)
    }
  }
  return [...visited]
}

// DFS from a start node collecting the path — used for license conflict detection
export function dfsAllPaths(
  graph: DependencyGraph,
  startId: string,
  targetId: string,
  maxDepth = 20,
): string[][] {
  const results: string[][] = []

  function dfs(currentId: string, path: string[], depth: number): void {
    if (depth > maxDepth) return
    if (currentId === targetId && path.length > 0) {
      results.push([...path, currentId])
      return
    }
    if (path.includes(currentId)) return  // cycle guard
    for (const neighbor of (graph.adjacencyList[currentId] ?? [])) {
      dfs(neighbor, [...path, currentId], depth + 1)
    }
  }

  dfs(startId, [], 0)
  return results
}

// Returns total node count
export function nodeCount(graph: DependencyGraph): number {
  return Object.keys(graph.nodes).length
}

// Returns all node IDs sorted alphabetically — used for deterministic Merkle hashing
export function sortedNodeIds(graph: DependencyGraph): string[] {
  return Object.keys(graph.nodes).sort()
}
