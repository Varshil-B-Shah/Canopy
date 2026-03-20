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
