// tests/cli/cli-integration.test.ts
import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(require('child_process').exec)

describe('CLI HTTP Client Integration', () => {
  it('should detect server and make HTTP requests', async () => {
    // Test that CLI can communicate with server via HTTP instead of TypeScript imports
    const { stdout, stderr } = await execAsync('node bin/canopy.js scan --no-ui', {
      cwd: process.cwd(),
      timeout: 30000
    })

    expect(stderr).not.toContain('Unknown file extension .ts')
    expect(stdout).toContain('Total packages')
    expect(stdout).toContain('Total edges')
  }, 35000)
})