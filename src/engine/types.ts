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
