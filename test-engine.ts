#!/usr/bin/env tsx

// Simple test script to verify the engine works
import { runAnalysis } from './src/engine/index.js'
import path from 'path'

console.log('🚀 Canopy Engine Test\n')
console.log('Testing on the Canopy project itself...\n')

const projectDir = process.cwd()

try {
  const result = await runAnalysis({
    projectDir,
    force: false,
    includeDevDeps: true,
  })

  console.log('✅ Analysis completed successfully!')
  console.log(`⏱️  Scan time: ${result.scanTimeMs}ms`)
  console.log(`📦 Total packages: ${result.graph.metadata.totalPackages}`)
  console.log(`🔗 Total edges: ${result.graph.metadata.totalEdges}`)
  console.log(`🌲 Ecosystems: ${result.graph.metadata.ecosystems.join(', ')}`)
  console.log(`🔄 From cache: ${result.fromCache}`)

  if (result.graph.metadata.sccClusters.length > 0) {
    console.log(`\n⚠️  Found ${result.graph.metadata.sccClusters.length} circular dependency cluster(s)`)
  }

  if (result.graph.metadata.versionConflicts.length > 0) {
    console.log(`⚠️  Found ${result.graph.metadata.versionConflicts.length} version conflict(s)`)
  }

  if (result.graph.metadata.ghostDependencies.length > 0) {
    console.log(`👻 Found ${result.graph.metadata.ghostDependencies.length} ghost dependency(ies)`)
  }

  if (result.graph.metadata.licenseConflicts.length > 0) {
    console.log(`⚖️  Found ${result.graph.metadata.licenseConflicts.length} license conflict(s)`)
  }

  console.log('\n✨ Engine is working perfectly!')

  // Show a few sample packages
  const sampleNodes = Object.values(result.graph.nodes).slice(0, 5)
  console.log('\n📋 Sample packages:')
  sampleNodes.forEach(node => {
    console.log(`  - ${node.name}@${node.resolvedVersion} (${node.ecosystem})`)
  })

} catch (error) {
  console.error('❌ Error during analysis:', error)
  process.exit(1)
}
