#!/usr/bin/env node

// bin/canopy.js - Complete rewrite as HTTP client
import { program } from 'commander'
import path from 'path'
import fs from 'fs'
import os from 'os'
import net from 'net'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import open from 'open'
import chalk from 'chalk'
import ora from 'ora'

// ✅ NO TypeScript engine imports - HTTP client only

// ES module compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Server management state
let tempServerProcess = null
let tempServerPort = null

// ────────────────────────────────────────────────────────────────────────────────
// Server Management Functions
// ────────────────────────────────────────────────────────────────────────────────

async function checkServerRunning(port = 3000) {
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    })
    return response.ok
  } catch (error) {
    return false
  }
}

async function findAvailablePort(startPort = 3000) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.listen(startPort, () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        resolve(findAvailablePort(startPort + 1))
      } else {
        reject(err)
      }
    })
  })
}

async function ensureProductionBuild() {
  const projectRoot = path.resolve(__dirname, '..')
  const nextDir = path.join(projectRoot, '.next')

  if (!fs.existsSync(nextDir)) {
    console.log(chalk.blue('🔨 Building production server...'))

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

    try {
      const buildProcess = spawn(npmCmd, ['run', 'build'], {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true
      })

      await new Promise((resolve, reject) => {
        buildProcess.on('exit', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`Build failed with code ${code}`))
        })
      })
    } catch (error) {
      throw new Error(`Production build failed: ${error.message}`)
    }
  }
}

async function startTempServer(port) {
  await ensureProductionBuild()

  const projectRoot = path.resolve(__dirname, '..')
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  const serverProcess = spawn(npmCmd, ['start'], {
    cwd: projectRoot,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: port.toString() }
  })

  // Create PID file for cleanup
  const pidFile = path.join(os.tmpdir(), `canopy-server-${port}.pid`)
  fs.writeFileSync(pidFile, serverProcess.pid.toString())

  // Wait for server to be ready
  const startTime = Date.now()
  while (Date.now() - startTime < 30000) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    if (await checkServerRunning(port)) {
      tempServerProcess = serverProcess
      tempServerPort = port
      return { pid: serverProcess.pid, port }
    }
  }

  throw new Error('Server failed to start within 30 seconds')
}

async function cleanupTempServer() {
  if (tempServerProcess) {
    tempServerProcess.kill('SIGTERM')

    // Clean up PID file
    const pidFile = path.join(os.tmpdir(), `canopy-server-${tempServerPort}.pid`)
    try {
      fs.unlinkSync(pidFile)
    } catch (error) {
      // PID file may not exist, ignore
    }

    tempServerProcess = null
    tempServerPort = null
  }
}

// Cleanup on process exit
process.on('SIGINT', cleanupTempServer)
process.on('SIGTERM', cleanupTempServer)
process.on('exit', cleanupTempServer)

// ────────────────────────────────────────────────────────────────────────────────
// HTTP Client Functions
// ────────────────────────────────────────────────────────────────────────────────

async function ensureServer(requestedPort = 3000) {
  // Check if server already running on requested port
  if (await checkServerRunning(requestedPort)) {
    return requestedPort
  }

  // Find available port and start server
  const availablePort = await findAvailablePort(requestedPort)
  const spinner = ora('Starting server...').start()

  try {
    await startTempServer(availablePort)
    spinner.succeed(`Server started on port ${availablePort}`)
    return availablePort
  } catch (error) {
    spinner.fail(`Failed to start server: ${error.message}`)
    throw error
  }
}

async function makeApiRequest(endpoint, data, port) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 300000) // 5 min timeout

  try {
    const response = await fetch(`http://localhost:${port}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const error = await response.json()
      console.error(chalk.red(`✗ ${error.message || 'Request failed'}`))
      process.exit(error.code === 'SCAN_FAILED' ? 1 : 2)
    }

    return await response.json()

  } catch (error) {
    clearTimeout(timeoutId)

    if (error.name === 'AbortError') {
      console.error(chalk.red('✗ Request timeout - analysis taking too long'))
      process.exit(124)
    }

    throw error
  }
}

program
  .name('canopy')
  .description('Polyglot dependency graph analyzer')
  .version('1.0.0')

// ────────────────────────────────────────────────────────────────────────────────
// SCAN COMMAND
// ────────────────────────────────────────────────────────────────────────────────

program
  .command('scan')
  .description('Scan project and open web interface')
  .argument('[dir]', 'Project directory to scan', process.cwd())
  .option('--no-ui', 'Skip browser, print summary only')
  .option('--json', 'Output JSON format')
  .option('--port <port>', 'Custom port for web server', '3000')
  .option('--force', 'Ignore cache and force full analysis')
  .action(async (dir, options) => {
    try {
      const projectDir = path.resolve(dir)
      const port = await ensureServer(parseInt(options.port))

      const spinner = ora('Analyzing dependencies...').start()

      const result = await makeApiRequest('scan', {
        projectDir,
        force: options.force || false
      }, port)

      spinner.succeed('Analysis complete')

      if (options.ui === false) {
        // Print summary for --no-ui mode
        const { graph } = result
        const { metadata } = graph || {}

        console.log(chalk.cyan('\n📊 Dependency Analysis Results'))
        console.log(chalk.gray('─'.repeat(50)))
        console.log(`${chalk.green('✓')} Total packages: ${chalk.bold(metadata?.totalPackages || 0)}`)
        console.log(`${chalk.green('✓')} Total edges: ${chalk.bold(metadata?.totalEdges || 0)}`)

        if (options.json) {
          console.log('\n' + JSON.stringify(result, null, 2))
        }
      } else {
        const url = `http://localhost:${port}?dir=${encodeURIComponent(projectDir)}&autoScan=true`
        await open(url)
        console.log(chalk.green(`✓ Analysis complete. Opening ${url}`))
      }

    } catch (error) {
      console.error(chalk.red(`✗ Scan failed: ${error.message}`))
      process.exit(1)
    } finally {
      await cleanupTempServer()
    }
  })

// ────────────────────────────────────────────────────────────────────────────────
// CHECK COMMAND
// ────────────────────────────────────────────────────────────────────────────────

program
  .command('check')
  .description('Analyze dependencies and exit with code 1 if issues found')
  .argument('[dir]', 'Project directory to analyze', process.cwd())
  .option('--conflicts-only', 'Only fail on version conflicts')
  .option('--no-ghosts', 'Ignore ghost dependencies')
  .action(async (dir, options) => {
    try {
      const projectDir = path.resolve(dir)
      const port = await ensureServer(3000)

      const spinner = ora('Checking for issues...').start()

      const result = await makeApiRequest('check', {
        projectDir,
        conflictsOnly: options.conflictsOnly || false,
        noGhosts: options.noGhosts || false
      }, port)

      spinner.stop()

      // Display results
      if (result.hasIssues) {
        console.log(chalk.red('✗ Issues found:'))

        if (result.versionConflicts.length > 0) {
          console.log(chalk.yellow(`  ${result.versionConflicts.length} version conflicts`))
        }

        if (result.ghostDependencies.length > 0) {
          console.log(chalk.yellow(`  ${result.ghostDependencies.length} ghost dependencies`))
        }

        if (result.licenseConflicts.length > 0) {
          console.log(chalk.yellow(`  ${result.licenseConflicts.length} license issues`))
        }

        process.exit(1)
      } else {
        console.log(chalk.green('✓ No issues found'))
        process.exit(0)
      }

    } catch (error) {
      console.error(chalk.red(`✗ Check failed: ${error.message}`))
      process.exit(1)
    } finally {
      await cleanupTempServer()
    }
  })

// ────────────────────────────────────────────────────────────────────────────────
// DIFF COMMAND
// ────────────────────────────────────────────────────────────────────────────────

program
  .command('diff')
  .description('Show dependency changes since last scan')
  .argument('[dir]', 'Project directory to analyze', process.cwd())
  .action(async (dir) => {
    try {
      const projectDir = path.resolve(dir)
      const port = await ensureServer(3000)

      const spinner = ora('Computing differences...').start()

      const result = await makeApiRequest('diff', {
        projectDir
      }, port)

      spinner.stop()

      if (!result.changes) {
        console.log(chalk.blue(result.message || 'No changes detected'))
        return
      }

      // Display diff summary
      const { summary } = result
      console.log(chalk.green(`Changes since last analysis:`))
      console.log(`  Added: ${chalk.green(summary.added)}`)
      console.log(`  Removed: ${chalk.red(summary.removed)}`)
      console.log(`  Updated: ${chalk.yellow(summary.updated)}`)

      // Show detailed changes
      console.log(JSON.stringify(result.changes, null, 2))

    } catch (error) {
      console.error(chalk.red(`✗ Diff failed: ${error.message}`))
      process.exit(1)
    } finally {
      await cleanupTempServer()
    }
  })

// ────────────────────────────────────────────────────────────────────────────────
// QUERY COMMAND
// ────────────────────────────────────────────────────────────────────────────────

program
  .command('query <fromId> <toId>')
  .description('Query transitive dependencies between packages')
  .argument('[dir]', 'Project directory to analyze', process.cwd())
  .action(async (fromId, toId, dir) => {
    try {
      const projectDir = path.resolve(dir)
      const port = await ensureServer(3000)

      const spinner = ora(`Querying path from ${fromId} to ${toId}...`).start()

      const result = await makeApiRequest('query', {
        type: 'transitive',
        fromId,
        toId,
        projectDir
      }, port)

      spinner.stop()

      if (result.found) {
        console.log(chalk.green(`✓ Path found (${result.distance} steps):`))
        console.log(result.path.join(' → '))
      } else {
        console.log(chalk.red(`✗ No path found from ${fromId} to ${toId}`))
      }

    } catch (error) {
      console.error(chalk.red(`✗ Query failed: ${error.message}`))
      process.exit(1)
    } finally {
      await cleanupTempServer()
    }
  })

// ────────────────────────────────────────────────────────────────────────────────
// SERVER COMMAND
// ────────────────────────────────────────────────────────────────────────────────

program
  .command('server')
  .description('Start persistent server for development')
  .option('--port <port>', 'Port for web server', '3000')
  .option('--stop', 'Stop running server')
  .action(async (options) => {
    const port = parseInt(options.port)

    if (options.stop) {
      // Stop persistent server
      const pidFile = path.join(os.tmpdir(), `canopy-server-${port}.pid`)

      if (fs.existsSync(pidFile)) {
        const pid = fs.readFileSync(pidFile, 'utf8')
        try {
          process.kill(pid, 'SIGTERM')
          fs.unlinkSync(pidFile)
          console.log(chalk.green(`✓ Server stopped (PID: ${pid})`))
        } catch (error) {
          console.log(chalk.yellow(`Server process ${pid} not found (may have already stopped)`))
          fs.unlinkSync(pidFile)
        }
      } else {
        console.log(chalk.yellow('No running server found'))
      }
      return
    }

    // Start persistent server
    if (await checkServerRunning(port)) {
      console.log(chalk.blue(`Server already running on port ${port}`))
      console.log(chalk.green(`Open http://localhost:${port}`))
      return
    }

    try {
      await startTempServer(port)
      console.log(chalk.green(`✓ Server started on port ${port}`))
      console.log(chalk.blue(`Open http://localhost:${port}`))
      console.log(chalk.gray('Press Ctrl+C to stop'))

      // Keep process alive
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\nShutting down server...'))
        cleanupTempServer()
        process.exit(0)
      })

      // Keep alive
      await new Promise(() => {})

    } catch (error) {
      console.error(chalk.red(`✗ Failed to start server: ${error.message}`))
      process.exit(1)
    }
  })

program.parse()