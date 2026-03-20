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
