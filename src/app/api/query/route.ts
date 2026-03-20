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