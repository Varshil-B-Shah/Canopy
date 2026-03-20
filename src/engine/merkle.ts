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
