// src/app/api/check/route.ts
import { NextRequest } from 'next/server'
import { runAnalysis, readCache, deserializeGraph } from '@/engine'

export async function POST(request: NextRequest) {
  try {
    const { projectDir, conflictsOnly = false, noGhosts = false } = await request.json()

    if (!projectDir) {
      return Response.json(
        { error: true, message: 'projectDir is required', code: 'MISSING_PROJECT_DIR' },
        { status: 400 }
      )
    }

    // Check cache first, fallback to analysis
    let graph
    const cache = readCache(projectDir)
    if (cache) {
      graph = deserializeGraph(cache.enrichedGraph)
    } else {
      const analysis = await runAnalysis({ projectDir, force: false })
      graph = analysis.graph
    }

    // Extract issues from metadata arrays (not node flags)
    const versionConflicts = graph.metadata.versionConflicts.map(conflict => ({
      packageName: conflict.packageName,
      declaredVersion: conflict.constraints[0]?.constraint || 'unknown',
      resolvedVersion: 'N/A', // conflict means no single resolved version
      severity: 'error'
    }))

    const ghostDependencies = noGhosts ? [] : graph.metadata.ghostDependencies.map(ghost => ({
      packageName: ghost.packageName,
      importedFrom: ghost.importedIn || []
    }))

    const licenseConflicts = graph.metadata.licenseConflicts.map(license => ({
      packageName: license.packageName,
      license: license.license,
      severity: license.license === 'UNKNOWN' ? 'warning' : 'error'
    }))

    const allIssues = conflictsOnly
      ? versionConflicts
      : [...versionConflicts, ...ghostDependencies, ...licenseConflicts]

    return Response.json({
      hasIssues: allIssues.length > 0,
      versionConflicts,
      ghostDependencies: conflictsOnly ? [] : ghostDependencies,
      licenseConflicts: conflictsOnly ? [] : licenseConflicts
    })

  } catch (error) {
    console.error('Check API error:', error)
    return Response.json(
      {
        error: true,
        message: error instanceof Error ? error.message : 'Analysis failed',
        code: 'ANALYSIS_FAILED'
      },
      { status: 500 }
    )
  }
}