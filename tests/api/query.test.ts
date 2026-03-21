// tests/api/query.test.ts
import { describe, it, expect } from 'vitest'

describe('/api/query', () => {
  it('should return transitive query results for valid requests', async () => {
    const response = await fetch('http://localhost:3000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'transitive',
        fromId: 'canopy',
        toId: 'd3',
        projectDir: process.cwd()
      })
    })

    expect(response.ok).toBe(true)
    const result = await response.json()

    // Verify all required response properties
    expect(result).toHaveProperty('found')
    expect(result).toHaveProperty('path')
    expect(result).toHaveProperty('distance')

    // Verify correct types
    expect(typeof result.found).toBe('boolean')
    expect(Array.isArray(result.path)).toBe(true)
    expect(typeof result.distance).toBe('number')

    // If path found, verify structure
    if (result.found) {
      expect(result.path.length).toBeGreaterThan(0)
      expect(result.distance).toBeGreaterThan(-1)
    } else {
      expect(result.distance).toBe(-1)
    }
  })

  it('should accept POST requests for CLI transitive queries', async () => {
    const response = await fetch('http://localhost:3000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'transitive',
        fromId: 'package-a',
        toId: 'package-b',
        projectDir: '/path/to/test/project'
      })
    })

    expect(response.status).toBe(404)
    const result = await response.json()

    // Verify structured error response for missing cache
    expect(result).toHaveProperty('error', true)
    expect(result).toHaveProperty('message', 'No analysis found. Run scan first.')
    expect(result).toHaveProperty('code', 'NO_ANALYSIS')
  })

  it('should validate required parameters for POST requests', async () => {
    // Test missing type parameter
    const response1 = await fetch('http://localhost:3000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromId: 'package-a',
        toId: 'package-b',
        projectDir: '/path/to/test/project'
      })
    })

    expect(response1.status).toBe(400)
    const result1 = await response1.json()
    expect(result1.code).toBe('INVALID_QUERY_TYPE')

    // Test missing fromId parameter
    const response2 = await fetch('http://localhost:3000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'transitive',
        toId: 'package-b',
        projectDir: '/path/to/test/project'
      })
    })

    expect(response2.status).toBe(400)
    const result2 = await response2.json()
    expect(result2.code).toBe('MISSING_PARAMETERS')

    // Test missing projectDir parameter
    const response3 = await fetch('http://localhost:3000/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'transitive',
        fromId: 'package-a',
        toId: 'package-b'
      })
    })

    expect(response3.status).toBe(400)
    const result3 = await response3.json()
    expect(result3.code).toBe('MISSING_PROJECT_DIR')
  })
})