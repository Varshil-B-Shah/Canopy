import type {
  DependencyGraph,
  PackageNode,
  DependencyEdge,
  DependencyDiff,
  UpdatedPackage,
  VersionChangeType,
  ResolvedDependency,
} from './types'
import { createGraph, addNode, addEdge, createNode, nodeId } from './graph'
import { buildMerkleTree, findDirtyNodes } from './merkle'
import { tarjanSCC, assignSCCIds } from './tarjan'
import { assignBuildLayers } from './kahn'
import { detectVersionConflicts } from './semver-sat'
import { detectGhostDependencies } from './ghost'
import { detectLicenseConflicts, normalizeLicense } from './license'
import { buildBloomFilters, BloomFilter } from './bloom'
import { readCache, writeCache, deserializeGraph } from './cache'
import { npmPlugin } from './plugins/npm'
import { pipPlugin } from './plugins/pip'
import { goPlugin } from './plugins/go'
import { cargoPlugin } from './plugins/cargo'
import semver from 'semver'
import fs from 'fs'
import path from 'path'

const ALL_PLUGINS = [npmPlugin, pipPlugin, goPlugin, cargoPlugin]

export interface ScanOptions {
  projectDir: string
  force?: boolean
  includeDevDeps?: boolean
}

export interface ScanResult {
  graph: DependencyGraph
  diff: DependencyDiff | null
  fromCache: boolean
  scanTimeMs: number
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function runAnalysis(options: ScanOptions): Promise<ScanResult> {
  const start = Date.now()
  const { projectDir, force = false, includeDevDeps = true } = options

  // Step 1: Read existing cache
  const existingCache = force ? null : readCache(projectDir)

  // Step 2: Run active parser plugins
  const activePlugins = ALL_PLUGINS.filter(p => p.canParse(projectDir))
  if (activePlugins.length === 0) {
    throw new Error(`No supported project found in ${projectDir}. Looking for: package.json, requirements.txt, go.mod, Cargo.toml`)
  }

  // Step 3: Build raw graph from all plugins
  const rawGraph = buildRawGraph(projectDir, activePlugins, includeDevDeps)

  // Step 4: Build Merkle tree and check against cache
  const { hashes: newHashes, rootHash: newRootHash } = buildMerkleTree(rawGraph)

  // Step 5: If cache matches → return cached graph
  if (existingCache && existingCache.rootHash === newRootHash) {
    const graph = deserializeGraph(existingCache.enrichedGraph)
    return {
      graph,
      diff: null,
      fromCache: true,
      scanTimeMs: Date.now() - start,
    }
  }

  // Step 6: Find dirty nodes if cache exists
  let dirtyNodes: Set<string> | null = null
  let previousGraph: DependencyGraph | null = null

  if (existingCache) {
    dirtyNodes = findDirtyNodes(
      existingCache.merkleHashes,
      newHashes,
      rawGraph.adjacencyList,
      rawGraph.rootId,
    )
    previousGraph = deserializeGraph(existingCache.enrichedGraph)
  }

  // Step 7: Run full analysis pipeline
  const enrichedGraph = await runPipeline(rawGraph, projectDir, newHashes)

  // Step 8: Compute diff if we have a previous graph
  const diff = previousGraph ? computeDiff(previousGraph, enrichedGraph) : null

  // Step 9: Write cache
  writeCache(projectDir, {
    version: '1.0.0',
    rootHash: newRootHash,
    scannedAt: new Date().toISOString(),
    merkleHashes: newHashes,
    enrichedGraph,
    bloomFilters: {},  // populated by writeCache from node.bloomFilter
    previousGraph: previousGraph,
  })

  return {
    graph: enrichedGraph,
    diff,
    fromCache: false,
    scanTimeMs: Date.now() - start,
  }
}

// ─── Graph Builder ────────────────────────────────────────────────────────────

function buildRawGraph(
  projectDir: string,
  activePlugins: typeof ALL_PLUGINS,
  includeDevDeps: boolean,
): DependencyGraph {
  // Create root node (the project itself)
  const pkgJson = readPackageJson(projectDir)
  const rootName = pkgJson?.name ?? 'project'
  const rootVersion = pkgJson?.version ?? '0.0.0'
  const rootNodeId = nodeId(rootName, 'npm')

  const graph = createGraph(rootNodeId)
  const rootNode = createNode(rootNodeId, rootName, 'npm', rootVersion, rootVersion, true)
  rootNode.license = normalizeLicense(pkgJson?.license)
  addNode(graph, rootNode)

  for (const plugin of activePlugins) {
    const resolved = plugin.parseLockfile(projectDir)
    const manifest = plugin.parseManifest(projectDir)

    // Build a map of name → resolved version from lockfile
    const resolvedMap = new Map(resolved.map((r: ResolvedDependency) => [r.name.toLowerCase(), r]))

    // Add all resolved packages as nodes
    for (const dep of resolved) {
      const id = nodeId(dep.name, plugin.ecosystem)
      if (!graph.nodes[id]) {
        const node = createNode(
          id,
          dep.name,
          plugin.ecosystem,
          dep.declaredVersion,
          dep.resolvedVersion,
        )
        addNode(graph, node)
      }
    }

    // Add edges from root to direct dependencies (from manifest)
    for (const dep of manifest) {
      if (!includeDevDeps && dep.type === 'dev') continue

      const depId = nodeId(dep.name, plugin.ecosystem)
      if (!graph.nodes[depId]) {
        const resolvedDep: ResolvedDependency | undefined = resolvedMap.get(dep.name.toLowerCase())
        const resolvedVer = resolvedDep?.resolvedVersion ?? dep.declaredVersion
        const node = createNode(depId, dep.name, plugin.ecosystem, dep.declaredVersion, resolvedVer)
        addNode(graph, node)
      }

      const edge: DependencyEdge = {
        from: rootNodeId,
        to: depId,
        constraint: dep.declaredVersion,
        type: dep.type,
        isConflicting: false,
        isCircular: false,
        crossesLicenseBoundary: false,
      }
      addEdge(graph, edge)
    }

    // Add transitive edges (from resolved deps' dependency lists)
    for (const dep of resolved) {
      const fromId = nodeId(dep.name, plugin.ecosystem)
      for (const transitiveDep of dep.dependencies ?? []) {
        const toId = nodeId(transitiveDep.name, plugin.ecosystem)
        if (!graph.nodes[toId]) {
          const node = createNode(
            toId, transitiveDep.name, plugin.ecosystem,
            transitiveDep.declaredVersion, transitiveDep.resolvedVersion,
          )
          addNode(graph, node)
        }
        const edge: DependencyEdge = {
          from: fromId,
          to: toId,
          constraint: transitiveDep.declaredVersion,
          type: 'transitive',
          isConflicting: false,
          isCircular: false,
          crossesLicenseBoundary: false,
        }
        addEdge(graph, edge)
      }
    }
  }

  // Update metadata
  graph.metadata.ecosystems = [...new Set(activePlugins.map(p => p.ecosystem))]
  graph.metadata.totalPackages = Object.keys(graph.nodes).length
  graph.metadata.totalEdges = graph.edges.length

  return graph
}

// ─── Analysis Pipeline ────────────────────────────────────────────────────────

async function runPipeline(
  graph: DependencyGraph,
  projectDir: string,
  merkleHashes: Record<string, string>,
): Promise<DependencyGraph> {
  // 1. Assign Merkle hashes to nodes
  for (const [nodeId, hash] of Object.entries(merkleHashes)) {
    if (graph.nodes[nodeId]) {
      graph.nodes[nodeId].merkleHash = hash
    }
  }

  // 2. Tarjan's SCC — find circular dependency clusters
  const clusters = tarjanSCC(graph)
  assignSCCIds(graph, clusters)
  graph.metadata.sccClusters = clusters

  // 3. Kahn's topological sort — compute build layers
  assignBuildLayers(graph)

  // 4. Semver SAT solver — detect version conflicts
  const conflicts = detectVersionConflicts(graph)
  graph.metadata.versionConflicts = conflicts

  // 5. Ghost dependency detection
  const ghosts = detectGhostDependencies(graph, projectDir)
  graph.metadata.ghostDependencies = ghosts

  // 6. License conflict detection
  const licenseConflicts = detectLicenseConflicts(graph)
  graph.metadata.licenseConflicts = licenseConflicts

  // 7. Build Bloom filters
  const filters = buildBloomFilters(graph.nodes, graph.adjacencyList)
  for (const [nodeId, filter] of Object.entries(filters)) {
    if (graph.nodes[nodeId]) {
      graph.nodes[nodeId].bloomFilter = filter.toUint8Array()
    }
  }

  // 8. Update final metadata
  graph.metadata.scannedAt = new Date().toISOString()
  graph.metadata.totalPackages = Object.keys(graph.nodes).length
  graph.metadata.totalEdges = graph.edges.length

  return graph
}

// ─── Diff Computation ─────────────────────────────────────────────────────────

function computeDiff(
  previous: DependencyGraph,
  current: DependencyGraph,
): DependencyDiff {
  const prevNodeIds = new Set(Object.keys(previous.nodes))
  const currNodeIds = new Set(Object.keys(current.nodes))

  const added = Object.values(current.nodes).filter(
    n => !prevNodeIds.has(n.id) && !n.isRoot,
  )
  const removed = Object.values(previous.nodes).filter(
    n => !currNodeIds.has(n.id) && !n.isRoot,
  )

  const updated: UpdatedPackage[] = []
  for (const nodeId of prevNodeIds) {
    if (!currNodeIds.has(nodeId)) continue
    const prev = previous.nodes[nodeId]
    const curr = current.nodes[nodeId]
    if (prev.resolvedVersion !== curr.resolvedVersion) {
      updated.push({
        node: curr,
        previousVersion: prev.resolvedVersion,
        currentVersion: curr.resolvedVersion,
        changeType: getVersionChangeType(prev.resolvedVersion, curr.resolvedVersion),
      })
    }
  }

  // Find new conflicts
  const prevConflictNames = new Set(
    previous.metadata.versionConflicts.map(c => c.packageName),
  )
  const newConflicts = current.metadata.versionConflicts.filter(
    c => !prevConflictNames.has(c.packageName),
  )

  const currConflictNames = new Set(
    current.metadata.versionConflicts.map(c => c.packageName),
  )
  const resolvedConflicts = previous.metadata.versionConflicts.filter(
    c => !currConflictNames.has(c.packageName),
  )

  return {
    added,
    removed,
    updated,
    newConflicts,
    resolvedConflicts,
    hasChanges: added.length > 0 || removed.length > 0 || updated.length > 0,
  }
}

function getVersionChangeType(from: string, to: string): VersionChangeType {
  try {
    const diff = semver.diff(
      semver.coerce(from)?.version ?? from,
      semver.coerce(to)?.version ?? to,
    )
    if (diff === 'patch' || diff === 'prepatch') return 'patch'
    if (diff === 'minor' || diff === 'preminor') return 'minor'
    if (diff === 'major' || diff === 'premajor') return 'major'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function readPackageJson(projectDir: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'))
  } catch {
    return null
  }
}

// ─── Query Helpers ─────────────────────────────────────────────────────────────

// Answers "does X transitively depend on Y?" using the Bloom filter
export function queryTransitive(
  graph: DependencyGraph,
  fromId: string,
  toId: string,
): { result: boolean; method: 'bloom' | 'exact'; confirmed: boolean } {
  const fromNode = graph.nodes[fromId]
  if (!fromNode) return { result: false, method: 'exact', confirmed: true }

  // Bloom filter check first
  const filter = BloomFilter.fromUint8Array(fromNode.bloomFilter)
  const bloomResult = filter.query(toId)

  if (!bloomResult) {
    // Definite negative — no false negatives
    return { result: false, method: 'bloom', confirmed: true }
  }

  // Bloom says yes — confirm with exact BFS
  const reachable = new Set<string>()
  const queue = [fromId]
  while (queue.length > 0) {
    const curr = queue.shift()!
    if (reachable.has(curr)) continue
    reachable.add(curr)
    for (const neighbor of (graph.adjacencyList[curr] ?? [])) {
      if (!reachable.has(neighbor)) queue.push(neighbor)
    }
  }

  const exactResult = reachable.has(toId)
  return { result: exactResult, method: 'bloom', confirmed: true }
}

// Returns all packages that depend on a given package
export function queryReverseDependencies(
  graph: DependencyGraph,
  nodeId: string,
): string[] {
  return graph.reverseAdjacency[nodeId] ?? []
}

// Re-export cache functions for API usage
export { readCache, writeCache, deserializeGraph } from './cache'
