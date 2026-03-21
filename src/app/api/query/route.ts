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

    return Response.json({
      found: result.found,
      path: result.path || [],
      distance: result.distance || -1
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