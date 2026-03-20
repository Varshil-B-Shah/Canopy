#!/usr/bin/env node

import { program } from 'commander'
import path from 'path'
import fs from 'fs'
import { spawn, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import open from 'open'
import chalk from 'chalk'
import ora from 'ora'

// ES module compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

program
  .name('canopy')
  .description('Polyglot dependency graph analyzer')
  .version('1.0.0')

// ─── SCAN COMMAND ─────────────────────────────────────────────────────────────

program
  .command('scan')
  .description('Scan project and open web interface')
  .argument('[dir]', 'Project directory to scan', process.cwd())
  .option('--no-ui', 'Skip browser, print summary only')
  .option('--port <port>', 'Custom port for web server', '3847')
  .option('--force', 'Ignore cache and force full analysis')
  .option('--json', 'Output results in JSON format')
  .action(async (dir, options) => {
    try {
      const projectDir = path.resolve(dir)

      // Validate project directory exists
      if (!fs.existsSync(projectDir)) {
        console.error(chalk.red(`✗ Directory not found: ${projectDir}`))
        process.exit(1)
      }

      if (options.json) {
        // JSON output mode - run analysis directly without server
        await runJsonAnalysis(projectDir, options.force)
      } else if (options.ui === false) {
        // No UI mode - run analysis and print summary
        await runHeadlessAnalysis(projectDir, options.force)
      } else {
        // Full UI mode - start server and open browser
        await runWithWebInterface(projectDir, options.port, options.force)
      }
    } catch (error) {
      console.error(chalk.red(`✗ Scan failed: ${error.message}`))
      process.exit(1)
    }
  })

// ─── CHECK COMMAND ────────────────────────────────────────────────────────────

program
  .command('check')
  .description('Check for issues and exit with error code')
  .argument('[dir]', 'Project directory to check', process.cwd())
  .option('--conflicts-only', 'Only fail on version conflicts')
  .option('--no-ghosts', 'Ignore ghost dependencies')
  .option('--no-license', 'Ignore license conflicts')
  .action(async (dir, options) => {
    try {
      const projectDir = path.resolve(dir)

      if (!fs.existsSync(projectDir)) {
        console.error(chalk.red(`✗ Directory not found: ${projectDir}`))
        process.exit(1)
      }

      const hasIssues = await runCheck(projectDir, options)
      process.exit(hasIssues ? 1 : 0)
    } catch (error) {
      console.error(chalk.red(`✗ Check failed: ${error.message}`))
      process.exit(1)
    }
  })

// ─── DIFF COMMAND ─────────────────────────────────────────────────────────────

program
  .command('diff')
  .description('Show dependency changes since last scan')
  .argument('[dir]', 'Project directory to analyze', process.cwd())
  .action(async (dir) => {
    try {
      const projectDir = path.resolve(dir)

      if (!fs.existsSync(projectDir)) {
        console.error(chalk.red(`✗ Directory not found: ${projectDir}`))
        process.exit(1)
      }

      await runDiff(projectDir)
    } catch (error) {
      console.error(chalk.red(`✗ Diff failed: ${error.message}`))
      process.exit(1)
    }
  })

// ─── QUERY COMMAND ────────────────────────────────────────────────────────────

program
  .command('query')
  .description('Run single dependency query')
  .argument('<question>', 'Query to run (e.g., "does express depend on lodash?")')
  .argument('[dir]', 'Project directory to query', process.cwd())
  .action(async (question, dir) => {
    try {
      const projectDir = path.resolve(dir)

      if (!fs.existsSync(projectDir)) {
        console.error(chalk.red(`✗ Directory not found: ${projectDir}`))
        process.exit(1)
      }

      await runQuery(question, projectDir)
    } catch (error) {
      console.error(chalk.red(`✗ Query failed: ${error.message}`))
      process.exit(1)
    }
  })

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

async function runJsonAnalysis(projectDir, force = false) {
  const { runAnalysis } = await import('../src/engine/index.ts')

  const spinner = ora('Analyzing dependencies...').start()

  try {
    const result = await runAnalysis({ projectDir, force })
    spinner.succeed('Analysis complete')

    console.log(JSON.stringify({
      graph: result.graph,
      diff: result.diff,
      fromCache: result.fromCache,
      scanTimeMs: result.scanTimeMs,
    }, null, 2))
  } catch (error) {
    spinner.fail('Analysis failed')
    throw error
  }
}

async function runHeadlessAnalysis(projectDir, force = false) {
  const { runAnalysis } = await import('../src/engine/index.ts')

  const spinner = ora('Analyzing dependencies...').start()

  try {
    const result = await runAnalysis({ projectDir, force })
    spinner.succeed('Analysis complete')

    console.log(chalk.cyan('\n📊 Dependency Analysis Results'))
    console.log(chalk.gray('─'.repeat(50)))

    const { graph } = result
    const { metadata } = graph

    console.log(`${chalk.green('✓')} Total packages: ${chalk.bold(metadata.totalPackages)}`)
    console.log(`${chalk.green('✓')} Total edges: ${chalk.bold(metadata.totalEdges)}`)
    console.log(`${chalk.green('✓')} Ecosystems: ${chalk.bold(metadata.ecosystems.join(', '))}`)
    console.log(`${chalk.blue('ℹ')} Scan time: ${chalk.bold(result.scanTimeMs)}ms`)
    console.log(`${chalk.blue('ℹ')} From cache: ${result.fromCache ? chalk.green('yes') : chalk.yellow('no')}`)

    // Show issues summary
    const versionConflicts = metadata.versionConflicts?.length || 0
    const ghostDeps = metadata.ghostDependencies?.length || 0
    const licenseConflicts = metadata.licenseConflicts?.length || 0
    const sccClusters = metadata.sccClusters?.filter(c => c.length > 1).length || 0

    if (versionConflicts > 0) {
      console.log(`${chalk.red('⚠')} Version conflicts: ${chalk.bold(versionConflicts)}`)
    }

    if (ghostDeps > 0) {
      console.log(`${chalk.yellow('⚠')} Ghost dependencies: ${chalk.bold(ghostDeps)}`)
    }

    if (licenseConflicts > 0) {
      console.log(`${chalk.red('⚠')} License conflicts: ${chalk.bold(licenseConflicts)}`)
    }

    if (sccClusters > 0) {
      console.log(`${chalk.yellow('⚠')} Circular dependency clusters: ${chalk.bold(sccClusters)}`)
    }

    if (versionConflicts + ghostDeps + licenseConflicts + sccClusters === 0) {
      console.log(`${chalk.green('✓')} No issues found`)
    }

    // Show diff if available
    if (result.diff && result.diff.hasChanges) {
      console.log(chalk.cyan('\n📈 Changes Since Last Scan'))
      console.log(chalk.gray('─'.repeat(50)))

      if (result.diff.added.length > 0) {
        console.log(`${chalk.green('+')} Added: ${result.diff.added.length} packages`)
      }

      if (result.diff.removed.length > 0) {
        console.log(`${chalk.red('-')} Removed: ${result.diff.removed.length} packages`)
      }

      if (result.diff.updated.length > 0) {
        console.log(`${chalk.blue('~')} Updated: ${result.diff.updated.length} packages`)
      }
    }

  } catch (error) {
    spinner.fail('Analysis failed')
    throw error
  }
}

async function runWithWebInterface(projectDir, port, force = false) {
  const spinner = ora('Starting Canopy server...').start()

  try {
    // Get the project root directory (where package.json is)
    const projectRoot = path.resolve(__dirname, '..')

    // Start Next.js development server
    const serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: port,
        PROJECT_DIR: projectDir,
        FORCE_SCAN: force ? 'true' : 'false'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let serverReady = false

    // Wait for server to be ready
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString()
      if (output.includes('Ready') || output.includes(`localhost:${port}`)) {
        serverReady = true
      }
    })

    // Wait for server startup
    await waitForServer(`http://localhost:${port}`, 30000)
    spinner.succeed(`Server started on http://localhost:${port}`)

    // Open browser
    const url = `http://localhost:${port}?dir=${encodeURIComponent(projectDir)}&force=${force}`
    console.log(chalk.cyan(`🌐 Opening ${url}`))

    try {
      await open(url)
    } catch (openError) {
      console.log(chalk.yellow(`Could not open browser automatically. Please visit: ${url}`))
    }

    // Keep process alive and handle cleanup
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Shutting down server...'))
      serverProcess.kill()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      serverProcess.kill()
      process.exit(0)
    })

    // Wait for server process to exit
    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(chalk.red(`Server exited with code ${code}`))
      }
      process.exit(code || 0)
    })

  } catch (error) {
    spinner.fail('Failed to start server')
    throw error
  }
}

async function runCheck(projectDir, options) {
  const { runAnalysis } = await import('../src/engine/index.ts')

  const spinner = ora('Checking for issues...').start()

  try {
    const result = await runAnalysis({ projectDir })
    spinner.succeed('Check complete')

    const { metadata } = result.graph
    let hasIssues = false

    // Check version conflicts
    const versionConflicts = metadata.versionConflicts?.length || 0
    if (versionConflicts > 0) {
      console.log(chalk.red(`✗ Version conflicts found: ${versionConflicts}`))
      hasIssues = true
    }

    // Check ghost dependencies (unless disabled)
    if (!options.noGhosts) {
      const ghostDeps = metadata.ghostDependencies?.length || 0
      if (ghostDeps > 0) {
        console.log(chalk.red(`✗ Ghost dependencies found: ${ghostDeps}`))
        if (!options.conflictsOnly) hasIssues = true
      }
    }

    // Check license conflicts (unless disabled)
    if (!options.noLicense) {
      const licenseConflicts = metadata.licenseConflicts?.length || 0
      if (licenseConflicts > 0) {
        console.log(chalk.red(`✗ License conflicts found: ${licenseConflicts}`))
        if (!options.conflictsOnly) hasIssues = true
      }
    }

    // Check circular dependencies
    const sccClusters = metadata.sccClusters?.filter(c => c.length > 1).length || 0
    if (sccClusters > 0) {
      console.log(chalk.yellow(`⚠ Circular dependency clusters: ${sccClusters}`))
      if (!options.conflictsOnly) hasIssues = true
    }

    if (!hasIssues) {
      console.log(chalk.green('✓ No issues found'))
    }

    return hasIssues

  } catch (error) {
    spinner.fail('Check failed')
    throw error
  }
}

async function runDiff(projectDir) {
  const { runAnalysis } = await import('../src/engine/index.ts')

  const spinner = ora('Computing dependency diff...').start()

  try {
    const result = await runAnalysis({ projectDir, force: true })
    spinner.succeed('Diff computed')

    if (!result.diff || !result.diff.hasChanges) {
      console.log(chalk.yellow('No changes detected since last scan'))
      return
    }

    const { diff } = result

    console.log(chalk.cyan('\n📈 Dependency Changes'))
    console.log(chalk.gray('─'.repeat(50)))

    // Show added packages
    if (diff.added.length > 0) {
      console.log(chalk.green(`\n+ Added (${diff.added.length}):`))
      diff.added.forEach(node => {
        console.log(`  ${chalk.green('+')} ${node.name}@${node.resolvedVersion}`)
      })
    }

    // Show removed packages
    if (diff.removed.length > 0) {
      console.log(chalk.red(`\n- Removed (${diff.removed.length}):`))
      diff.removed.forEach(node => {
        console.log(`  ${chalk.red('-')} ${node.name}@${node.resolvedVersion}`)
      })
    }

    // Show updated packages
    if (diff.updated.length > 0) {
      console.log(chalk.blue(`\n~ Updated (${diff.updated.length}):`))
      diff.updated.forEach(update => {
        const color = update.changeType === 'major' ? chalk.red :
                     update.changeType === 'minor' ? chalk.yellow : chalk.green
        console.log(`  ${chalk.blue('~')} ${update.node.name}: ${update.previousVersion} → ${color(update.currentVersion)} (${update.changeType})`)
      })
    }

    // Show new conflicts
    if (diff.newConflicts?.length > 0) {
      console.log(chalk.red(`\n⚠ New Conflicts (${diff.newConflicts.length}):`))
      diff.newConflicts.forEach(conflict => {
        console.log(`  ${chalk.red('⚠')} ${conflict.packageName}: ${conflict.conflictingVersions.join(' vs ')}`)
      })
    }

    // Show resolved conflicts
    if (diff.resolvedConflicts?.length > 0) {
      console.log(chalk.green(`\n✓ Resolved Conflicts (${diff.resolvedConflicts.length}):`))
      diff.resolvedConflicts.forEach(conflict => {
        console.log(`  ${chalk.green('✓')} ${conflict.packageName}`)
      })
    }

  } catch (error) {
    spinner.fail('Diff failed')
    throw error
  }
}

async function runQuery(question, projectDir) {
  const { runAnalysis, queryTransitive } = await import('../src/engine/index.ts')

  const spinner = ora('Running query...').start()

  try {
    const result = await runAnalysis({ projectDir })
    spinner.succeed('Query complete')

    console.log(chalk.cyan(`\n🔍 Query: ${question}`))
    console.log(chalk.gray('─'.repeat(50)))

    // Simple query parsing - look for "does X depend on Y" pattern
    const dependsPattern = /does\s+(.+?)\s+(?:depend\s+on|use)\s+(.+?)(?:\?|$)/i
    const match = question.match(dependsPattern)

    if (match) {
      const [, fromPackage, toPackage] = match
      const fromId = `npm:${fromPackage.trim()}`
      const toId = `npm:${toPackage.trim()}`

      const queryResult = queryTransitive(result.graph, fromId, toId)

      if (queryResult.result) {
        console.log(chalk.green(`✓ Yes, ${fromPackage} depends on ${toPackage}`))
        console.log(chalk.gray(`  Method: ${queryResult.method}, Confirmed: ${queryResult.confirmed}`))
      } else {
        console.log(chalk.red(`✗ No, ${fromPackage} does not depend on ${toPackage}`))
      }
    } else {
      console.log(chalk.yellow('Query format not recognized. Try: "does package-a depend on package-b?"'))
    }

  } catch (error) {
    spinner.fail('Query failed')
    throw error
  }
}

async function waitForServer(url, timeout = 30000) {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) {
        return true
      }
    } catch (error) {
      // Server not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  throw new Error('Server failed to start within timeout')
}

// Parse command line arguments
program.parse(process.argv)