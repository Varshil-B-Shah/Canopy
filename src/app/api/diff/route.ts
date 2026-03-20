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