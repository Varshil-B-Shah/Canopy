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