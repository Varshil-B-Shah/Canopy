import { NextRequest, NextResponse } from 'next/server'
import { readCache } from '@/engine/cache'
import { runAnalysis } from '@/engine'
import path from 'path'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectDir = searchParams.get('dir') || searchParams.get('projectDir')

    if (!projectDir || typeof projectDir !== 'string' || projectDir.trim().length === 0) {
      return NextResponse.json(
        {
          error: true,
          message: 'dir or projectDir parameter is required',
          code: 'MISSING_PROJECT_DIR'
        },
        { status: 400 }
      )
    }

    // Sanitize path and prevent directory traversal
    const sanitizedPath = path.resolve(projectDir.trim())
    if (projectDir.includes('..')) {
      return NextResponse.json(
        {
          error: true,
          message: 'Invalid project directory - path traversal not allowed',
          code: 'INVALID_PROJECT_DIR'
        },
        { status: 400 }
      )
    }

    const cache = readCache(sanitizedPath)
    if (!cache?.enrichedGraph) {
      return NextResponse.json({
        changes: null,
        summary: { added: 0, removed: 0, updated: 0 },
        message: 'No analysis found. Run scan first.'
      })
    }

    // Get current analysis and compute diff
    const analysis = await runAnalysis({ projectDir: sanitizedPath, force: false })
    const diff = analysis.diff

    if (!diff) {
      return NextResponse.json({
        changes: null,
        summary: { added: 0, removed: 0, updated: 0 },
        message: 'No changes detected since last analysis'
      })
    }

    // Calculate summary statistics
    const summary = {
      added: diff.added?.length || 0,
      removed: diff.removed?.length || 0,
      updated: diff.updated?.length || 0
    }

    return NextResponse.json({
      changes: diff,
      summary,
      message: 'Diff computed successfully'
    })

  } catch (error) {
    console.error('GET Diff API error:', error)
    return NextResponse.json({
      error: true,
      message: 'Failed to compute diff',
      code: 'DIFF_FAILED'
    }, { status: 500 })
  }
}

// ADD new POST method for CLI compatibility
export async function POST(request: NextRequest) {
  try {
    const { projectDir } = await request.json()

    // Add input sanitization
    if (!projectDir || typeof projectDir !== 'string' || projectDir.trim().length === 0) {
      return Response.json(
        { error: true, message: 'projectDir is required', code: 'MISSING_PROJECT_DIR' },
        { status: 400 }
      )
    }

    // Sanitize path and prevent directory traversal
    const sanitizedPath = path.resolve(projectDir.trim())
    if (projectDir.includes('..')) {
      return Response.json(
        { error: true, message: 'Invalid project directory - path traversal not allowed', code: 'INVALID_PROJECT_DIR' },
        { status: 400 }
      )
    }

    // Check if previous analysis exists
    const existingCache = readCache(sanitizedPath)
    if (!existingCache) {
      return Response.json(
        { error: true, message: 'No previous analysis found. Run scan first.', code: 'NO_PREVIOUS_ANALYSIS' },
        { status: 404 }
      )
    }

    // Run fresh analysis to get diff (engine compares against cache internally)
    const analysis = await runAnalysis({ projectDir: sanitizedPath, force: false })
    const diff = analysis.diff

    if (!diff) {
      return Response.json({
        changes: null,
        summary: { added: 0, removed: 0, updated: 0 },
        message: 'No changes detected since last analysis'
      })
    }

    // Calculate summary statistics
    const summary = {
      added: diff.added?.length || 0,
      removed: diff.removed?.length || 0,
      updated: diff.updated?.length || 0
    }

    return Response.json({
      changes: diff,
      summary
    })

  } catch (error) {
    console.error('POST Diff API error:', error)
    return Response.json(
      {
        error: true,
        message: error instanceof Error ? error.message : 'Diff analysis failed',
        code: 'DIFF_FAILED'
      },
      { status: 500 }
    )
  }
}