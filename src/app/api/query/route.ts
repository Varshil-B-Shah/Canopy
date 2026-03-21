import { NextRequest, NextResponse } from 'next/server'
import { readCache, deserializeGraph } from '@/engine/cache'
import { queryTransitive, queryReverseDependencies } from '@/engine'
import type { DependencyGraph } from '@/engine/types'

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

// ─── Path Finding Helper ─────────────────────────────────────────────────────

/**
 * Finds the dependency path from one package to another using BFS
 * Returns the actual path array or null if no path exists
 */
function findDependencyPath(
  graph: DependencyGraph,
  fromId: string,
  toId: string
): string[] | null {
  if (fromId === toId) {
    return [fromId]
  }

  if (!graph.nodes[fromId] || !graph.nodes[toId]) {
    return null
  }

  // BFS with path tracking
  const visited = new Set<string>()
  const queue: Array<{ nodeId: string; path: string[] }> = [
    { nodeId: fromId, path: [fromId] }
  ]

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!

    if (visited.has(nodeId)) {
      continue
    }
    visited.add(nodeId)

    // Check if we've reached the target
    if (nodeId === toId) {
      return path
    }

    // Add neighbors to queue with extended path
    const neighbors = graph.adjacencyList[nodeId] || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push({
          nodeId: neighbor,
          path: [...path, neighbor]
        })
      }
    }
  }

  return null // No path found
}

// ADD new POST method for CLI compatibility
export async function POST(request: NextRequest) {
  try {
    const { type, fromId, toId, projectDir } = await request.json()

    if (!type || type !== 'transitive') {
      return Response.json(
        { error: true, message: 'Only transitive queries supported', code: 'INVALID_QUERY_TYPE' },
        { status: 400 }
      )
    }

    if (!fromId || !toId) {
      return Response.json(
        { error: true, message: 'fromId and toId are required', code: 'MISSING_PARAMETERS' },
        { status: 400 }
      )
    }

    if (!projectDir) {
      return Response.json(
        { error: true, message: 'projectDir is required', code: 'MISSING_PROJECT_DIR' },
        { status: 400 }
      )
    }

    // Load graph from cache
    const cache = readCache(projectDir)
    if (!cache) {
      return Response.json(
        { error: true, message: 'No analysis found. Run scan first.', code: 'NO_ANALYSIS' },
        { status: 404 }
      )
    }

    const graph = deserializeGraph(cache.enrichedGraph)

    // Use existing query engine with proper parameters
    const result = queryTransitive(graph, fromId, toId)

    // If no path exists, return early
    if (!result.result) {
      return Response.json({
        found: false,
        path: [],
        distance: -1
      })
    }

    // Find the actual dependency path using BFS
    const path = findDependencyPath(graph, fromId, toId)

    return Response.json({
      found: result.result,
      path: path || [],
      distance: path ? path.length - 1 : -1
    })

  } catch (error) {
    console.error('Query API error:', error)
    return Response.json(
      {
        error: true,
        message: error instanceof Error ? error.message : 'Query failed',
        code: 'QUERY_FAILED'
      },
      { status: 500 }
    )
  }
}