// tests/api/check.test.ts
import { describe, it, expect } from 'vitest'

describe('/api/check', () => {
  it('should return issue analysis for project', async () => {
    const response = await fetch('http://localhost:3000/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: 'c:\\Users\\Varshil\\Desktop\\MyWebApps\\Canopy',
        conflictsOnly: false,
        noGhosts: false
      })
    })

    expect(response.ok).toBe(true)
    const result = await response.json()

    expect(result).toHaveProperty('hasIssues')
    expect(result).toHaveProperty('versionConflicts')
    expect(result).toHaveProperty('ghostDependencies')
    expect(result).toHaveProperty('licenseConflicts')
  })

  it('should return 400 error when projectDir is missing', async () => {
    const response = await fetch('http://localhost:3000/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    expect(response.status).toBe(400)
    const result = await response.json()
    expect(result.error).toBe(true)
    expect(result.code).toBe('MISSING_PROJECT_DIR')
    expect(result.message).toBe('projectDir is required')
  })

  it('should filter results when conflictsOnly is true', async () => {
    const response = await fetch('http://localhost:3000/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: 'c:\\Users\\Varshil\\Desktop\\MyWebApps\\Canopy',
        conflictsOnly: true
      })
    })

    expect(response.ok).toBe(true)
    const result = await response.json()

    expect(result).toHaveProperty('versionConflicts')
    expect(result.ghostDependencies).toEqual([])
    expect(result.licenseConflicts).toEqual([])
  })

  it('should exclude ghosts when noGhosts is true', async () => {
    const response = await fetch('http://localhost:3000/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: 'c:\\Users\\Varshil\\Desktop\\MyWebApps\\Canopy',
        noGhosts: true
      })
    })

    expect(response.ok).toBe(true)
    const result = await response.json()

    expect(result.ghostDependencies).toEqual([])
    // Should still return version conflicts and license conflicts
    expect(result).toHaveProperty('versionConflicts')
    expect(result).toHaveProperty('licenseConflicts')
  })

  it('should return 500 error when analysis fails with invalid project directory', async () => {
    const response = await fetch('http://localhost:3000/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: '/non/existent/directory'
      })
    })

    expect(response.status).toBe(500)
    const result = await response.json()
    expect(result.error).toBe(true)
    expect(result.code).toBe('ANALYSIS_FAILED')
    expect(result.message).toBeDefined()
  })
})