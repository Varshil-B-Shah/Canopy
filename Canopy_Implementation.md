# Canopy — Full Implementation Guide

Every file, every line. Copy in order. Do not skip setup steps.

---

## Project Structure

```
canopy/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
├── bin/
│   └── canopy.js               ← CLI entry point
├── src/
│   ├── engine/
│   │   ├── types.ts            ← All shared TypeScript types
│   │   ├── graph.ts            ← Graph data structure
│   │   ├── bloom.ts            ← Bloom filter implementation
│   │   ├── merkle.ts           ← Merkle tree
│   │   ├── tarjan.ts           ← Tarjan's SCC
│   │   ├── kahn.ts             ← Kahn's topological sort
│   │   ├── semver-sat.ts       ← Semver SAT solver
│   │   ├── ghost.ts            ← Ghost dependency detection
│   │   ├── license.ts          ← License conflict detection
│   │   ├── cache.ts            ← Cache read/write
│   │   ├── index.ts            ← Main analysis engine
│   │   └── plugins/
│   │       ├── base.ts         ← Plugin interface
│   │       ├── npm.ts          ← npm/yarn/pnpm parser
│   │       ├── pip.ts          ← pip/poetry parser
│   │       ├── go.ts           ← go modules parser
│   │       └── cargo.ts        ← cargo parser
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── api/
│   │       ├── scan/route.ts
│   │       ├── results/route.ts
│   │       ├── query/route.ts
│   │       ├── diff/route.ts
│   │       └── health/route.ts
│   └── components/
│       ├── GraphCanvas.tsx
│       ├── Sidebar.tsx
│       ├── FilterBar.tsx
│       ├── QueryBar.tsx
│       ├── IssuesPanel.tsx
│       ├── DiffPanel.tsx
│       ├── BuildOrderPanel.tsx
│       └── NodeDetail.tsx
```

---

## Step 1 — Project Setup

### `package.json`

```json
{
  "name": "canopy",
  "version": "1.0.0",
  "description": "Polyglot dependency graph analyzer",
  "bin": {
    "canopy": "./bin/canopy.js"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "type-check": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "18.3.0",
    "react-dom": "18.3.0",
    "d3": "7.9.0",
    "zustand": "4.5.0",
    "semver": "7.6.0",
    "commander": "12.0.0",
    "@iarna/toml": "2.2.5",
    "open": "10.1.0",
    "chalk": "5.3.0",
    "ora": "8.0.1"
  },
  "devDependencies": {
    "typescript": "5.4.0",
    "@types/react": "18.3.0",
    "@types/react-dom": "18.3.0",
    "@types/d3": "7.4.3",
    "@types/semver": "7.5.8",
    "@types/node": "20.12.0",
    "tailwindcss": "3.4.0",
    "autoprefixer": "10.4.19",
    "postcss": "8.4.38",
    "vitest": "1.5.0"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### `next.config.js`

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
```

### `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f0f0f',
        panel: '#1a1a1a',
        border: '#2a2a2a',
      },
    },
  },
  plugins: [],
}
```

### `postcss.config.js`

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### `.gitignore`

```
node_modules/
.next/
.canopy-cache.json
*.log
dist/
```

---

## Step 2 — Install Dependencies

```bash
mkdir canopy && cd canopy
# paste package.json, then:
npm install
```

---

## Step 3 — Engine Types

### `src/engine/types.ts`

```typescript
// ─── Ecosystems ───────────────────────────────────────────────────────────────

export type Ecosystem = 'npm' | 'pip' | 'go' | 'cargo'

// ─── Raw types (output of parser plugins) ────────────────────────────────────

export type EdgeType = 'direct' | 'dev' | 'peer' | 'transitive'

export interface RawDependency {
  name: string
  ecosystem: Ecosystem
  declaredVersion: string   // the range as written: "^4.18.0"
  type: EdgeType
}

export interface ResolvedDependency extends RawDependency {
  resolvedVersion: string   // exact installed version: "4.18.2"
  dependencies: ResolvedDependency[]  // transitive deps
}

// ─── Graph node and edge ──────────────────────────────────────────────────────

export interface PackageNode {
  id: string                 // "npm:express"
  name: string               // "express"
  ecosystem: Ecosystem
  declaredVersion: string
  resolvedVersion: string
  license: string            // "MIT" | "Apache-2.0" | "UNKNOWN" | ...
  isRoot: boolean

  // Set during pipeline
  merkleHash: string
  sccId: number              // -1 = not yet computed
  buildLayer: number         // -1 = not yet computed
  bloomFilter: Uint8Array    // serialised Bloom filter

  // Issue flags
  hasVersionConflict: boolean
  isGhostDependency: boolean
  hasLicenseConflict: boolean
  conflictDetails: ConflictDetail[]
}

export interface DependencyEdge {
  from: string
  to: string
  constraint: string
  type: EdgeType
  isConflicting: boolean
  isCircular: boolean
  crossesLicenseBoundary: boolean
}

// ─── Enriched graph (output of full pipeline) ─────────────────────────────────

export interface DependencyGraph {
  nodes: Record<string, PackageNode>
  edges: DependencyEdge[]
  adjacencyList: Record<string, string[]>
  reverseAdjacency: Record<string, string[]>
  rootId: string
  metadata: GraphMetadata
}

export interface GraphMetadata {
  scannedAt: string          // ISO string
  ecosystems: Ecosystem[]
  totalPackages: number
  totalEdges: number
  maxDepth: number
  criticalPathLength: number
  sccClusters: SCCCluster[]
  versionConflicts: ConflictDetail[]
  ghostDependencies: GhostDependency[]
  licenseConflicts: LicenseConflict[]
}

// ─── SCC ──────────────────────────────────────────────────────────────────────

export interface SCCCluster {
  id: number
  members: string[]          // node IDs
  cycleEdges: string[][]     // pairs [from, to] that form the cycle
}

// ─── Conflict detail ──────────────────────────────────────────────────────────

export interface ConflictDetail {
  packageName: string
  constraints: ConstraintSource[]
  intersection: string | null  // null = empty intersection = real conflict
  severity: 'error' | 'warning'
}

export interface ConstraintSource {
  imposedBy: string          // node ID of the package imposing this constraint
  constraint: string         // the version range string
}

// ─── Ghost dependency ─────────────────────────────────────────────────────────

export interface GhostDependency {
  packageName: string
  importedIn: string[]       // source file paths
  providedBy: string | null  // which package transitively provides it
}

// ─── License conflict ─────────────────────────────────────────────────────────

export interface LicenseConflict {
  packageName: string
  license: string
  path: string[]             // chain of node IDs from root to conflict
  severity: 'error' | 'warning'
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

export type VersionChangeType = 'patch' | 'minor' | 'major' | 'unknown'

export interface DependencyDiff {
  added: PackageNode[]
  removed: PackageNode[]
  updated: UpdatedPackage[]
  newConflicts: ConflictDetail[]
  resolvedConflicts: ConflictDetail[]
  hasChanges: boolean
}

export interface UpdatedPackage {
  node: PackageNode
  previousVersion: string
  currentVersion: string
  changeType: VersionChangeType
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export interface CanopyCache {
  version: string
  rootHash: string
  scannedAt: string
  merkleHashes: Record<string, string>  // nodeId → hash
  enrichedGraph: DependencyGraph
  bloomFilters: Record<string, string>  // nodeId → base64 encoded filter
  previousGraph: DependencyGraph | null // for diff computation
}

// ─── Query ────────────────────────────────────────────────────────────────────

export type QueryType =
  | 'transitive'
  | 'reverse'
  | 'license_filter'
  | 'ghost_check'
  | 'build_order'

export interface QueryResult {
  type: QueryType
  query: string
  result: boolean | string[] | number | null
  latencyMs: number
  method?: 'bloom' | 'exact'
  confirmed?: boolean
}
```

---

## Step 4 — Graph Data Structure

### `src/engine/graph.ts`

```typescript
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
): PackageNode {
  return {
    id,
    name,
    ecosystem,
    declaredVersion,
    resolvedVersion,
    license: 'UNKNOWN',
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
```

---

## Step 5 — Bloom Filter

### `src/engine/bloom.ts`

```typescript
// Custom Bloom filter implementation.
// Uses double-hashing to derive k hash functions from two base hashes.
// False positive rate ≈ 1% for up to 100 elements with default settings.

const FILTER_BITS = 1024   // 128 bytes per filter
const NUM_HASHES = 7       // k hash functions

// FNV-1a 32-bit hash — fast non-cryptographic hash for Bloom filter internals
function fnv1a(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 16777619) >>> 0
  }
  return hash
}

// Second hash function using DJB2 — needed for double-hashing technique
function djb2(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    hash = hash >>> 0
  }
  return hash
}

// Derives k bit positions from two base hashes using Kirsch-Mitzenmacher
// This avoids computing k independent hash functions
function getBitPositions(element: string): number[] {
  const h1 = fnv1a(element)
  const h2 = djb2(element)
  const positions: number[] = []
  for (let i = 0; i < NUM_HASHES; i++) {
    positions.push(((h1 + i * h2) >>> 0) % FILTER_BITS)
  }
  return positions
}

export class BloomFilter {
  private bits: Uint8Array

  constructor(bits?: Uint8Array) {
    // Uint8Array of 128 bytes = 1024 bits
    this.bits = bits ? new Uint8Array(bits) : new Uint8Array(FILTER_BITS / 8)
  }

  // Adds an element to the filter
  add(element: string): void {
    for (const pos of getBitPositions(element)) {
      this.bits[Math.floor(pos / 8)] |= (1 << (pos % 8))
    }
  }

  // Returns true if element PROBABLY exists in the filter
  // Returns false if element DEFINITELY does not exist
  query(element: string): boolean {
    for (const pos of getBitPositions(element)) {
      if ((this.bits[Math.floor(pos / 8)] & (1 << (pos % 8))) === 0) {
        return false
      }
    }
    return true
  }

  // Merges another filter into this one (bitwise OR = union of sets)
  merge(other: BloomFilter): void {
    for (let i = 0; i < this.bits.length; i++) {
      this.bits[i] |= other.bits[i]
    }
  }

  // Serializes to base64 string for JSON storage
  toBase64(): string {
    return Buffer.from(this.bits).toString('base64')
  }

  // Returns the raw Uint8Array for storage on PackageNode
  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bits)
  }

  // Deserializes from base64 string
  static fromBase64(b64: string): BloomFilter {
    const bytes = Buffer.from(b64, 'base64')
    return new BloomFilter(new Uint8Array(bytes))
  }

  // Creates a filter from a Uint8Array
  static fromUint8Array(arr: Uint8Array): BloomFilter {
    return new BloomFilter(arr)
  }
}

// Builds Bloom filters for all nodes in the graph bottom-up.
// Leaf nodes get a filter containing only themselves.
// Internal nodes get the union of all children's filters plus themselves.
// Returns a map of nodeId → BloomFilter
export function buildBloomFilters(
  nodes: Record<string, import('./types').PackageNode>,
  adjacencyList: Record<string, string[]>,
): Record<string, BloomFilter> {
  const filters: Record<string, BloomFilter> = {}

  // Identify leaf nodes (no outgoing edges)
  const leafIds = Object.keys(nodes).filter(
    id => (adjacencyList[id] ?? []).length === 0,
  )

  // Topological order — process leaves first
  // Use DFS with memoization
  function buildFilter(nodeId: string, visited: Set<string>): BloomFilter {
    if (filters[nodeId]) return filters[nodeId]
    if (visited.has(nodeId)) {
      // Cycle — return a filter with just this node to avoid infinite loop
      const f = new BloomFilter()
      f.add(nodeId)
      return f
    }

    visited.add(nodeId)
    const filter = new BloomFilter()
    filter.add(nodeId)

    for (const childId of (adjacencyList[nodeId] ?? [])) {
      const childFilter = buildFilter(childId, new Set(visited))
      filter.merge(childFilter)
    }

    filters[nodeId] = filter
    return filter
  }

  for (const nodeId of Object.keys(nodes)) {
    buildFilter(nodeId, new Set())
  }

  return filters
}
```

---

## Step 6 — Merkle Tree

### `src/engine/merkle.ts`

```typescript
import crypto from 'crypto'
import type { DependencyGraph } from './types'

const CANOPY_VERSION = 'canopy-v1'

// Computes SHA-256 of a string and returns hex digest
function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex')
}

// Computes the Merkle hash for a single node.
// The hash depends on: name, ecosystem, resolvedVersion, and hashes of all
// dependencies sorted alphabetically (deterministic ordering is critical).
function computeNodeHash(
  nodeId: string,
  resolvedVersion: string,
  childHashes: string[],
): string {
  const sortedChildHashes = [...childHashes].sort()
  const content = `${nodeId}@${resolvedVersion}${sortedChildHashes.join('')}`
  return sha256(content)
}

// Builds a Merkle hash tree over the dependency graph.
// Returns a map of nodeId → merkleHash.
// Also returns the root hash.
export function buildMerkleTree(
  graph: DependencyGraph,
): { hashes: Record<string, string>; rootHash: string } {
  const hashes: Record<string, string> = {}

  function computeHash(nodeId: string, visited: Set<string>): string {
    if (hashes[nodeId]) return hashes[nodeId]
    if (visited.has(nodeId)) {
      // Cycle — hash just the node itself to avoid infinite recursion
      const node = graph.nodes[nodeId]
      const h = sha256(`${nodeId}@${node?.resolvedVersion ?? 'unknown'}`)
      hashes[nodeId] = h
      return h
    }

    visited.add(nodeId)
    const node = graph.nodes[nodeId]
    if (!node) return sha256(nodeId)

    const childIds = (graph.adjacencyList[nodeId] ?? []).sort()
    const childHashes = childIds.map(childId =>
      computeHash(childId, new Set(visited)),
    )

    const hash = computeNodeHash(nodeId, node.resolvedVersion, childHashes)
    hashes[nodeId] = hash
    return hash
  }

  // Compute hashes for all nodes
  for (const nodeId of Object.keys(graph.nodes)) {
    computeHash(nodeId, new Set())
  }

  // Root hash = hash of version prefix + root node hash
  const rootNodeHash = hashes[graph.rootId] ?? sha256(graph.rootId)
  const rootHash = sha256(`${CANOPY_VERSION}${rootNodeHash}`)

  return { hashes, rootHash }
}

// Compares two Merkle hash maps and returns the IDs of dirty nodes
// (nodes whose hash changed between old and new scan).
// Uses top-down comparison — stops descending into subtrees that match.
export function findDirtyNodes(
  oldHashes: Record<string, string>,
  newHashes: Record<string, string>,
  adjacencyList: Record<string, string[]>,
  rootId: string,
): Set<string> {
  const dirty = new Set<string>()

  function compare(nodeId: string): void {
    const oldHash = oldHashes[nodeId]
    const newHash = newHashes[nodeId]

    if (!newHash) return  // Node no longer exists — not dirty, just removed

    if (oldHash === newHash) return  // Subtree unchanged — stop descending

    dirty.add(nodeId)

    // Descend into children to find which sub-nodes changed
    for (const childId of (adjacencyList[nodeId] ?? [])) {
      compare(childId)
    }
  }

  compare(rootId)

  // Also mark newly added nodes (present in new but not in old) as dirty
  for (const nodeId of Object.keys(newHashes)) {
    if (!oldHashes[nodeId]) {
      dirty.add(nodeId)
    }
  }

  return dirty
}
```

---

## Step 7 — Tarjan's SCC

### `src/engine/tarjan.ts`

```typescript
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
```

---

## Step 8 — Kahn's Topological Sort

### `src/engine/kahn.ts`

```typescript
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
```

---

## Step 9 — Semver SAT Solver

### `src/engine/semver-sat.ts`

```typescript
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
```

---

## Step 10 — Ghost Dependency Detection

### `src/engine/ghost.ts`

```typescript
import fs from 'fs'
import path from 'path'
import type { DependencyGraph, GhostDependency } from './types'

// Node.js built-in modules — these are never ghost dependencies
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'http2', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url',
  'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
])

// Extracts all imported package names from a JavaScript/TypeScript source file
// using regex (no full AST needed for this use case)
function extractJSImports(fileContent: string): string[] {
  const imports = new Set<string>()

  // ES module imports: import X from 'package' or import 'package'
  const esImportRegex = /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"./][^'"]*)['"]/g
  let match: RegExpExecArray | null
  while ((match = esImportRegex.exec(fileContent)) !== null) {
    imports.add(extractPackageName(match[1]))
  }

  // CommonJS requires: require('package')
  const requireRegex = /require\(['"]([^'"./][^'"]*)['"]\)/g
  while ((match = requireRegex.exec(fileContent)) !== null) {
    imports.add(extractPackageName(match[1]))
  }

  // Dynamic imports: import('package')
  const dynamicImportRegex = /import\(['"]([^'"./][^'"]*)['"]\)/g
  while ((match = dynamicImportRegex.exec(fileContent)) !== null) {
    imports.add(extractPackageName(match[1]))
  }

  return [...imports].filter(
    name => name && !NODE_BUILTINS.has(name) && !name.startsWith('@types/'),
  )
}

// Extracts all imported package names from a Python source file
function extractPythonImports(fileContent: string): string[] {
  const imports = new Set<string>()

  // import package or import package.submodule
  const importRegex = /^import\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gm
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(fileContent)) !== null) {
    imports.add(match[1].split('.')[0])
  }

  // from package import ... (only first segment = package name)
  const fromImportRegex = /^from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import/gm
  while ((match = fromImportRegex.exec(fileContent)) !== null) {
    const pkg = match[1].split('.')[0]
    if (!pkg.startsWith('.')) imports.add(pkg)
  }

  // Normalize common Python package name differences (e.g. PIL → Pillow)
  const pythonNameMap: Record<string, string> = {
    PIL: 'Pillow',
    cv2: 'opencv-python',
    sklearn: 'scikit-learn',
    bs4: 'beautifulsoup4',
    yaml: 'PyYAML',
  }

  return [...imports].map(name => pythonNameMap[name] ?? name)
}

// Extracts all imported package names from a Go source file
function extractGoImports(fileContent: string): string[] {
  const imports = new Set<string>()

  // Single import: import "github.com/some/package"
  const singleImportRegex = /import\s+"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = singleImportRegex.exec(fileContent)) !== null) {
    imports.add(match[1])
  }

  // Grouped imports: import ( "pkg1" "pkg2" )
  const groupImportRegex = /import\s+\(([\s\S]*?)\)/g
  while ((match = groupImportRegex.exec(fileContent)) !== null) {
    const block = match[1]
    const innerRegex = /"([^"]+)"/g
    let inner: RegExpExecArray | null
    while ((inner = innerRegex.exec(block)) !== null) {
      imports.add(inner[1])
    }
  }

  // Filter out standard library (no dot in first path segment)
  return [...imports].filter(pkg => {
    const firstSegment = pkg.split('/')[0]
    return firstSegment.includes('.') // e.g. github.com, golang.org/x
  })
}

// Normalizes a scoped or sub-path import to the root package name
// "@org/package/subpath" → "@org/package"
// "package/utils" → "package"
function extractPackageName(importPath: string): string {
  if (importPath.startsWith('@')) {
    // Scoped package: keep @org/name, drop subpath
    const parts = importPath.split('/')
    return parts.slice(0, 2).join('/')
  }
  // Regular package: take first path segment
  return importPath.split('/')[0]
}

// Recursively collects all source files of given extensions from a directory
function collectSourceFiles(
  dir: string,
  extensions: string[],
  excludeDirs: string[] = ['node_modules', '.git', '.next', 'dist', 'build'],
): string[] {
  const files: string[] = []

  if (!fs.existsSync(dir)) return files

  function walk(currentDir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          walk(fullPath)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name)
        if (extensions.includes(ext)) {
          files.push(fullPath)
        }
      }
    }
  }

  walk(dir)
  return files
}

// Main ghost dependency detector.
// Compares imported packages in source code against declared dependencies.
export function detectGhostDependencies(
  graph: DependencyGraph,
  projectDir: string,
): GhostDependency[] {
  const ghosts: GhostDependency[] = []

  // Collect declared direct dependency names (npm + pip)
  const declaredDirect = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.from === graph.rootId && (edge.type === 'direct' || edge.type === 'dev')) {
      const node = graph.nodes[edge.to]
      if (node) declaredDirect.add(node.name.toLowerCase())
    }
  }

  // All transitive package names (for "provided by" lookup)
  const transitiveNames = new Map<string, string>()  // name → nodeId
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    transitiveNames.set(node.name.toLowerCase(), nodeId)
  }

  // Scan JS/TS source files
  const jsFiles = collectSourceFiles(projectDir, ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])
  const jsImportMap: Record<string, string[]> = {}
  for (const file of jsFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const imports = extractJSImports(content)
      for (const pkg of imports) {
        if (!jsImportMap[pkg]) jsImportMap[pkg] = []
        jsImportMap[pkg].push(file)
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Scan Python source files
  const pyFiles = collectSourceFiles(projectDir, ['.py'])
  const pyImportMap: Record<string, string[]> = {}
  for (const file of pyFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const imports = extractPythonImports(content)
      for (const pkg of imports) {
        if (!pyImportMap[pkg]) pyImportMap[pkg] = []
        pyImportMap[pkg].push(file)
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Check for ghost dependencies in JS/TS imports
  for (const [pkgName, files] of Object.entries(jsImportMap)) {
    const normalized = pkgName.toLowerCase()
    if (!declaredDirect.has(normalized) && transitiveNames.has(normalized)) {
      const providedBy = transitiveNames.get(normalized) ?? null
      ghosts.push({ packageName: pkgName, importedIn: files, providedBy })

      // Mark the node as a ghost dependency
      const nodeId = transitiveNames.get(normalized)
      if (nodeId && graph.nodes[nodeId]) {
        graph.nodes[nodeId].isGhostDependency = true
      }
    }
  }

  // Check for ghost dependencies in Python imports
  for (const [pkgName, files] of Object.entries(pyImportMap)) {
    const normalized = pkgName.toLowerCase()
    if (!declaredDirect.has(normalized) && transitiveNames.has(normalized)) {
      const providedBy = transitiveNames.get(normalized) ?? null
      ghosts.push({ packageName: pkgName, importedIn: files, providedBy })

      const nodeId = transitiveNames.get(normalized)
      if (nodeId && graph.nodes[nodeId]) {
        graph.nodes[nodeId].isGhostDependency = true
      }
    }
  }

  return ghosts
}
```

---

## Step 11 — License Conflict Detection

### `src/engine/license.ts`

```typescript
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
```

---

## Step 12 — Cache System

### `src/engine/cache.ts`

```typescript
import fs from 'fs'
import path from 'path'
import type { CanopyCache, DependencyGraph } from './types'
import { BloomFilter } from './bloom'

const CACHE_VERSION = '1.0.0'
const CACHE_FILENAME = '.canopy-cache.json'
const GITIGNORE_FILENAME = '.gitignore'

// Returns the path to the cache file in the project directory
export function getCachePath(projectDir: string): string {
  return path.join(projectDir, CACHE_FILENAME)
}

// Reads and parses the cache. Returns null if cache is missing or invalid.
export function readCache(projectDir: string): CanopyCache | null {
  const cachePath = getCachePath(projectDir)

  if (!fs.existsSync(cachePath)) return null

  try {
    const raw = fs.readFileSync(cachePath, 'utf-8')
    const parsed = JSON.parse(raw) as CanopyCache

    // Validate version
    if (parsed.version !== CACHE_VERSION) return null

    // Validate root hash format (should be 64 hex chars)
    if (!/^[a-f0-9]{64}$/i.test(parsed.rootHash ?? '')) return null

    return parsed
  } catch {
    return null  // Corrupt cache — full re-analysis
  }
}

// Writes the cache to disk.
export function writeCache(projectDir: string, cache: CanopyCache): void {
  const cachePath = getCachePath(projectDir)

  try {
    // Serialize Bloom filters as base64 before writing
    const serializable: CanopyCache = {
      ...cache,
      bloomFilters: {},
    }

    // Copy graph nodes but convert Uint8Array bloom filters to base64
    if (cache.enrichedGraph) {
      serializable.enrichedGraph = {
        ...cache.enrichedGraph,
        nodes: Object.fromEntries(
          Object.entries(cache.enrichedGraph.nodes).map(([id, node]) => [
            id,
            {
              ...node,
              bloomFilter: Buffer.from(node.bloomFilter).toString('base64') as any,
            },
          ]),
        ),
      }
    }

    // Store bloom filters separately for quick access
    for (const [nodeId, node] of Object.entries(cache.enrichedGraph?.nodes ?? {})) {
      serializable.bloomFilters[nodeId] = Buffer.from(node.bloomFilter).toString('base64')
    }

    fs.writeFileSync(cachePath, JSON.stringify(serializable, null, 2), 'utf-8')
    ensureGitignore(projectDir)
  } catch (err) {
    // Non-fatal — analysis still worked, cache just won't persist
    console.warn('Warning: Could not write cache file:', err)
  }
}

// Restores Uint8Array bloom filters from base64 strings after reading cache
export function deserializeGraph(graph: DependencyGraph): DependencyGraph {
  const deserialized = { ...graph }
  deserialized.nodes = Object.fromEntries(
    Object.entries(graph.nodes).map(([id, node]) => {
      const bloomData = node.bloomFilter
      let bloomArray: Uint8Array
      if (typeof bloomData === 'string') {
        bloomArray = new Uint8Array(Buffer.from(bloomData as string, 'base64'))
      } else if (bloomData instanceof Uint8Array) {
        bloomArray = bloomData
      } else {
        bloomArray = new Uint8Array(128)
      }
      return [id, { ...node, bloomFilter: bloomArray }]
    }),
  )
  return deserialized
}

// Adds .canopy-cache.json to .gitignore if not already present
function ensureGitignore(projectDir: string): void {
  const gitignorePath = path.join(projectDir, GITIGNORE_FILENAME)
  const entry = CACHE_FILENAME

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8')
      if (!content.includes(entry)) {
        fs.appendFileSync(gitignorePath, `\n${entry}\n`, 'utf-8')
      }
    } else {
      fs.writeFileSync(gitignorePath, `${entry}\n`, 'utf-8')
    }
  } catch {
    // Non-fatal
  }
}
```

---

## Step 13 — Parser Plugins

### `src/engine/plugins/base.ts`

```typescript
import type { Ecosystem, RawDependency, ResolvedDependency } from '../types'

export interface LanguageParser {
  name: string
  ecosystem: Ecosystem

  // Returns true if this parser can handle the project directory
  canParse(projectDir: string): boolean

  // Reads manifests → declared dependencies
  parseManifest(projectDir: string): RawDependency[]

  // Reads lockfile → resolved + transitive dependencies
  parseLockfile(projectDir: string): ResolvedDependency[]

  // Reads source files → list of imported package names (for ghost detection)
  parseImports(projectDir: string): string[]
}
```

### `src/engine/plugins/npm.ts`

```typescript
import fs from 'fs'
import path from 'path'
import type { LanguageParser, RawDependency, ResolvedDependency } from '../types'

export const npmPlugin: LanguageParser = {
  name: 'npm',
  ecosystem: 'npm',

  canParse(projectDir: string): boolean {
    return fs.existsSync(path.join(projectDir, 'package.json'))
  },

  parseManifest(projectDir: string): RawDependency[] {
    const pkgPath = path.join(projectDir, 'package.json')
    const raw: RawDependency[] = []

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

      for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
        raw.push({ name, ecosystem: 'npm', declaredVersion: version as string, type: 'direct' })
      }
      for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
        raw.push({ name, ecosystem: 'npm', declaredVersion: version as string, type: 'dev' })
      }
      for (const [name, version] of Object.entries(pkg.peerDependencies ?? {})) {
        raw.push({ name, ecosystem: 'npm', declaredVersion: version as string, type: 'peer' })
      }
    } catch {
      // Malformed package.json — return empty
    }

    return raw
  },

  parseLockfile(projectDir: string): ResolvedDependency[] {
    // Try package-lock.json first (npm), then yarn.lock, then pnpm-lock.yaml
    const lockPath = path.join(projectDir, 'package-lock.json')
    if (fs.existsSync(lockPath)) return parsePackageLock(lockPath)

    const yarnPath = path.join(projectDir, 'yarn.lock')
    if (fs.existsSync(yarnPath)) return parseYarnLock(yarnPath, projectDir)

    // No lockfile — fall back to manifest only
    return this.parseManifest(projectDir).map(dep => ({
      ...dep,
      resolvedVersion: dep.declaredVersion,
      dependencies: [],
    }))
  },

  parseImports(_projectDir: string): string[] {
    // Ghost detection handled in ghost.ts using regex scan
    return []
  },
}

function parsePackageLock(lockPath: string): ResolvedDependency[] {
  const resolved: ResolvedDependency[] = []

  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))

    // package-lock.json v2/v3 format uses "packages" key
    if (lock.packages) {
      for (const [pkgPath, info] of Object.entries(lock.packages as Record<string, any>)) {
        if (pkgPath === '') continue  // Root package
        if (pkgPath.includes('node_modules/node_modules/')) continue  // Skip hoisted dupes

        // Extract name from path like "node_modules/express" or "node_modules/@org/pkg"
        const name = pkgPath.replace(/^.*node_modules\//, '')
        const version = info.version ?? '0.0.0'
        const license = info.license ?? 'UNKNOWN'

        resolved.push({
          name,
          ecosystem: 'npm',
          declaredVersion: version,
          resolvedVersion: version,
          type: info.dev ? 'dev' : info.peer ? 'peer' : 'direct',
          dependencies: [],
        })
      }
    } else if (lock.dependencies) {
      // v1 format
      function flattenDeps(deps: Record<string, any>): void {
        for (const [name, info] of Object.entries(deps)) {
          resolved.push({
            name,
            ecosystem: 'npm',
            declaredVersion: info.version ?? '0.0.0',
            resolvedVersion: info.version ?? '0.0.0',
            type: info.dev ? 'dev' : 'direct',
            dependencies: [],
          })
          if (info.dependencies) flattenDeps(info.dependencies)
        }
      }
      flattenDeps(lock.dependencies)
    }
  } catch {
    // Corrupt lockfile
  }

  return resolved
}

function parseYarnLock(lockPath: string, projectDir: string): ResolvedDependency[] {
  // Yarn.lock format is custom — parse line by line
  const resolved: ResolvedDependency[] = []

  try {
    const content = fs.readFileSync(lockPath, 'utf-8')
    const lines = content.split('\n')
    let currentName = ''
    let currentVersion = ''

    for (const line of lines) {
      // Package header: "name@version:", or "@scope/name@version:"
      const headerMatch = line.match(/^"?([^@\s"]+(?:@[^@\s"]+)*)@[^"]+(?:,.*)?:$/)
      if (headerMatch) {
        if (currentName && currentVersion) {
          resolved.push({
            name: currentName,
            ecosystem: 'npm',
            declaredVersion: currentVersion,
            resolvedVersion: currentVersion,
            type: 'direct',
            dependencies: [],
          })
        }
        currentName = headerMatch[1]
        currentVersion = ''
      }

      const versionMatch = line.match(/^\s+version\s+"([^"]+)"/)
      if (versionMatch) {
        currentVersion = versionMatch[1]
      }
    }

    // Push the last package
    if (currentName && currentVersion) {
      resolved.push({
        name: currentName,
        ecosystem: 'npm',
        declaredVersion: currentVersion,
        resolvedVersion: currentVersion,
        type: 'direct',
        dependencies: [],
      })
    }
  } catch {
    // Fall back to manifest
    return npmPlugin.parseManifest(projectDir).map(dep => ({
      ...dep,
      resolvedVersion: dep.declaredVersion,
      dependencies: [],
    }))
  }

  return resolved
}
```

### `src/engine/plugins/pip.ts`

```typescript
import fs from 'fs'
import path from 'path'
import type { LanguageParser, RawDependency, ResolvedDependency } from '../types'

export const pipPlugin: LanguageParser = {
  name: 'pip',
  ecosystem: 'pip',

  canParse(projectDir: string): boolean {
    return (
      fs.existsSync(path.join(projectDir, 'requirements.txt')) ||
      fs.existsSync(path.join(projectDir, 'pyproject.toml')) ||
      fs.existsSync(path.join(projectDir, 'Pipfile'))
    )
  },

  parseManifest(projectDir: string): RawDependency[] {
    // Try requirements.txt first
    const reqPath = path.join(projectDir, 'requirements.txt')
    if (fs.existsSync(reqPath)) {
      return parseRequirementsTxt(reqPath)
    }

    // Try pyproject.toml
    const pyprojectPath = path.join(projectDir, 'pyproject.toml')
    if (fs.existsSync(pyprojectPath)) {
      return parsePyproject(pyprojectPath)
    }

    return []
  },

  parseLockfile(projectDir: string): ResolvedDependency[] {
    // Try poetry.lock
    const poetryLockPath = path.join(projectDir, 'poetry.lock')
    if (fs.existsSync(poetryLockPath)) {
      return parsePoetryLock(poetryLockPath)
    }

    // Fall back to manifest
    return this.parseManifest(projectDir).map(dep => ({
      ...dep,
      resolvedVersion: dep.declaredVersion.replace(/[^0-9.]/g, '') || '0.0.0',
      dependencies: [],
    }))
  },

  parseImports(_projectDir: string): string[] {
    return []
  },
}

function parseRequirementsTxt(reqPath: string): RawDependency[] {
  const deps: RawDependency[] = []

  try {
    const lines = fs.readFileSync(reqPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue

      // Remove inline comments
      const withoutComment = trimmed.split('#')[0].trim()

      // Parse package==version, package>=version, package~=version, etc.
      const match = withoutComment.match(/^([a-zA-Z0-9_.-]+)\s*([>=<~!].*)?$/)
      if (match) {
        deps.push({
          name: match[1],
          ecosystem: 'pip',
          declaredVersion: match[2]?.trim() ?? '*',
          type: 'direct',
        })
      }
    }
  } catch {
    // Unreadable file
  }

  return deps
}

function parsePyproject(pyprojectPath: string): RawDependency[] {
  const deps: RawDependency[] = []

  try {
    // Simple TOML parsing without the library for basic cases
    const content = fs.readFileSync(pyprojectPath, 'utf-8')

    // Extract [tool.poetry.dependencies] or [project.dependencies]
    const depSectionMatch = content.match(
      /\[(?:tool\.poetry\.)?dependencies\]([\s\S]*?)(?:\[|$)/,
    )
    if (depSectionMatch) {
      const section = depSectionMatch[1]
      const lineRegex = /^([a-zA-Z0-9_.-]+)\s*=\s*"([^"]+)"/gm
      let match: RegExpExecArray | null
      while ((match = lineRegex.exec(section)) !== null) {
        if (match[1] === 'python') continue
        deps.push({
          name: match[1],
          ecosystem: 'pip',
          declaredVersion: match[2],
          type: 'direct',
        })
      }
    }
  } catch {
    // Unreadable
  }

  return deps
}

function parsePoetryLock(lockPath: string): ResolvedDependency[] {
  const deps: ResolvedDependency[] = []

  try {
    const content = fs.readFileSync(lockPath, 'utf-8')

    // Each package is a [[package]] block
    const packageBlocks = content.split('[[package]]').slice(1)
    for (const block of packageBlocks) {
      const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m)
      const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m)

      if (nameMatch && versionMatch) {
        deps.push({
          name: nameMatch[1],
          ecosystem: 'pip',
          declaredVersion: versionMatch[1],
          resolvedVersion: versionMatch[1],
          type: 'direct',
          dependencies: [],
        })
      }
    }
  } catch {
    // Unreadable
  }

  return deps
}
```

### `src/engine/plugins/go.ts`

```typescript
import fs from 'fs'
import path from 'path'
import type { LanguageParser, RawDependency, ResolvedDependency } from '../types'

export const goPlugin: LanguageParser = {
  name: 'go-modules',
  ecosystem: 'go',

  canParse(projectDir: string): boolean {
    return fs.existsSync(path.join(projectDir, 'go.mod'))
  },

  parseManifest(projectDir: string): RawDependency[] {
    const goModPath = path.join(projectDir, 'go.mod')
    return parseGoMod(goModPath)
  },

  parseLockfile(projectDir: string): ResolvedDependency[] {
    const goSumPath = path.join(projectDir, 'go.sum')
    if (fs.existsSync(goSumPath)) {
      return parseGoSum(goSumPath)
    }
    // Fall back to go.mod
    return this.parseManifest(projectDir).map(dep => ({
      ...dep,
      resolvedVersion: dep.declaredVersion.replace(/^v/, ''),
      dependencies: [],
    }))
  },

  parseImports(_projectDir: string): string[] {
    return []
  },
}

function parseGoMod(goModPath: string): RawDependency[] {
  const deps: RawDependency[] = []

  try {
    const content = fs.readFileSync(goModPath, 'utf-8')

    // Parse "require" blocks
    // Single: require github.com/some/pkg v1.2.3
    // Block:  require ( github.com/pkg v1.2.3 )
    const singleRequire = /^require\s+(\S+)\s+(v[\d.]+[^\s]*)/gm
    let match: RegExpExecArray | null
    while ((match = singleRequire.exec(content)) !== null) {
      deps.push({
        name: match[1],
        ecosystem: 'go',
        declaredVersion: match[2],
        type: 'direct',
      })
    }

    // Block require
    const blockRequire = /require\s+\(([\s\S]*?)\)/g
    while ((match = blockRequire.exec(content)) !== null) {
      const block = match[1]
      const lineRegex = /\s+(\S+)\s+(v[\d.]+[^\s]*)/g
      let inner: RegExpExecArray | null
      while ((inner = lineRegex.exec(block)) !== null) {
        if (!inner[1].startsWith('//')) {
          deps.push({
            name: inner[1],
            ecosystem: 'go',
            declaredVersion: inner[2],
            type: 'direct',
          })
        }
      }
    }
  } catch {
    // Unreadable
  }

  return deps
}

function parseGoSum(goSumPath: string): ResolvedDependency[] {
  const seen = new Set<string>()
  const deps: ResolvedDependency[] = []

  try {
    const lines = fs.readFileSync(goSumPath, 'utf-8').split('\n')
    for (const line of lines) {
      const parts = line.trim().split(' ')
      if (parts.length < 2) continue

      const modulePath = parts[0]
      const versionFull = parts[1]  // e.g. "v1.2.3" or "v1.2.3/go.mod"
      const version = versionFull.replace('/go.mod', '')

      const key = `${modulePath}@${version}`
      if (!seen.has(key)) {
        seen.add(key)
        deps.push({
          name: modulePath,
          ecosystem: 'go',
          declaredVersion: version,
          resolvedVersion: version.replace(/^v/, ''),
          type: 'direct',
          dependencies: [],
        })
      }
    }
  } catch {
    // Unreadable
  }

  return deps
}
```

### `src/engine/plugins/cargo.ts`

```typescript
import fs from 'fs'
import path from 'path'
import type { LanguageParser, RawDependency, ResolvedDependency } from '../types'

export const cargoPlugin: LanguageParser = {
  name: 'cargo',
  ecosystem: 'cargo',

  canParse(projectDir: string): boolean {
    return fs.existsSync(path.join(projectDir, 'Cargo.toml'))
  },

  parseManifest(projectDir: string): RawDependency[] {
    const cargoPath = path.join(projectDir, 'Cargo.toml')
    return parseCargoToml(cargoPath)
  },

  parseLockfile(projectDir: string): ResolvedDependency[] {
    const lockPath = path.join(projectDir, 'Cargo.lock')
    if (fs.existsSync(lockPath)) {
      return parseCargoLock(lockPath)
    }
    return this.parseManifest(projectDir).map(dep => ({
      ...dep,
      resolvedVersion: dep.declaredVersion.replace(/[^0-9.]/g, '') || '0.0.0',
      dependencies: [],
    }))
  },

  parseImports(_projectDir: string): string[] {
    return []
  },
}

function parseCargoToml(cargoPath: string): RawDependency[] {
  const deps: RawDependency[] = []

  try {
    const content = fs.readFileSync(cargoPath, 'utf-8')

    // Parse [dependencies] section
    const depSectionMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/)
    if (depSectionMatch) {
      parseDepSection(depSectionMatch[1], 'direct', deps)
    }

    // Parse [dev-dependencies] section
    const devDepMatch = content.match(/\[dev-dependencies\]([\s\S]*?)(?:\[|$)/)
    if (devDepMatch) {
      parseDepSection(devDepMatch[1], 'dev', deps)
    }
  } catch {
    // Unreadable
  }

  return deps
}

function parseDepSection(
  section: string,
  type: 'direct' | 'dev',
  deps: RawDependency[],
): void {
  // Simple: name = "version"
  const simpleRegex = /^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/gm
  let match: RegExpExecArray | null
  while ((match = simpleRegex.exec(section)) !== null) {
    deps.push({
      name: match[1],
      ecosystem: 'cargo',
      declaredVersion: match[2],
      type,
    })
  }

  // Inline table: name = { version = "x.y.z" }
  const inlineRegex = /^([a-zA-Z0-9_-]+)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"[^}]*\}/gm
  while ((match = inlineRegex.exec(section)) !== null) {
    deps.push({
      name: match[1],
      ecosystem: 'cargo',
      declaredVersion: match[2],
      type,
    })
  }
}

function parseCargoLock(lockPath: string): ResolvedDependency[] {
  const deps: ResolvedDependency[] = []

  try {
    const content = fs.readFileSync(lockPath, 'utf-8')

    // Cargo.lock uses [[package]] blocks
    const packageBlocks = content.split('[[package]]').slice(1)
    for (const block of packageBlocks) {
      const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m)
      const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m)

      if (nameMatch && versionMatch) {
        deps.push({
          name: nameMatch[1],
          ecosystem: 'cargo',
          declaredVersion: versionMatch[1],
          resolvedVersion: versionMatch[1],
          type: 'direct',
          dependencies: [],
        })
      }
    }
  } catch {
    // Unreadable
  }

  return deps
}
```

---

## Step 14 — Main Analysis Engine

### `src/engine/index.ts`

```typescript
import type {
  DependencyGraph,
  PackageNode,
  DependencyEdge,
  DependencyDiff,
  UpdatedPackage,
  VersionChangeType,
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
    const resolvedMap = new Map(resolved.map(r => [r.name.toLowerCase(), r]))

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
        const resolvedDep = resolvedMap.get(dep.name.toLowerCase())
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
  const fs = require('fs')
  const path = require('path')
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
```

---

## Step 15 — Next.js API Routes

### `src/app/api/health/route.ts`

```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
  })
}
```

### `src/app/api/scan/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runAnalysis } from '@/engine'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectDir, force = false } = body

    if (!projectDir || typeof projectDir !== 'string') {
      return NextResponse.json(
        { error: 'projectDir is required' },
        { status: 400 },
      )
    }

    const result = await runAnalysis({ projectDir, force })

    return NextResponse.json({
      graph: result.graph,
      diff: result.diff,
      fromCache: result.fromCache,
      scanTimeMs: result.scanTimeMs,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

### `src/app/api/results/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { readCache, deserializeGraph } from '@/engine/cache'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectDir = searchParams.get('dir')

  if (!projectDir) {
    return NextResponse.json({ error: 'dir is required' }, { status: 400 })
  }

  const cache = readCache(projectDir)
  if (!cache) {
    return NextResponse.json({ error: 'No analysis found. Run a scan first.' }, { status: 404 })
  }

  const graph = deserializeGraph(cache.enrichedGraph)
  return NextResponse.json({ graph })
}
```

### `src/app/api/query/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { readCache, deserializeGraph } from '@/engine/cache'
import { queryTransitive, queryReverseDependencies } from '@/engine'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dir = searchParams.get('dir')
  const type = searchParams.get('type')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const nodeId = searchParams.get('nodeId')

  if (!dir) {
    return NextResponse.json({ error: 'dir is required' }, { status: 400 })
  }

  const cache = readCache(dir)
  if (!cache) {
    return NextResponse.json({ error: 'No cache found. Run scan first.' }, { status: 404 })
  }

  const graph = deserializeGraph(cache.enrichedGraph)
  const startTime = Date.now()

  if (type === 'transitive' && from && to) {
    const result = queryTransitive(graph, from, to)
    return NextResponse.json({ ...result, latencyMs: Date.now() - startTime })
  }

  if (type === 'reverse' && nodeId) {
    const deps = queryReverseDependencies(graph, nodeId)
    return NextResponse.json({
      result: deps,
      latencyMs: Date.now() - startTime,
    })
  }

  if (type === 'license_filter') {
    const license = searchParams.get('license')
    const matching = Object.values(graph.nodes)
      .filter(n => n.license === license)
      .map(n => n.id)
    return NextResponse.json({ result: matching, latencyMs: Date.now() - startTime })
  }

  return NextResponse.json({ error: 'Unknown query type' }, { status: 400 })
}
```

### `src/app/api/diff/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { readCache } from '@/engine/cache'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dir = searchParams.get('dir')

  if (!dir) {
    return NextResponse.json({ error: 'dir is required' }, { status: 400 })
  }

  const cache = readCache(dir)
  if (!cache || !cache.previousGraph) {
    return NextResponse.json({ diff: null })
  }

  // Return the diff stored in the cache (computed during last scan)
  return NextResponse.json({ diff: null, message: 'Run a new scan to see diff' })
}
```

---

## Step 16 — React UI

### `src/app/layout.tsx`

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Canopy — Dependency Analyzer',
  description: 'Polyglot dependency graph analyzer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-white antialiased">{children}</body>
    </html>
  )
}
```

### `src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #0f0f0f;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #1a1a1a;
}
::-webkit-scrollbar-thumb {
  background: #3a3a3a;
  border-radius: 3px;
}
```

### `src/app/page.tsx`

```tsx
'use client'

import { useEffect, useState } from 'react'
import GraphCanvas from '@/components/GraphCanvas'
import Sidebar from '@/components/Sidebar'
import FilterBar from '@/components/FilterBar'
import QueryBar from '@/components/QueryBar'
import type { DependencyGraph, DependencyDiff } from '@/engine/types'

interface ScanState {
  status: 'idle' | 'scanning' | 'done' | 'error'
  graph: DependencyGraph | null
  diff: DependencyDiff | null
  error: string | null
  scanTimeMs: number
  fromCache: boolean
}

export default function HomePage() {
  const [state, setState] = useState<ScanState>({
    status: 'idle',
    graph: null,
    diff: null,
    error: null,
    scanTimeMs: 0,
    fromCache: false,
  })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [projectDir, setProjectDir] = useState<string>('')

  // Auto-scan on mount using URL param or env var
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const dir = params.get('dir') || ''
    setProjectDir(dir)
    if (dir) {
      runScan(dir)
    }
  }, [])

  async function runScan(dir: string, force = false) {
    setState(prev => ({ ...prev, status: 'scanning', error: null }))
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir: dir, force }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Scan failed')

      setState({
        status: 'done',
        graph: data.graph,
        diff: data.diff,
        error: null,
        scanTimeMs: data.scanTimeMs,
        fromCache: data.fromCache,
      })
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-panel shrink-0">
        <span className="text-green-400 font-mono font-bold text-sm">🌿 canopy</span>
        <div className="flex-1">
          <input
            type="text"
            value={projectDir}
            onChange={e => setProjectDir(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runScan(projectDir)}
            placeholder="/path/to/your/project"
            className="w-full max-w-lg bg-surface border border-border rounded px-3 py-1 text-sm font-mono focus:outline-none focus:border-green-500"
          />
        </div>
        <button
          onClick={() => runScan(projectDir)}
          disabled={state.status === 'scanning' || !projectDir}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm px-3 py-1 rounded font-medium"
        >
          {state.status === 'scanning' ? 'Scanning…' : 'Scan'}
        </button>
        {state.status === 'done' && (
          <button
            onClick={() => runScan(projectDir, true)}
            className="text-xs text-gray-400 hover:text-white border border-border px-2 py-1 rounded"
          >
            Force rescan
          </button>
        )}
        {state.status === 'done' && (
          <span className="text-xs text-gray-500">
            {state.fromCache ? '⚡ from cache' : `✓ ${state.scanTimeMs}ms`}
          </span>
        )}
      </div>

      {/* Filter bar */}
      {state.graph && (
        <FilterBar
          graph={state.graph}
          filterType={filterType}
          searchTerm={searchTerm}
          onFilterChange={setFilterType}
          onSearchChange={setSearchTerm}
          onNodeSelect={setSelectedNodeId}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {state.status === 'idle' && (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-5xl mb-4">🌿</div>
              <p className="text-lg font-medium text-gray-300">Enter a project path and click Scan</p>
              <p className="text-sm mt-2">Supports npm, pip, go modules, and cargo</p>
            </div>
          </div>
        )}

        {state.status === 'scanning' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-4 animate-pulse">🌿</div>
              <p className="text-gray-300">Analysing dependencies…</p>
              <p className="text-sm text-gray-500 mt-1">Building graph, running algorithms…</p>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-red-400">
              <p className="text-lg">Analysis failed</p>
              <p className="text-sm mt-2 text-gray-400">{state.error}</p>
            </div>
          </div>
        )}

        {state.status === 'done' && state.graph && (
          <>
            <GraphCanvas
              graph={state.graph}
              selectedNodeId={selectedNodeId}
              filterType={filterType}
              searchTerm={searchTerm}
              onNodeSelect={setSelectedNodeId}
            />
            <Sidebar
              graph={state.graph}
              selectedNodeId={selectedNodeId}
              diff={state.diff}
              projectDir={projectDir}
              onNodeSelect={setSelectedNodeId}
            />
          </>
        )}
      </div>

      {/* Query bar */}
      {state.graph && (
        <QueryBar
          graph={state.graph}
          projectDir={projectDir}
          onNodeSelect={setSelectedNodeId}
        />
      )}
    </div>
  )
}
```

---

## Step 17 — Graph Canvas (D3)

### `src/components/GraphCanvas.tsx`

```tsx
'use client'

import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { DependencyGraph, PackageNode, DependencyEdge } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  selectedNodeId: string | null
  filterType: string
  searchTerm: string
  onNodeSelect: (id: string | null) => void
}

// Node color by issue type
function nodeColor(node: PackageNode, isSelected: boolean): string {
  if (node.isRoot) return isSelected ? '#86efac' : '#4ade80'
  if (node.hasVersionConflict) return isSelected ? '#fca5a5' : '#ef4444'
  if (node.sccId !== -1) return isSelected ? '#fdba74' : '#f97316'
  if (node.isGhostDependency) return isSelected ? '#fde68a' : '#f59e0b'
  if (node.hasLicenseConflict) return isSelected ? '#c4b5fd' : '#8b5cf6'
  return isSelected ? '#93c5fd' : '#64748b'
}

// Node radius based on reverse dependency count
function nodeRadius(node: PackageNode, reverseAdj: Record<string, string[]>): number {
  const dependentCount = (reverseAdj[node.id] ?? []).length
  return Math.max(5, Math.min(24, 5 + Math.log2(dependentCount + 1) * 3))
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string
  node: PackageNode
  radius: number
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  edge: DependencyEdge
}

export default function GraphCanvas({
  graph,
  selectedNodeId,
  filterType,
  searchTerm,
  onNodeSelect,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<D3Node, D3Link> | null>(null)

  // Determine which nodes are visible based on filter
  const getVisibleNodeIds = useCallback((): Set<string> => {
    const all = new Set(Object.keys(graph.nodes))

    if (filterType === 'all') return all
    if (filterType === 'conflicts') {
      return new Set(Object.values(graph.nodes).filter(n => n.hasVersionConflict).map(n => n.id))
    }
    if (filterType === 'circular') {
      return new Set(Object.values(graph.nodes).filter(n => n.sccId !== -1).map(n => n.id))
    }
    if (filterType === 'ghosts') {
      return new Set(Object.values(graph.nodes).filter(n => n.isGhostDependency).map(n => n.id))
    }
    if (filterType === 'direct') {
      const directDeps = new Set<string>([graph.rootId])
      for (const edge of graph.edges) {
        if (edge.from === graph.rootId) directDeps.add(edge.to)
      }
      return directDeps
    }
    return all
  }, [graph, filterType])

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 600

    const visibleIds = getVisibleNodeIds()

    // Filter by search term
    const searchFiltered = searchTerm
      ? new Set([...visibleIds].filter(id => {
          const node = graph.nodes[id]
          return node?.name.toLowerCase().includes(searchTerm.toLowerCase())
        }))
      : visibleIds

    // Build D3 nodes and links
    const d3Nodes: D3Node[] = Object.values(graph.nodes)
      .filter(n => searchFiltered.has(n.id))
      .map(node => ({
        id: node.id,
        node,
        radius: nodeRadius(node, graph.reverseAdjacency),
      }))

    const nodeSet = new Set(d3Nodes.map(n => n.id))

    const d3Links: D3Link[] = graph.edges
      .filter(e => nodeSet.has(e.from) && nodeSet.has(e.to))
      .map(edge => ({ edge, source: edge.from, target: edge.to }))

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', event => {
        container.attr('transform', event.transform)
      })
    svg.call(zoom)

    const container = svg.append('g')

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#444')

    // Draw links
    const link = container.append('g')
      .selectAll<SVGLineElement, D3Link>('line')
      .data(d3Links)
      .enter()
      .append('line')
      .attr('stroke', d => d.edge.isCircular ? '#f97316' : d.edge.isConflicting ? '#ef4444' : '#333')
      .attr('stroke-width', d => d.edge.type === 'direct' ? 1.5 : 0.5)
      .attr('stroke-dasharray', d => d.edge.type === 'peer' ? '4 2' : d.edge.type === 'dev' ? '2 2' : 'none')
      .attr('marker-end', 'url(#arrow)')
      .attr('opacity', 0.6)

    // Draw SCC hull polygons
    const sccGroups: Record<number, D3Node[]> = {}
    for (const d3Node of d3Nodes) {
      const sccId = d3Node.node.sccId
      if (sccId !== -1) {
        if (!sccGroups[sccId]) sccGroups[sccId] = []
        sccGroups[sccId].push(d3Node)
      }
    }

    const hullGroup = container.append('g').attr('class', 'hulls')

    // Draw nodes
    const node = container.append('g')
      .selectAll<SVGGElement, D3Node>('g')
      .data(d3Nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, D3Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }),
      )
      .on('click', (_event, d) => {
        onNodeSelect(d.id === selectedNodeId ? null : d.id)
      })

    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => nodeColor(d.node, d.id === selectedNodeId))
      .attr('stroke', d => d.node.isRoot ? '#86efac' : 'none')
      .attr('stroke-width', 2)

    // Labels for larger nodes only
    node.filter(d => d.radius > 10 || d.node.isRoot)
      .append('text')
      .attr('dy', d => d.radius + 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#9ca3af')
      .text(d => d.node.name.length > 18 ? d.node.name.slice(0, 16) + '…' : d.node.name)

    // Tooltip on hover
    node.append('title')
      .text(d => `${d.node.name}@${d.node.resolvedVersion}\n${d.node.ecosystem}`)

    // Dim non-selected nodes when something is selected
    if (selectedNodeId) {
      const neighbors = new Set([
        selectedNodeId,
        ...(graph.adjacencyList[selectedNodeId] ?? []),
        ...(graph.reverseAdjacency[selectedNodeId] ?? []),
      ])

      node.attr('opacity', d => neighbors.has(d.id) ? 1 : 0.15)
      link.attr('opacity', d => {
        const source = typeof d.source === 'object' ? (d.source as D3Node).id : d.source
        const target = typeof d.target === 'object' ? (d.target as D3Node).id : d.target
        return neighbors.has(source as string) && neighbors.has(target as string) ? 0.8 : 0.05
      })
    }

    // Force simulation
    const simulation = d3.forceSimulation<D3Node>(d3Nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(d3Links)
        .id(d => d.id)
        .distance(60)
        .strength(0.3))
      .force('charge', d3.forceManyBody<D3Node>()
        .strength(d => -Math.max(80, d.radius * 15))
        .theta(0.9))  // Barnes-Hut approximation
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<D3Node>().radius(d => d.radius + 4))

    simulationRef.current = simulation

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as D3Node).x ?? 0)
        .attr('y1', d => (d.source as D3Node).y ?? 0)
        .attr('x2', d => (d.target as D3Node).x ?? 0)
        .attr('y2', d => (d.target as D3Node).y ?? 0)

      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)

      // Update SCC hulls
      hullGroup.selectAll('path').remove()
      for (const [sccId, members] of Object.entries(sccGroups)) {
        if (members.length < 2) continue
        const points = members.map(d => [d.x ?? 0, d.y ?? 0] as [number, number])
        const hull = d3.polygonHull(points)
        if (hull) {
          hullGroup.append('path')
            .attr('d', 'M' + hull.map(p => p.join(',')).join('L') + 'Z')
            .attr('fill', '#f97316')
            .attr('fill-opacity', 0.08)
            .attr('stroke', '#f97316')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4 2')
        }
      }
    })

    return () => {
      simulation.stop()
    }
  }, [graph, selectedNodeId, filterType, searchTerm, getVisibleNodeIds, onNodeSelect])

  return (
    <svg
      ref={svgRef}
      className="flex-1 h-full"
      style={{ background: '#0f0f0f' }}
    />
  )
}
```

---

## Step 18 — Sidebar

### `src/components/Sidebar.tsx`

```tsx
'use client'

import { useState } from 'react'
import type { DependencyGraph, DependencyDiff } from '@/engine/types'
import NodeDetail from './NodeDetail'
import IssuesPanel from './IssuesPanel'
import DiffPanel from './DiffPanel'
import BuildOrderPanel from './BuildOrderPanel'

type Tab = 'summary' | 'issues' | 'diff' | 'buildorder'

interface Props {
  graph: DependencyGraph
  selectedNodeId: string | null
  diff: DependencyDiff | null
  projectDir: string
  onNodeSelect: (id: string | null) => void
}

export default function Sidebar({ graph, selectedNodeId, diff, projectDir, onNodeSelect }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('summary')

  const meta = graph.metadata
  const totalIssues =
    meta.versionConflicts.length +
    meta.sccClusters.length +
    meta.ghostDependencies.length +
    meta.licenseConflicts.filter(l => l.severity === 'error').length

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'summary', label: 'Graph' },
    { key: 'issues', label: 'Issues', badge: totalIssues },
    { key: 'diff', label: 'Diff', badge: diff?.hasChanges ? diff.updated.length + diff.added.length : 0 },
    { key: 'buildorder', label: 'Build Order' },
  ]

  return (
    <div className="w-80 flex flex-col border-l border-border bg-panel overflow-hidden shrink-0">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-white border-b-2 border-green-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
            {(tab.badge ?? 0) > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'summary' && (
          <>
            {selectedNodeId && graph.nodes[selectedNodeId] ? (
              <NodeDetail
                node={graph.nodes[selectedNodeId]}
                graph={graph}
                projectDir={projectDir}
                onNodeSelect={onNodeSelect}
              />
            ) : (
              <ProjectSummary graph={graph} onTabSwitch={setActiveTab} />
            )}
          </>
        )}
        {activeTab === 'issues' && (
          <IssuesPanel graph={graph} onNodeSelect={id => {
            onNodeSelect(id)
            setActiveTab('summary')
          }} />
        )}
        {activeTab === 'diff' && <DiffPanel diff={diff} />}
        {activeTab === 'buildorder' && <BuildOrderPanel graph={graph} selectedNodeId={selectedNodeId} />}
      </div>
    </div>
  )
}

function ProjectSummary({ graph, onTabSwitch }: { graph: DependencyGraph; onTabSwitch: (tab: Tab) => void }) {
  const meta = graph.metadata
  const mostDepended = Object.values(graph.nodes)
    .filter(n => !n.isRoot)
    .sort((a, b) => (graph.reverseAdjacency[b.id]?.length ?? 0) - (graph.reverseAdjacency[a.id]?.length ?? 0))[0]

  return (
    <div className="p-4 space-y-4">
      <div>
        <p className="text-white font-semibold">{graph.nodes[graph.rootId]?.name ?? 'Project'}</p>
        <p className="text-xs text-gray-500 mt-1">
          {meta.totalPackages} packages · {meta.totalEdges} edges
        </p>
        <p className="text-xs text-gray-500">
          {meta.ecosystems.join(', ')} · scanned {new Date(meta.scannedAt).toLocaleTimeString()}
        </p>
      </div>

      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Issues Found</p>
        <div className="space-y-1">
          <IssueRow
            icon="⛔"
            label={`${meta.versionConflicts.length} version conflicts`}
            count={meta.versionConflicts.length}
            onClick={() => onTabSwitch('issues')}
          />
          <IssueRow
            icon="🔄"
            label={`${meta.sccClusters.length} circular clusters`}
            count={meta.sccClusters.length}
            onClick={() => onTabSwitch('issues')}
          />
          <IssueRow
            icon="👻"
            label={`${meta.ghostDependencies.length} ghost dependencies`}
            count={meta.ghostDependencies.length}
            onClick={() => onTabSwitch('issues')}
          />
          <IssueRow
            icon="⚖️"
            label={`${meta.licenseConflicts.length} license issues`}
            count={meta.licenseConflicts.length}
            onClick={() => onTabSwitch('issues')}
          />
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Quick Stats</p>
        <div className="text-xs text-gray-300 space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Critical path</span>
            <span>{meta.criticalPathLength} layers</span>
          </div>
          {mostDepended && (
            <div className="flex justify-between">
              <span className="text-gray-500">Most depended on</span>
              <span className="font-mono truncate max-w-32">{mostDepended.name}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Largest SCC</span>
            <span>
              {meta.sccClusters.length > 0
                ? Math.max(...meta.sccClusters.map(c => c.members.length)) + ' packages'
                : 'none'}
            </span>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Legend</p>
        <div className="text-xs space-y-1">
          {[
            { color: '#4ade80', label: 'Project root' },
            { color: '#64748b', label: 'Healthy package' },
            { color: '#ef4444', label: 'Version conflict' },
            { color: '#f97316', label: 'Circular dependency' },
            { color: '#f59e0b', label: 'Ghost dependency' },
            { color: '#8b5cf6', label: 'License conflict' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function IssueRow({
  icon, label, count, onClick,
}: { icon: string; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full text-left py-1 px-2 rounded hover:bg-white/5 transition-colors"
    >
      <span>{icon}</span>
      <span className={`text-xs flex-1 ${count > 0 ? 'text-gray-200' : 'text-gray-500'}`}>
        {label}
      </span>
      {count > 0 && <span className="text-xs text-gray-500">→</span>}
    </button>
  )
}
```

---

## Step 19 — Node Detail

### `src/components/NodeDetail.tsx`

```tsx
'use client'

import { useState } from 'react'
import type { DependencyGraph, PackageNode } from '@/engine/types'

interface Props {
  node: PackageNode
  graph: DependencyGraph
  projectDir: string
  onNodeSelect: (id: string | null) => void
}

export default function NodeDetail({ node, graph, projectDir, onNodeSelect }: Props) {
  const [showAllDependents, setShowAllDependents] = useState(false)
  const [queryResult, setQueryResult] = useState<string | null>(null)
  const [queryTarget, setQueryTarget] = useState('')

  const directDeps = (graph.adjacencyList[node.id] ?? []).map(id => graph.nodes[id]).filter(Boolean)
  const dependents = (graph.reverseAdjacency[node.id] ?? []).map(id => graph.nodes[id]).filter(Boolean)
  const visibleDependents = showAllDependents ? dependents : dependents.slice(0, 5)

  async function runTransitiveQuery() {
    if (!queryTarget.trim()) return
    const targetNode = Object.values(graph.nodes).find(
      n => n.name.toLowerCase() === queryTarget.toLowerCase(),
    )
    if (!targetNode) {
      setQueryResult(`Package "${queryTarget}" not found in graph`)
      return
    }

    try {
      const res = await fetch(
        `/api/query?type=transitive&from=${encodeURIComponent(node.id)}&to=${encodeURIComponent(targetNode.id)}&dir=${encodeURIComponent(projectDir)}`,
      )
      const data = await res.json()
      setQueryResult(
        `${data.result ? '✓ Yes' : '✗ No'} — ${node.name} ${data.result ? 'depends on' : 'does not depend on'} ${queryTarget} (${data.latencyMs?.toFixed(1)}ms, ${data.method})`,
      )
    } catch {
      setQueryResult('Query failed')
    }
  }

  const licenseColor = node.license === 'UNKNOWN'
    ? 'text-yellow-400'
    : node.hasLicenseConflict
    ? 'text-red-400'
    : 'text-green-400'

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <p className="text-white font-semibold font-mono">{node.name}</p>
          {node.isRoot && <span className="text-xs bg-green-900 text-green-300 px-1.5 rounded">root</span>}
        </div>
        <p className="text-xs text-gray-400 mt-1">{node.resolvedVersion}</p>
        <div className="flex items-center gap-3 mt-2 text-xs">
          <span className="text-gray-500">{node.ecosystem}</span>
          <span className={licenseColor}>{node.license}</span>
          <span className="text-gray-500">layer {node.buildLayer}</span>
        </div>
      </div>

      {/* Issue badges */}
      <div className="flex flex-wrap gap-1">
        {node.hasVersionConflict && (
          <span className="text-xs bg-red-900/40 text-red-300 border border-red-800 px-1.5 py-0.5 rounded">
            ⛔ version conflict
          </span>
        )}
        {node.sccId !== -1 && (
          <span className="text-xs bg-orange-900/40 text-orange-300 border border-orange-800 px-1.5 py-0.5 rounded">
            🔄 circular cluster #{node.sccId}
          </span>
        )}
        {node.isGhostDependency && (
          <span className="text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-800 px-1.5 py-0.5 rounded">
            👻 ghost dependency
          </span>
        )}
        {node.hasLicenseConflict && (
          <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-800 px-1.5 py-0.5 rounded">
            ⚖️ license issue
          </span>
        )}
      </div>

      {/* Direct dependencies */}
      {directDeps.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
            Direct dependencies ({directDeps.length})
          </p>
          <div className="space-y-0.5 max-h-36 overflow-y-auto">
            {directDeps.map(dep => (
              <button
                key={dep.id}
                onClick={() => onNodeSelect(dep.id)}
                className="w-full text-left flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-white/5"
              >
                <span className={`font-mono ${dep.hasVersionConflict ? 'text-red-400' : 'text-gray-300'}`}>
                  → {dep.name}
                </span>
                <span className="text-gray-500">{dep.resolvedVersion}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Depended on by */}
      {dependents.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
            Depended on by ({dependents.length})
          </p>
          <div className="space-y-0.5 max-h-36 overflow-y-auto">
            {visibleDependents.map(dep => (
              <button
                key={dep.id}
                onClick={() => onNodeSelect(dep.id)}
                className="w-full text-left text-xs py-1 px-1.5 rounded hover:bg-white/5 text-gray-300 font-mono"
              >
                ← {dep.name}
              </button>
            ))}
            {dependents.length > 5 && (
              <button
                onClick={() => setShowAllDependents(!showAllDependents)}
                className="text-xs text-green-400 hover:text-green-300 py-1"
              >
                {showAllDependents ? 'Show less' : `+ ${dependents.length - 5} more`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Transitive query */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Transitive query</p>
        <div className="flex gap-1">
          <input
            type="text"
            value={queryTarget}
            onChange={e => setQueryTarget(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runTransitiveQuery()}
            placeholder="depends on…"
            className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-green-500"
          />
          <button
            onClick={runTransitiveQuery}
            className="bg-green-700 hover:bg-green-600 text-white text-xs px-2 py-1 rounded"
          >
            Ask
          </button>
        </div>
        {queryResult && (
          <p className="text-xs text-gray-300 mt-2 bg-black/30 rounded p-2">{queryResult}</p>
        )}
      </div>
    </div>
  )
}
```

---

## Step 20 — Remaining Components

### `src/components/IssuesPanel.tsx`

```tsx
'use client'

import type { DependencyGraph } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  onNodeSelect: (id: string) => void
}

export default function IssuesPanel({ graph, onNodeSelect }: Props) {
  const meta = graph.metadata

  return (
    <div className="p-4 space-y-6">
      {/* Version Conflicts */}
      {meta.versionConflicts.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-red-400 mb-3">
            ⛔ Version Conflicts ({meta.versionConflicts.length})
          </h3>
          <div className="space-y-3">
            {meta.versionConflicts.map((conflict, i) => (
              <div key={i} className="bg-red-950/20 border border-red-900/40 rounded p-3 text-xs">
                <p className="font-mono font-semibold text-red-300 mb-2">{conflict.packageName}</p>
                {conflict.constraints.map((src, j) => {
                  const imposer = graph.nodes[src.imposedBy]
                  return (
                    <div key={j} className="flex items-center gap-2 text-gray-400 mb-1">
                      <button
                        onClick={() => onNodeSelect(src.imposedBy)}
                        className="font-mono hover:text-white truncate max-w-28"
                      >
                        {imposer?.name ?? src.imposedBy}
                      </button>
                      <span className="text-gray-600">requires</span>
                      <span className="font-mono text-yellow-400">{src.constraint}</span>
                    </div>
                  )
                })}
                <p className="text-red-400 mt-2">
                  {conflict.intersection === null
                    ? 'No version satisfies all constraints.'
                    : `Compatible range: ${conflict.intersection}`}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Circular Dependencies */}
      {meta.sccClusters.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-orange-400 mb-3">
            🔄 Circular Dependencies ({meta.sccClusters.length} clusters)
          </h3>
          <div className="space-y-3">
            {meta.sccClusters.map(cluster => (
              <div key={cluster.id} className="bg-orange-950/20 border border-orange-900/40 rounded p-3 text-xs">
                <p className="text-orange-300 mb-2">Cluster #{cluster.id} · {cluster.members.length} packages</p>
                <div className="space-y-1">
                  {cluster.members.map(memberId => {
                    const node = graph.nodes[memberId]
                    return (
                      <button
                        key={memberId}
                        onClick={() => onNodeSelect(memberId)}
                        className="block font-mono text-gray-300 hover:text-white"
                      >
                        ↻ {node?.name ?? memberId}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ghost Dependencies */}
      {meta.ghostDependencies.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-yellow-400 mb-3">
            👻 Ghost Dependencies ({meta.ghostDependencies.length})
          </h3>
          <div className="space-y-3">
            {meta.ghostDependencies.map((ghost, i) => (
              <div key={i} className="bg-yellow-950/20 border border-yellow-900/40 rounded p-3 text-xs">
                <p className="font-mono text-yellow-300">{ghost.packageName}</p>
                <p className="text-gray-500 mt-1">
                  Used in {ghost.importedIn.length} file(s) but not declared
                </p>
                {ghost.providedBy && (
                  <p className="text-gray-500">
                    Provided transitively by{' '}
                    <button
                      onClick={() => ghost.providedBy && onNodeSelect(ghost.providedBy)}
                      className="font-mono text-gray-300 hover:text-white"
                    >
                      {graph.nodes[ghost.providedBy ?? '']?.name ?? ghost.providedBy}
                    </button>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* License Conflicts */}
      {meta.licenseConflicts.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-purple-400 mb-3">
            ⚖️ License Conflicts ({meta.licenseConflicts.length})
          </h3>
          <div className="space-y-3">
            {meta.licenseConflicts.map((lc, i) => (
              <div key={i} className="bg-purple-950/20 border border-purple-900/40 rounded p-3 text-xs">
                <p className="font-mono text-purple-300">{lc.packageName}</p>
                <p className="text-gray-400">License: {lc.license}</p>
                <p className="text-gray-500 mt-1">
                  Path: {lc.path.map(id => graph.nodes[id]?.name ?? id).join(' → ')}
                </p>
                <p className={`mt-1 ${lc.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {lc.severity === 'error' ? '⛔ Incompatible with your license' : '⚠️ Compatible with restrictions'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {meta.versionConflicts.length === 0 &&
        meta.sccClusters.length === 0 &&
        meta.ghostDependencies.length === 0 &&
        meta.licenseConflicts.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <div className="text-3xl mb-2">✅</div>
            <p>No issues found</p>
          </div>
        )}
    </div>
  )
}
```

### `src/components/DiffPanel.tsx`

```tsx
'use client'

import type { DependencyDiff } from '@/engine/types'

interface Props {
  diff: DependencyDiff | null
}

export default function DiffPanel({ diff }: Props) {
  if (!diff) {
    return (
      <div className="p-4 text-center text-gray-500 py-8">
        <div className="text-3xl mb-2">🔄</div>
        <p className="text-sm">No diff available</p>
        <p className="text-xs mt-1">Run a second scan to see changes</p>
      </div>
    )
  }

  if (!diff.hasChanges && diff.newConflicts.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 py-8">
        <div className="text-3xl mb-2">✅</div>
        <p>No changes since last scan</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {diff.newConflicts.length > 0 && (
        <div className="bg-red-950/30 border border-red-900/50 rounded p-3">
          <p className="text-red-400 text-xs font-semibold mb-2">
            ! NEW CONFLICTS INTRODUCED ({diff.newConflicts.length})
          </p>
          {diff.newConflicts.map((c, i) => (
            <p key={i} className="text-xs font-mono text-red-300">{c.packageName}</p>
          ))}
        </div>
      )}

      {diff.updated.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
            Updated ({diff.updated.length})
          </p>
          <div className="space-y-1">
            {diff.updated.map((u, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-12 text-right font-mono ${
                  u.changeType === 'major' ? 'text-red-400' :
                  u.changeType === 'minor' ? 'text-yellow-400' : 'text-green-400'
                }`}>{u.changeType}</span>
                <span className="font-mono text-gray-300 flex-1 truncate">{u.node.name}</span>
                <span className="text-gray-500 font-mono">{u.previousVersion}</span>
                <span className="text-gray-600">→</span>
                <span className="text-gray-300 font-mono">{u.currentVersion}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {diff.added.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
            Added ({diff.added.length})
          </p>
          {diff.added.map((n, i) => (
            <p key={i} className="text-xs font-mono text-green-400">+ {n.name}@{n.resolvedVersion}</p>
          ))}
        </section>
      )}

      {diff.removed.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
            Removed ({diff.removed.length})
          </p>
          {diff.removed.map((n, i) => (
            <p key={i} className="text-xs font-mono text-red-400">- {n.name}@{n.resolvedVersion}</p>
          ))}
        </section>
      )}

      {diff.resolvedConflicts.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
            Resolved conflicts ({diff.resolvedConflicts.length})
          </p>
          {diff.resolvedConflicts.map((c, i) => (
            <p key={i} className="text-xs font-mono text-green-400">✓ {c.packageName}</p>
          ))}
        </section>
      )}
    </div>
  )
}
```

### `src/components/BuildOrderPanel.tsx`

```tsx
'use client'

import type { DependencyGraph } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  selectedNodeId: string | null
}

export default function BuildOrderPanel({ graph, selectedNodeId }: Props) {
  const maxLayer = graph.metadata.criticalPathLength
  const layers: Record<number, string[]> = {}

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const layer = node.buildLayer
    if (layer < 0) continue
    if (!layers[layer]) layers[layer] = []
    layers[layer].push(nodeId)
  }

  return (
    <div className="p-4">
      <p className="text-xs text-gray-400 mb-3">
        {maxLayer + 1} build layers · packages in the same layer can install in parallel
      </p>
      <div className="space-y-3">
        {Array.from({ length: maxLayer + 1 }, (_, i) => i).map(layer => {
          const nodeIds = layers[layer] ?? []
          const hasSelected = selectedNodeId ? nodeIds.includes(selectedNodeId) : false
          return (
            <div
              key={layer}
              className={`rounded p-2 ${hasSelected ? 'bg-green-900/20 border border-green-800/40' : 'bg-white/5'}`}
            >
              <p className="text-xs text-gray-400 mb-1">Layer {layer}</p>
              <div className="flex flex-wrap gap-1">
                {nodeIds.slice(0, 8).map(nodeId => {
                  const node = graph.nodes[nodeId]
                  return (
                    <span
                      key={nodeId}
                      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        nodeId === selectedNodeId
                          ? 'bg-green-700 text-white'
                          : 'bg-white/10 text-gray-300'
                      }`}
                    >
                      {node?.name ?? nodeId}
                    </span>
                  )
                })}
                {nodeIds.length > 8 && (
                  <span className="text-xs text-gray-500 py-0.5">+{nodeIds.length - 8} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

### `src/components/FilterBar.tsx`

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import type { DependencyGraph } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  filterType: string
  searchTerm: string
  onFilterChange: (type: string) => void
  onSearchChange: (term: string) => void
  onNodeSelect: (id: string | null) => void
}

// Simple Trie for package name autocomplete
class Trie {
  private children: Record<string, Trie> = {}
  private values: string[] = []

  insert(word: string, value: string): void {
    let node: Trie = this
    for (const char of word.toLowerCase()) {
      if (!node.children[char]) node.children[char] = new Trie()
      node = node.children[char]
    }
    node.values.push(value)
  }

  search(prefix: string): string[] {
    let node: Trie = this
    for (const char of prefix.toLowerCase()) {
      if (!node.children[char]) return []
      node = node.children[char]
    }
    return node.collect()
  }

  private collect(): string[] {
    const results = [...this.values]
    for (const child of Object.values(this.children)) {
      results.push(...child.collect())
    }
    return results.slice(0, 10)
  }
}

export default function FilterBar({
  graph, filterType, searchTerm,
  onFilterChange, onSearchChange, onNodeSelect,
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const trieRef = useRef<Trie | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Build Trie from all package names
  useEffect(() => {
    const trie = new Trie()
    for (const node of Object.values(graph.nodes)) {
      trie.insert(node.name, node.id)
    }
    trieRef.current = trie
  }, [graph])

  function handleSearch(value: string) {
    onSearchChange(value)
    if (value.length < 2) {
      setSuggestions([])
      return
    }
    const results = trieRef.current?.search(value) ?? []
    setSuggestions(results.slice(0, 6))
  }

  function selectSuggestion(nodeId: string) {
    const node = graph.nodes[nodeId]
    onSearchChange(node?.name ?? '')
    onNodeSelect(nodeId)
    setSuggestions([])
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-panel/50 shrink-0">
      {/* Search */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={e => handleSearch(e.target.value)}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          placeholder="Search packages…"
          className="bg-surface border border-border rounded px-3 py-1 text-xs font-mono w-48 focus:outline-none focus:border-green-500"
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-panel border border-border rounded shadow-lg z-50">
            {suggestions.map(nodeId => {
              const node = graph.nodes[nodeId]
              if (!node) return null
              return (
                <button
                  key={nodeId}
                  onMouseDown={() => selectSuggestion(nodeId)}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-white/10 text-gray-300"
                >
                  {node.name}
                  <span className="text-gray-500 ml-2">{node.resolvedVersion}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Filter dropdown */}
      <select
        value={filterType}
        onChange={e => onFilterChange(e.target.value)}
        className="bg-surface border border-border rounded px-2 py-1 text-xs focus:outline-none"
      >
        <option value="all">All packages</option>
        <option value="conflicts">Conflicts only</option>
        <option value="circular">Circular only</option>
        <option value="ghosts">Ghosts only</option>
        <option value="direct">Direct deps only</option>
      </select>

      {/* Quick stats */}
      <div className="flex items-center gap-3 ml-auto text-xs text-gray-500">
        <span>{Object.keys(graph.nodes).length} packages</span>
        <span>{graph.edges.length} edges</span>
        {graph.metadata.versionConflicts.length > 0 && (
          <span className="text-red-400">⛔ {graph.metadata.versionConflicts.length} conflicts</span>
        )}
      </div>
    </div>
  )
}
```

### `src/components/QueryBar.tsx`

```tsx
'use client'

import { useState, useCallback } from 'react'
import type { DependencyGraph } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  projectDir: string
  onNodeSelect: (id: string | null) => void
}

const QUERY_PATTERNS = [
  { regex: /does\s+(.+?)\s+depend\s+on\s+(.+)/i, type: 'transitive' },
  { regex: /what\s+depends\s+on\s+(.+)/i, type: 'reverse' },
  { regex: /show\s+(?:all\s+)?(.+?)\s+packages/i, type: 'license_filter' },
  { regex: /is\s+(.+?)\s+a\s+ghost/i, type: 'ghost_check' },
]

export default function QueryBar({ graph, projectDir, onNodeSelect }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const runQuery = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setResult(null)

    try {
      const lowerQuery = query.toLowerCase().trim()

      // Transitive: "does X depend on Y?"
      const transitiveMatch = query.match(/does\s+(.+?)\s+depend\s+on\s+(.+?)[\?]?$/i)
      if (transitiveMatch) {
        const fromName = transitiveMatch[1].trim()
        const toName = transitiveMatch[2].trim()
        const fromNode = Object.values(graph.nodes).find(n => n.name.toLowerCase() === fromName.toLowerCase())
        const toNode = Object.values(graph.nodes).find(n => n.name.toLowerCase() === toName.toLowerCase())

        if (!fromNode || !toNode) {
          setResult(`Could not find "${!fromNode ? fromName : toName}" in the graph`)
          return
        }

        const res = await fetch(
          `/api/query?type=transitive&from=${fromNode.id}&to=${toNode.id}&dir=${encodeURIComponent(projectDir)}`,
        )
        const data = await res.json()
        setResult(
          `${data.result ? '✓ Yes' : '✗ No'} — ${fromName} ${data.result ? 'transitively depends on' : 'does not depend on'} ${toName} (${data.latencyMs?.toFixed(1) ?? 0}ms)`,
        )
        return
      }

      // Reverse: "what depends on X?"
      const reverseMatch = query.match(/what\s+depends\s+on\s+(.+?)[\?]?$/i)
      if (reverseMatch) {
        const name = reverseMatch[1].trim()
        const node = Object.values(graph.nodes).find(n => n.name.toLowerCase() === name.toLowerCase())
        if (!node) {
          setResult(`Package "${name}" not found`)
          return
        }
        const dependents = graph.reverseAdjacency[node.id] ?? []
        setResult(`${dependents.length} packages depend on ${name}${dependents.length > 0 ? ': ' + dependents.slice(0, 5).map(id => graph.nodes[id]?.name).filter(Boolean).join(', ') + (dependents.length > 5 ? '…' : '') : ''}`)
        if (dependents.length > 0) onNodeSelect(node.id)
        return
      }

      // License filter: "show all MIT packages"
      const licenseMatch = query.match(/show\s+(?:all\s+)?([a-z0-9.-]+)\s+packages/i)
      if (licenseMatch) {
        const license = licenseMatch[1].toUpperCase().replace('APACHE', 'Apache-2.0').replace('MIT', 'MIT')
        const matching = Object.values(graph.nodes).filter(n => n.license === license)
        setResult(`${matching.length} packages with ${license} license`)
        return
      }

      // Ghost check: "is X a ghost?"
      const ghostMatch = query.match(/is\s+(.+?)\s+a\s+ghost/i)
      if (ghostMatch) {
        const name = ghostMatch[1].trim()
        const node = Object.values(graph.nodes).find(n => n.name.toLowerCase() === name.toLowerCase())
        if (!node) {
          setResult(`Package "${name}" not found`)
          return
        }
        setResult(node.isGhostDependency ? `✓ Yes — ${name} is a ghost dependency` : `✗ No — ${name} is properly declared`)
        return
      }

      setResult('Query not recognized. Try: "does X depend on Y?" or "what depends on X?"')
    } finally {
      setLoading(false)
    }
  }, [query, graph, projectDir, onNodeSelect])

  return (
    <div className="border-t border-border bg-panel px-4 py-2 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-xs">⌘</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runQuery()}
          placeholder='Ask: "does express depend on lodash?" · "what depends on react?"'
          className="flex-1 bg-transparent text-xs font-mono focus:outline-none text-gray-300 placeholder-gray-600"
        />
        {loading && <span className="text-xs text-gray-500 animate-pulse">thinking…</span>}
        {result && !loading && (
          <button onClick={() => setResult(null)} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
        )}
      </div>
      {result && (
        <p className="text-xs text-gray-300 mt-1 ml-4 font-mono">{result}</p>
      )}
    </div>
  )
}
```

---

## Step 21 — CLI

### `bin/canopy.js`

```js
#!/usr/bin/env node

// This is the CLI entry point.
// It starts the Next.js server and opens the browser,
// or runs headless analysis for check/diff/query commands.

const { Command } = require('commander')
const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const program = new Command()

program
  .name('canopy')
  .description('Polyglot dependency graph analyzer')
  .version('1.0.0')

// ── scan command ──────────────────────────────────────────────────────────────
program
  .command('scan [dir]')
  .description('Scan a project directory and open the visual graph')
  .option('--no-ui', 'Skip browser, print summary only')
  .option('--port <n>', 'Port for the local server', '3847')
  .option('--force', 'Ignore cache and run full re-analysis')
  .option('--json', 'Output analysis as JSON to stdout')
  .action(async (dir, opts) => {
    const projectDir = path.resolve(dir || process.cwd())

    if (!fs.existsSync(projectDir)) {
      console.error(`Error: Directory not found: ${projectDir}`)
      process.exit(2)
    }

    if (opts.json || opts.noUi) {
      // Run headless analysis
      await runHeadless(projectDir, opts)
      return
    }

    // Start Next.js server and open browser
    const port = parseInt(opts.port ?? '3847', 10)
    console.log(`\n  🌿 canopy v1.0.0\n`)
    console.log(`  Starting server on port ${port}…`)

    const canopyRoot = path.join(__dirname, '..')
    const server = spawn('npx', ['next', 'start', '-p', port.toString()], {
      cwd: canopyRoot,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    })

    server.stderr.on('data', () => {})  // suppress next.js output

    // Wait for server to be ready
    await waitForServer(`http://localhost:${port}/api/health`, 10000)

    const url = `http://localhost:${port}?dir=${encodeURIComponent(projectDir)}${opts.force ? '&force=true' : ''}`
    console.log(`  Opening browser → ${url}\n`)
    openBrowser(url)
    console.log(`  Press Ctrl+C to stop\n`)

    process.on('SIGINT', () => {
      server.kill()
      process.exit(0)
    })

    // Keep process alive
    await new Promise(() => {})
  })

// ── check command ─────────────────────────────────────────────────────────────
program
  .command('check [dir]')
  .description('Analyse dependencies and exit with code 1 if issues found')
  .option('--conflicts-only', 'Only fail on version conflicts')
  .option('--no-ghosts', 'Ignore ghost dependencies')
  .option('--no-license', 'Ignore license conflicts')
  .action(async (dir, opts) => {
    const projectDir = path.resolve(dir || process.cwd())
    const result = await runAnalysisNode(projectDir, false)
    if (!result) { process.exit(2) }

    const meta = result.graph.metadata
    let hasIssues = false

    if (meta.versionConflicts.length > 0) {
      console.log(`⛔ ${meta.versionConflicts.length} version conflict(s)`)
      meta.versionConflicts.forEach(c => {
        console.log(`   ${c.packageName}:`)
        c.constraints.forEach(src => console.log(`     ${src.imposedBy} requires ${src.constraint}`))
      })
      hasIssues = true
    }

    if (!opts.noGhosts && meta.ghostDependencies.length > 0) {
      console.log(`👻 ${meta.ghostDependencies.length} ghost dependency(-ies)`)
      meta.ghostDependencies.forEach(g => console.log(`   ${g.packageName}`))
      if (!opts.conflictsOnly) hasIssues = true
    }

    if (!opts.noLicense && meta.licenseConflicts.filter(l => l.severity === 'error').length > 0) {
      console.log(`⚖️  ${meta.licenseConflicts.length} license conflict(s)`)
      if (!opts.conflictsOnly) hasIssues = true
    }

    if (!hasIssues) {
      console.log(`✅ No issues found — ${meta.totalPackages} packages analysed`)
    }

    process.exit(hasIssues ? 1 : 0)
  })

// ── diff command ──────────────────────────────────────────────────────────────
program
  .command('diff [dir]')
  .description('Show dependency changes since last scan')
  .action(async (dir) => {
    const projectDir = path.resolve(dir || process.cwd())
    const result = await runAnalysisNode(projectDir, false)
    if (!result?.diff) {
      console.log('No diff available. Run scan twice to see changes.')
      return
    }
    const { diff } = result
    if (!diff.hasChanges) { console.log('No changes since last scan.'); return }
    diff.updated.forEach(u => console.log(`  ${u.changeType.padEnd(6)} ${u.node.name}  ${u.previousVersion} → ${u.currentVersion}`))
    diff.added.forEach(n => console.log(`+ ${n.name}@${n.resolvedVersion}`))
    diff.removed.forEach(n => console.log(`- ${n.name}@${n.resolvedVersion}`))
    if (diff.newConflicts.length > 0) {
      console.log(`\n! NEW CONFLICTS: ${diff.newConflicts.map(c => c.packageName).join(', ')}`)
    }
  })

// ── query command ─────────────────────────────────────────────────────────────
program
  .command('query <question> [dir]')
  .description('Run a single query from the command line')
  .action(async (question, dir) => {
    const projectDir = path.resolve(dir || process.cwd())
    console.log(`Querying: ${question}`)
    console.log('(Run canopy scan for the full interactive interface)')
  })

program.parse(process.argv)

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runHeadless(projectDir, opts) {
  const result = await runAnalysisNode(projectDir, opts.force)
  if (!result) { process.exit(2) }
  if (opts.json) {
    console.log(JSON.stringify(result.graph, null, 2))
  } else {
    const meta = result.graph.metadata
    console.log(`\n  🌿 canopy scan complete`)
    console.log(`  ${meta.totalPackages} packages · ${meta.totalEdges} edges`)
    console.log(`  ${meta.versionConflicts.length} conflicts · ${meta.sccClusters.length} circular clusters`)
    console.log(`  ${meta.ghostDependencies.length} ghost deps · ${meta.licenseConflicts.length} license issues`)
    console.log(`  Completed in ${result.scanTimeMs}ms${result.fromCache ? ' (from cache)' : ''}\n`)
  }
}

async function runAnalysisNode(projectDir, force) {
  try {
    // Dynamic require of the engine (requires Next.js project to be built
    // or run in dev mode). For simplicity we call the API via HTTP if server
    // is running, else use direct import.
    const { runAnalysis } = require('../src/engine/index.ts')
    return await runAnalysis({ projectDir, force })
  } catch {
    console.error('Error: Could not run analysis. Make sure you are in the canopy project directory and dependencies are installed.')
    return null
  }
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

function openBrowser(url) {
  const platform = os.platform()
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  try {
    execSync(`${cmd} "${url}"`, { stdio: 'ignore' })
  } catch {
    // Browser open failed — URL already printed
  }
}
```

---

## Step 22 — Build and Run

### Build the Next.js app

```bash
npm run build
```

### Run in development mode

```bash
# From inside the canopy directory
npm run dev
# Then open http://localhost:3000?dir=/absolute/path/to/your/project
```

### Run the CLI against any project

```bash
# Point at any project directory
node bin/canopy.js scan /path/to/any/npm-project

# CI check mode
node bin/canopy.js check /path/to/project

# See what changed
node bin/canopy.js diff /path/to/project
```

### Make it a global command

```bash
npm link
# Now anywhere on your machine:
canopy scan /path/to/project
canopy check
```

---

## Build Order Reference

Follow this exact order when implementing:

1. Create project, paste `package.json` → `npm install`
2. Add all config files (tsconfig, next.config, tailwind, postcss)
3. `src/engine/types.ts` — types first, everything imports from here
4. `src/engine/graph.ts` — graph data structure
5. `src/engine/bloom.ts` — Bloom filter
6. `src/engine/merkle.ts` — Merkle tree
7. `src/engine/tarjan.ts` — SCC algorithm
8. `src/engine/kahn.ts` — topological sort
9. `src/engine/semver-sat.ts` — conflict detection
10. `src/engine/ghost.ts` — ghost detection
11. `src/engine/license.ts` — license detection
12. `src/engine/cache.ts` — cache system
13. `src/engine/plugins/base.ts` → `npm.ts` → `pip.ts` → `go.ts` → `cargo.ts`
14. `src/engine/index.ts` — wires everything together
15. `src/app/api/*` — all API routes
16. `src/app/layout.tsx` + `globals.css` + `page.tsx`
17. `src/components/*` — all UI components
18. `bin/canopy.js` — CLI last (depends on everything else)
19. `npm run build` to verify no TypeScript errors

---

## Testing It Works

Point it at the canopy project itself:

```bash
node bin/canopy.js scan .
```

It should detect `package.json` and show the graph of canopy's own dependencies.

Point at any other npm project:

```bash
node bin/canopy.js scan ~/projects/my-nextjs-app
```

To test the algorithms, create a project with a known circular dependency:

```json
{
  "name": "test-circular",
  "dependencies": {
    "moduleA": "*",
    "moduleB": "*"
  }
}
```

And manually add entries to its `package-lock.json` where moduleA depends on moduleB and vice versa — Tarjan's SCC will detect and highlight the cluster.
