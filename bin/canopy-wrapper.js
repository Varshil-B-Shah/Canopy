#!/usr/bin/env node
// bin/canopy-wrapper.js - Simplified without tsx loader

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path to the actual CLI implementation (now pure JavaScript)
const cliPath = resolve(__dirname, 'canopy.js')

// Run CLI directly with Node.js (no tsx needed)
const child = spawn('node', [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true
})

// Forward exit code
child.on('exit', (code) => {
  process.exit(code || 0)
})

// Handle process termination
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))