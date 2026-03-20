#!/usr/bin/env node

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path to the actual CLI implementation
const cliPath = resolve(__dirname, 'canopy.js')

// Run the CLI using tsx
const child = spawn('npx', ['tsx', cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true
})

// Forward exit code
child.on('exit', (code) => {
  process.exit(code || 0)
})

// Handle process termination
process.on('SIGINT', () => {
  child.kill('SIGINT')
})

process.on('SIGTERM', () => {
  child.kill('SIGTERM')
})