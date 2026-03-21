'use client'

import React, { useMemo, useState } from 'react'
import type { DependencyGraph, PackageNode } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  onNodeSelect: (id: string) => void
}

interface BuildLayer {
  layer: number
  packages: PackageNode[]
  canBuildInParallel: boolean
  estimatedTime: number
}

interface BuildStats {
  totalLayers: number
  totalPackages: number
  parallelizablePackages: number
  criticalPathLength: number
  buildEfficiency: number
  averageLayerSize: number
  maxParallelism: number
  bottleneckLayers: number[]
}

interface OptimizationSuggestion {
  type: 'info' | 'warning' | 'error'
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
}

const BuildOrderPanel: React.FC<Props> = ({ graph, onNodeSelect }) => {
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null)
  const [showCriticalPath, setShowCriticalPath] = useState(false)
  const [viewMode, setViewMode] = useState<'layers' | 'timeline' | 'stats'>('layers')

  // Build layer analysis
  const buildAnalysis = useMemo(() => {
    const buildOrderNodes = Object.values(graph.nodes)
      .filter(node => node.buildLayer !== -1)
      .sort((a, b) => a.buildLayer - b.buildLayer)

    const layerGroups: Record<number, PackageNode[]> = {}
    buildOrderNodes.forEach(node => {
      if (!layerGroups[node.buildLayer]) {
        layerGroups[node.buildLayer] = []
      }
      layerGroups[node.buildLayer].push(node)
    })

    const layers = Object.keys(layerGroups).map(Number).sort((a, b) => a - b)

    // Calculate build layers with metadata
    const buildLayers: BuildLayer[] = layers.map(layerNum => {
      const packages = layerGroups[layerNum]
      const estimatedTime = Math.max(1, Math.log(packages.length + 1) * 30) // Simulate build time

      return {
        layer: layerNum,
        packages,
        canBuildInParallel: packages.length > 1,
        estimatedTime: Math.round(estimatedTime)
      }
    })

    return {
      layers: buildLayers,
      layerGroups,
      buildOrderNodes
    }
  }, [graph])

  // Calculate build statistics
  const buildStats = useMemo((): BuildStats => {
    const { layers, buildOrderNodes } = buildAnalysis
    const totalPackages = buildOrderNodes.length
    const parallelizablePackages = layers.reduce((sum, layer) =>
      sum + (layer.canBuildInParallel ? layer.packages.length : 0), 0
    )

    const layerSizes = layers.map(l => l.packages.length)
    const averageLayerSize = layerSizes.length > 0 ? layerSizes.reduce((a, b) => a + b, 0) / layerSizes.length : 0
    const maxParallelism = Math.max(...layerSizes, 0)

    // Build efficiency: how well parallelized the build is
    const idealParallelTime = Math.ceil(totalPackages / maxParallelism)
    const actualTime = layers.length
    const buildEfficiency = Math.min(100, (idealParallelTime / actualTime) * 100)

    // Bottleneck layers (significantly larger than average)
    const bottleneckThreshold = averageLayerSize * 1.5
    const bottleneckLayers = layers
      .filter(layer => layer.packages.length > bottleneckThreshold)
      .map(layer => layer.layer)

    return {
      totalLayers: layers.length,
      totalPackages,
      parallelizablePackages,
      criticalPathLength: graph.metadata.criticalPathLength,
      buildEfficiency: Math.round(buildEfficiency),
      averageLayerSize: Math.round(averageLayerSize * 10) / 10,
      maxParallelism,
      bottleneckLayers
    }
  }, [buildAnalysis, graph.metadata.criticalPathLength])

  // Generate optimization suggestions
  const optimizationSuggestions = useMemo((): OptimizationSuggestion[] => {
    const suggestions: OptimizationSuggestion[] = []
    const { buildEfficiency, bottleneckLayers, totalLayers, maxParallelism } = buildStats

    if (buildEfficiency < 30) {
      suggestions.push({
        type: 'error',
        title: 'Poor Build Parallelization',
        description: `Build efficiency is only ${buildEfficiency}%. Consider breaking down large packages or restructuring dependencies.`,
        impact: 'high'
      })
    } else if (buildEfficiency < 60) {
      suggestions.push({
        type: 'warning',
        title: 'Suboptimal Build Parallelization',
        description: `Build efficiency is ${buildEfficiency}%. There's room for improvement in dependency structure.`,
        impact: 'medium'
      })
    }

    if (bottleneckLayers.length > 0) {
      suggestions.push({
        type: 'warning',
        title: 'Build Bottlenecks Detected',
        description: `Layer${bottleneckLayers.length > 1 ? 's' : ''} ${bottleneckLayers.join(', ')} ${bottleneckLayers.length > 1 ? 'have' : 'has'} significantly more packages than average, creating bottlenecks.`,
        impact: 'medium'
      })
    }

    if (totalLayers > 10) {
      suggestions.push({
        type: 'info',
        title: 'Deep Dependency Chain',
        description: `Your dependency chain is ${totalLayers} layers deep. Consider flattening some dependencies for faster builds.`,
        impact: 'low'
      })
    }

    if (maxParallelism === 1) {
      suggestions.push({
        type: 'warning',
        title: 'Sequential Build',
        description: 'Your build is entirely sequential. Consider restructuring to enable parallel compilation.',
        impact: 'high'
      })
    }

    if (suggestions.length === 0) {
      suggestions.push({
        type: 'info',
        title: 'Well-Optimized Build',
        description: 'Your build order is well-structured with good parallelization opportunities.',
        impact: 'low'
      })
    }

    return suggestions
  }, [buildStats])

  // Critical path calculation
  const criticalPath = useMemo(() => {
    if (!showCriticalPath) return []

    // Find the longest path through the dependency graph
    const longestPaths: Record<string, number> = {}
    const pathNodes: Record<string, string[]> = {}

    // Initialize with nodes that have no dependencies (layer 0)
    Object.values(graph.nodes).forEach(node => {
      if (node.buildLayer === 0) {
        longestPaths[node.id] = 1
        pathNodes[node.id] = [node.id]
      }
    })

    // Process layers in order
    const maxLayer = Math.max(...Object.values(graph.nodes).map(n => n.buildLayer))
    for (let layer = 1; layer <= maxLayer; layer++) {
      const layerNodes = Object.values(graph.nodes).filter(n => n.buildLayer === layer)

      layerNodes.forEach(node => {
        let maxPredecessorPath = 0
        let bestPath: string[] = []

        // Check all dependencies (incoming edges)
        const dependencies = graph.reverseAdjacency[node.id] || []
        dependencies.forEach(depId => {
          const depPath = longestPaths[depId] || 0
          if (depPath > maxPredecessorPath) {
            maxPredecessorPath = depPath
            bestPath = [...(pathNodes[depId] || []), node.id]
          }
        })

        longestPaths[node.id] = maxPredecessorPath + 1
        pathNodes[node.id] = bestPath.length > 0 ? bestPath : [node.id]
      })
    }

    // Find the node with the longest path
    let criticalNode = ''
    let maxPathLength = 0
    Object.entries(longestPaths).forEach(([nodeId, pathLength]) => {
      if (pathLength > maxPathLength) {
        maxPathLength = pathLength
        criticalNode = nodeId
      }
    })

    return pathNodes[criticalNode] || []
  }, [graph, showCriticalPath])

  const renderStatsView = () => (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-panel border border-border rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Total Build Layers</div>
          <div className="text-2xl font-bold text-white">{buildStats.totalLayers}</div>
          <div className="text-xs text-gray-500">Sequential steps required</div>
        </div>
        <div className="bg-panel border border-border rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Build Efficiency</div>
          <div className={`text-2xl font-bold ${
            buildStats.buildEfficiency >= 70 ? 'text-green-400' :
            buildStats.buildEfficiency >= 40 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {buildStats.buildEfficiency}%
          </div>
          <div className="text-xs text-gray-500">Parallelization score</div>
        </div>
        <div className="bg-panel border border-border rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Max Parallelism</div>
          <div className="text-2xl font-bold text-blue-400">{buildStats.maxParallelism}</div>
          <div className="text-xs text-gray-500">Concurrent builds possible</div>
        </div>
        <div className="bg-panel border border-border rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Critical Path</div>
          <div className="text-2xl font-bold text-orange-400">{buildStats.criticalPathLength}</div>
          <div className="text-xs text-gray-500">Minimum build time (layers)</div>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="bg-panel border border-border rounded-lg p-4">
        <h4 className="text-sm font-medium text-white mb-3">Detailed Metrics</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Total Packages:</span>
            <span className="text-white font-mono">{buildStats.totalPackages}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Parallelizable Packages:</span>
            <span className="text-white font-mono">
              {buildStats.parallelizablePackages} ({Math.round((buildStats.parallelizablePackages / buildStats.totalPackages) * 100)}%)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Average Layer Size:</span>
            <span className="text-white font-mono">{buildStats.averageLayerSize}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bottleneck Layers:</span>
            <span className="text-white font-mono">
              {buildStats.bottleneckLayers.length > 0 ? buildStats.bottleneckLayers.join(', ') : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Optimization Suggestions */}
      <div className="bg-panel border border-border rounded-lg p-4">
        <h4 className="text-sm font-medium text-white mb-3">Optimization Suggestions</h4>
        <div className="space-y-3">
          {optimizationSuggestions.map((suggestion, idx) => (
            <div
              key={idx}
              className={`border-l-4 pl-3 py-2 ${
                suggestion.type === 'error' ? 'border-red-500 bg-red-500/10' :
                suggestion.type === 'warning' ? 'border-yellow-500 bg-yellow-500/10' :
                'border-blue-500 bg-blue-500/10'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={`text-sm font-medium ${
                  suggestion.type === 'error' ? 'text-red-400' :
                  suggestion.type === 'warning' ? 'text-yellow-400' :
                  'text-blue-400'
                }`}>
                  {suggestion.title}
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  suggestion.impact === 'high' ? 'bg-red-600 text-white' :
                  suggestion.impact === 'medium' ? 'bg-yellow-600 text-white' :
                  'bg-blue-600 text-white'
                }`}>
                  {suggestion.impact} impact
                </span>
              </div>
              <div className="text-xs text-gray-300">{suggestion.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderLayersView = () => (
    <div className="space-y-4">
      {/* Critical Path Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Build Layers</h3>
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={showCriticalPath}
            onChange={(e) => setShowCriticalPath(e.target.checked)}
            className="rounded bg-panel border-border"
          />
          <span className="text-gray-300">Highlight Critical Path</span>
        </label>
      </div>

      {/* Layer Timeline */}
      <div className="bg-panel border border-border rounded-lg p-4">
        <div className="flex items-center space-x-4 mb-4">
          <div className="text-sm text-gray-400">Build Timeline:</div>
          <div className="flex-1 bg-gray-700 rounded-full h-2 relative">
            {buildAnalysis.layers.map((layer, idx) => (
              <div
                key={layer.layer}
                className="absolute top-0 h-full bg-blue-500 border-r border-gray-600"
                style={{
                  left: `${(idx / buildAnalysis.layers.length) * 100}%`,
                  width: `${100 / buildAnalysis.layers.length}%`
                }}
                title={`Layer ${layer.layer}: ${layer.packages.length} packages`}
              />
            ))}
          </div>
          <div className="text-sm text-gray-400">{buildAnalysis.layers.length} steps</div>
        </div>
      </div>

      {/* Layers */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {buildAnalysis.layers.map(layer => (
          <div
            key={layer.layer}
            className={`bg-panel border rounded-lg p-4 transition-all duration-200 ${
              selectedLayer === layer.layer ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-gray-500'
            }`}
            onClick={() => setSelectedLayer(selectedLayer === layer.layer ? null : layer.layer)}
          >
            {/* Layer Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="text-blue-400 font-bold text-lg">Layer {layer.layer}</div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-400">
                    {layer.packages.length} package{layer.packages.length !== 1 ? 's' : ''}
                  </span>
                  {layer.canBuildInParallel && (
                    <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">Parallel</span>
                  )}
                  {buildStats.bottleneckLayers.includes(layer.layer) && (
                    <span className="bg-yellow-600 text-white text-xs px-2 py-1 rounded">Bottleneck</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-400">~{layer.estimatedTime}s</div>
                <div className="text-xs text-gray-500">Est. build time</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-700 rounded-full h-1 mb-3">
              <div
                className="bg-blue-500 h-1 rounded-full"
                style={{ width: `${(layer.packages.length / buildStats.maxParallelism) * 100}%` }}
              />
            </div>

            {/* Packages */}
            <div className="space-y-1">
              {layer.packages.map(pkg => (
                <div
                  key={pkg.id}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                    criticalPath.includes(pkg.id)
                      ? 'bg-orange-500/20 border border-orange-500/50'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onNodeSelect(pkg.id)
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm text-white">{pkg.name}</span>
                    <span className="text-xs text-gray-400">({pkg.ecosystem})</span>
                    {pkg.isRoot && <span className="text-green-400 text-xs">ROOT</span>}
                    {criticalPath.includes(pkg.id) && showCriticalPath && (
                      <span className="bg-orange-600 text-white text-xs px-1 rounded">CRITICAL</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    {pkg.hasVersionConflict && <span className="w-2 h-2 bg-red-500 rounded-full" title="Version Conflict" />}
                    {pkg.isGhostDependency && <span className="w-2 h-2 bg-yellow-500 rounded-full" title="Ghost Dependency" />}
                    {pkg.hasLicenseConflict && <span className="w-2 h-2 bg-purple-500 rounded-full" title="License Conflict" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {buildAnalysis.layers.length === 0 && (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">No build order available</div>
          <div className="text-xs text-gray-500">
            Build layers are computed during dependency analysis.
          </div>
        </div>
      )}
    </div>
  )

  const renderTimelineView = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Build Timeline</h3>

      {/* Timeline Visualization */}
      <div className="bg-panel border border-border rounded-lg p-6 overflow-x-auto">
        <div className="relative" style={{ minWidth: '600px', height: '300px' }}>
          {/* Timeline axis */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-600" />

          {/* Time markers */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-400 mb-2">
            {buildAnalysis.layers.map((_, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div className="w-px h-4 bg-gray-600 mb-1" />
                <span>{idx}s</span>
              </div>
            ))}
          </div>

          {/* Build blocks */}
          <div className="absolute inset-0 mb-8">
            {buildAnalysis.layers.map((layer, idx) => (
              <div
                key={layer.layer}
                className="absolute flex flex-col space-y-1"
                style={{
                  left: `${(idx / buildAnalysis.layers.length) * 90}%`,
                  width: `${90 / buildAnalysis.layers.length}%`,
                  bottom: '0px'
                }}
              >
                {layer.packages.map((pkg, pkgIdx) => (
                  <div
                    key={pkg.id}
                    className={`p-2 rounded text-xs cursor-pointer transition-all duration-200 ${
                      criticalPath.includes(pkg.id) && showCriticalPath
                        ? 'bg-orange-500 text-white'
                        : 'bg-blue-600 text-white hover:bg-blue-500'
                    }`}
                    style={{
                      height: '20px',
                      marginBottom: '2px'
                    }}
                    onClick={() => onNodeSelect(pkg.id)}
                    title={`${pkg.name} (${pkg.ecosystem})`}
                  >
                    <div className="truncate">{pkg.name}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-panel border border-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-white">
            {buildAnalysis.layers.reduce((sum, layer) => sum + layer.estimatedTime, 0)}s
          </div>
          <div className="text-xs text-gray-400">Sequential Time</div>
        </div>
        <div className="bg-panel border border-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-green-400">
            {Math.max(...buildAnalysis.layers.map(l => l.estimatedTime), 0)}s
          </div>
          <div className="text-xs text-gray-400">Parallel Time</div>
        </div>
        <div className="bg-panel border border-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-blue-400">
            {Math.round((1 - Math.max(...buildAnalysis.layers.map(l => l.estimatedTime), 0) /
              buildAnalysis.layers.reduce((sum, layer) => sum + layer.estimatedTime, 1)) * 100)}%
          </div>
          <div className="text-xs text-gray-400">Time Saved</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex-1 bg-surface border border-border rounded-lg m-4 overflow-hidden">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Build Order Analysis</h2>

          {/* View Mode Tabs */}
          <div className="flex space-x-1 bg-panel rounded-lg p-1">
            {[
              { id: 'layers', label: 'Layers', icon: '📊' },
              { id: 'timeline', label: 'Timeline', icon: '⏱️' },
              { id: 'stats', label: 'Stats', icon: '📈' }
            ].map(mode => (
              <button
                key={mode.id}
                onClick={() => setViewMode(mode.id as any)}
                className={`px-3 py-2 text-sm rounded transition-colors ${
                  viewMode === mode.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                <span className="mr-2">{mode.icon}</span>
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center space-x-6 mt-3 text-sm text-gray-400">
          <span>
            <span className="text-white font-medium">{buildStats.totalLayers}</span> layers
          </span>
          <span>
            <span className="text-white font-medium">{buildStats.totalPackages}</span> packages
          </span>
          <span>
            <span className="text-white font-medium">{buildStats.buildEfficiency}%</span> efficiency
          </span>
          <span>
            <span className="text-white font-medium">{buildStats.maxParallelism}</span> max parallel
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {viewMode === 'layers' && renderLayersView()}
        {viewMode === 'timeline' && renderTimelineView()}
        {viewMode === 'stats' && renderStatsView()}
      </div>
    </div>
  )
}

export default BuildOrderPanel