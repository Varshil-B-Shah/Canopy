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