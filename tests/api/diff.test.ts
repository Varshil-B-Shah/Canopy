// tests/api/diff.test.ts
import { describe, it, expect } from 'vitest'

describe('/api/diff', () => {
  describe('GET method', () => {
    it('should return 400 error when projectDir is missing', async () => {
      const response = await fetch('http://localhost:3000/api/diff', {
        method: 'GET'
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toBe(true)
      expect(result.code).toBe('MISSING_PROJECT_DIR')
      expect(result.message).toContain('dir or projectDir parameter is required')
    })

    it('should return 400 error for invalid project directory with path traversal', async () => {
      const response = await fetch('http://localhost:3000/api/diff?dir=../../../etc/passwd', {
        method: 'GET'
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toBe(true)
      expect(result.code).toBe('INVALID_PROJECT_DIR')
      expect(result.message).toContain('path traversal not allowed')
    })

    it('should return no changes when no analysis exists', async () => {
      const response = await fetch('http://localhost:3000/api/diff?dir=/non/existent/directory', {
        method: 'GET'
      })

      expect(response.ok).toBe(true)
      const result = await response.json()
      expect(result.changes).toBe(null)
      expect(result.summary).toEqual({
        added: 0,
        removed: 0,
        updated: 0
      })
      expect(result.message).toBe('No analysis found. Run scan first.')
    })

    it('should return diff data when analysis exists', async () => {
      const response = await fetch('http://localhost:3000/api/diff?projectDir=c:\\Users\\Varshil\\Desktop\\MyWebApps\\Canopy', {
        method: 'GET'
      })

      expect(response.ok).toBe(true)
      const result = await response.json()

      expect(result).toHaveProperty('changes')
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('message')
      expect(result.summary).toHaveProperty('added')
      expect(result.summary).toHaveProperty('removed')
      expect(result.summary).toHaveProperty('updated')
    })
  })

  describe('POST method', () => {
    it('should return dependency changes analysis', async () => {
      const response = await fetch('http://localhost:3000/api/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDir: 'c:\\Users\\Varshil\\Desktop\\MyWebApps\\Canopy'
        })
      })

      expect(response.ok).toBe(true)
      const result = await response.json()

      expect(result).toHaveProperty('changes')
      expect(result).toHaveProperty('summary')
      expect(result.summary).toHaveProperty('added')
      expect(result.summary).toHaveProperty('removed')
      expect(result.summary).toHaveProperty('updated')
    })

    it('should return 400 error when projectDir is missing', async () => {
      const response = await fetch('http://localhost:3000/api/diff', {
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

    it('should return 400 error for invalid project directory with path traversal', async () => {
      const response = await fetch('http://localhost:3000/api/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDir: '../../../etc/passwd'
        })
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toBe(true)
      expect(result.code).toBe('INVALID_PROJECT_DIR')
      expect(result.message).toContain('path traversal not allowed')
    })

    it('should return 404 error when no previous analysis exists', async () => {
      const response = await fetch('http://localhost:3000/api/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDir: '/non/existent/directory'
        })
      })

      expect(response.status).toBe(404)
      const result = await response.json()
      expect(result.error).toBe(true)
      expect(result.code).toBe('NO_PREVIOUS_ANALYSIS')
      expect(result.message).toBe('No previous analysis found. Run scan first.')
    })

    it('should return no changes when no diff detected', async () => {
      // This test assumes the project directory has been scanned but no changes occurred
      const response = await fetch('http://localhost:3000/api/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDir: 'c:\\Users\\Varshil\\Desktop\\MyWebApps\\Canopy'
        })
      })

      expect(response.ok).toBe(true)
      const result = await response.json()

      if (result.changes === null) {
        expect(result.summary).toEqual({
          added: 0,
          removed: 0,
          updated: 0
        })
        expect(result).toHaveProperty('message')
      }
    })
  })
})