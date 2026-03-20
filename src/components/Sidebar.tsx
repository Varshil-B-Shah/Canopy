'use client'

import React, { useState } from 'react'
import type { DependencyGraph, DependencyDiff, PackageNode, ConflictDetail, GhostDependency, LicenseConflict, SCCCluster } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  selectedNodeId: string | null
  diff: DependencyDiff | null
  projectDir: string
  onNodeSelect: (id: string | null) => void
}

type TabId = 'node' | 'issues' | 'diff' | 'build'

interface Tab {
  id: TabId
  label: string
  badge?: number
}

const Sidebar: React.FC<Props> = ({
  graph,
  selectedNodeId,
  diff,
  projectDir,
  onNodeSelect
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('node')
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Calculate badge counts for tabs
  const issueCount = (graph.metadata.versionConflicts?.length || 0) +
                    (graph.metadata.ghostDependencies?.length || 0) +
                    (graph.metadata.licenseConflicts?.length || 0) +
                    (graph.metadata.sccClusters?.filter(scc => scc.members.length > 1).length || 0)

  const diffCount = diff ? (diff.added.length + diff.removed.length + diff.updated.length) : 0

  const tabs: Tab[] = [
    { id: 'node', label: 'Node' },
    { id: 'issues', label: 'Issues', badge: issueCount },
    { id: 'diff', label: 'Diff', badge: diffCount },
    { id: 'build', label: 'Build' }
  ]

  const selectedNode = selectedNodeId ? graph.nodes[selectedNodeId] : null

  const renderNodeTab = () => {
    if (selectedNode) {
      return (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">{selectedNode.name}</h3>
              <button
                onClick={() => onNodeSelect(null)}
                className="text-gray-400 hover:text-white p-1"
                title="Deselect node"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Ecosystem:</span>
                <span className="text-white font-mono">{selectedNode.ecosystem}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Declared:</span>
                <span className="text-white font-mono">{selectedNode.declaredVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Resolved:</span>
                <span className="text-white font-mono">{selectedNode.resolvedVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">License:</span>
                <span className={`font-mono ${selectedNode.hasLicenseConflict ? 'text-purple-400' : 'text-white'}`}>
                  {selectedNode.license}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Build Layer:</span>
                <span className="text-white font-mono">{selectedNode.buildLayer !== -1 ? selectedNode.buildLayer : 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Node Status Indicators */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">Status</h4>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${selectedNode.isRoot ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                <span className="text-xs text-gray-400">Root Package</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${selectedNode.hasVersionConflict ? 'bg-red-500' : 'bg-gray-600'}`}></div>
                <span className="text-xs text-gray-400">Version Conflict</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${selectedNode.isGhostDependency ? 'bg-yellow-500' : 'bg-gray-600'}`}></div>
                <span className="text-xs text-gray-400">Ghost Dependency</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${selectedNode.hasLicenseConflict ? 'bg-purple-500' : 'bg-gray-600'}`}></div>
                <span className="text-xs text-gray-400">License Conflict</span>
              </div>
            </div>
          </div>

          {/* Dependencies */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">Dependencies</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Direct:</span>
                <span className="text-white">{graph.adjacencyList[selectedNode.id]?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Dependents:</span>
                <span className="text-white">{graph.reverseAdjacency[selectedNode.id]?.length || 0}</span>
              </div>
            </div>
          </div>

          {/* Conflicts for this node */}
          {selectedNode.conflictDetails && selectedNode.conflictDetails.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-red-400 mb-2">Conflicts</h4>
              <div className="space-y-2">
                {selectedNode.conflictDetails.map((conflict, idx) => (
                  <div key={idx} className="bg-gray-800 rounded p-2 text-xs">
                    <div className="text-red-400 font-medium">{conflict.packageName}</div>
                    <div className="text-gray-400 mt-1">
                      Severity: <span className={conflict.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                        {conflict.severity}
                      </span>
                    </div>
                    {conflict.constraints.length > 0 && (
                      <div className="mt-1">
                        <div className="text-gray-500">Constraints:</div>
                        {conflict.constraints.map((constraint, cidx) => (
                          <div key={cidx} className="ml-2 text-gray-400">
                            {constraint.constraint} (from {graph.nodes[constraint.imposedBy]?.name || constraint.imposedBy})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Graph Overview</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Packages:</span>
              <span className="text-white font-mono">{graph.metadata.totalPackages}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Edges:</span>
              <span className="text-white font-mono">{graph.metadata.totalEdges}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Max Depth:</span>
              <span className="text-white font-mono">{graph.metadata.maxDepth}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Critical Path:</span>
              <span className="text-white font-mono">{graph.metadata.criticalPathLength}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Ecosystems:</span>
              <span className="text-white font-mono">{graph.metadata.ecosystems.join(', ')}</span>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">Scan Info</h4>
          <div className="text-xs text-gray-400">
            <div>Scanned: {new Date(graph.metadata.scannedAt).toLocaleString()}</div>
            <div>Project: {projectDir}</div>
          </div>
        </div>

        <div className="text-xs text-gray-500 italic">
          Click on a node in the graph to see detailed information.
        </div>
      </div>
    )
  }

  const renderIssuesTab = () => {
    const versionConflicts = graph.metadata.versionConflicts || []
    const ghostDeps = graph.metadata.ghostDependencies || []
    const licenseConflicts = graph.metadata.licenseConflicts || []
    const circularDeps = graph.metadata.sccClusters?.filter(scc => scc.members.length > 1) || []

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Issues</h3>

        {/* Version Conflicts */}
        {versionConflicts.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center">
              Version Conflicts
              <span className="ml-2 bg-red-600 text-white text-xs px-1 rounded">{versionConflicts.length}</span>
            </h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {versionConflicts.map((conflict, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-2 text-xs">
                  <div className="text-red-400 font-medium">{conflict.packageName}</div>
                  <div className="text-gray-400">
                    Severity: <span className={conflict.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                      {conflict.severity}
                    </span>
                  </div>
                  <div className="text-gray-500 mt-1">
                    {conflict.constraints.length} conflicting constraints
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Circular Dependencies */}
        {circularDeps.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-orange-400 mb-2 flex items-center">
              Circular Dependencies
              <span className="ml-2 bg-orange-600 text-white text-xs px-1 rounded">{circularDeps.length}</span>
            </h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {circularDeps.map((scc, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-2 text-xs">
                  <div className="text-orange-400 font-medium">SCC #{scc.id}</div>
                  <div className="text-gray-400 mt-1">
                    {scc.members.length} packages in cycle
                  </div>
                  <div className="text-gray-500 text-xs mt-1 max-h-16 overflow-y-auto">
                    {scc.members.map(id => graph.nodes[id]?.name || id).join(' → ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ghost Dependencies */}
        {ghostDeps.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-yellow-400 mb-2 flex items-center">
              Ghost Dependencies
              <span className="ml-2 bg-yellow-600 text-white text-xs px-1 rounded">{ghostDeps.length}</span>
            </h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {ghostDeps.map((ghost, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-2 text-xs">
                  <div className="text-yellow-400 font-medium">{ghost.packageName}</div>
                  <div className="text-gray-400 mt-1">
                    Used in {ghost.importedIn.length} files
                  </div>
                  {ghost.providedBy && (
                    <div className="text-gray-500">Provided by: {ghost.providedBy}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* License Conflicts */}
        {licenseConflicts.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-purple-400 mb-2 flex items-center">
              License Conflicts
              <span className="ml-2 bg-purple-600 text-white text-xs px-1 rounded">{licenseConflicts.length}</span>
            </h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {licenseConflicts.map((license, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-2 text-xs">
                  <div className="text-purple-400 font-medium">{license.packageName}</div>
                  <div className="text-gray-400">License: {license.license}</div>
                  <div className="text-gray-500">
                    Severity: <span className={license.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                      {license.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {issueCount === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-lg font-medium text-green-400 mb-1">No Issues Found</h4>
            <p className="text-sm text-gray-400">Your dependency graph looks healthy!</p>
          </div>
        )}
      </div>
    )
  }

  const renderDiffTab = () => {
    if (!diff) {
      return (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Diff</h3>
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">No diff data available</div>
            <div className="text-xs text-gray-500">
              Diff information will appear here after rescanning a project.
            </div>
          </div>
        </div>
      )
    }

    if (!diff.hasChanges) {
      return (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Diff</h3>
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="text-lg font-medium text-blue-400 mb-1">No Changes</h4>
            <p className="text-sm text-gray-400">Dependencies are unchanged since last scan.</p>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Diff</h3>

        {/* Added packages */}
        {diff.added.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-green-400 mb-2 flex items-center">
              Added Packages
              <span className="ml-2 bg-green-600 text-white text-xs px-1 rounded">{diff.added.length}</span>
            </h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {diff.added.map((pkg, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-2 text-xs">
                  <div className="text-green-400 font-medium">{pkg.name}</div>
                  <div className="text-gray-400">{pkg.ecosystem}: {pkg.resolvedVersion}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Removed packages */}
        {diff.removed.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center">
              Removed Packages
              <span className="ml-2 bg-red-600 text-white text-xs px-1 rounded">{diff.removed.length}</span>
            </h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {diff.removed.map((pkg, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-2 text-xs">
                  <div className="text-red-400 font-medium">{pkg.name}</div>
                  <div className="text-gray-400">{pkg.ecosystem}: {pkg.resolvedVersion}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Updated packages */}
        {diff.updated.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center">
              Updated Packages
              <span className="ml-2 bg-blue-600 text-white text-xs px-1 rounded">{diff.updated.length}</span>
            </h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {diff.updated.map((update, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-2 text-xs">
                  <div className="text-blue-400 font-medium">{update.node.name}</div>
                  <div className="text-gray-400 flex items-center space-x-2">
                    <span>{update.previousVersion}</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span>{update.currentVersion}</span>
                    <span className={`px-1 rounded text-xs ${
                      update.changeType === 'major' ? 'bg-red-600 text-white' :
                      update.changeType === 'minor' ? 'bg-yellow-600 text-white' :
                      'bg-green-600 text-white'
                    }`}>
                      {update.changeType}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderBuildTab = () => {
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

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Build Order</h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Total Layers:</span>
            <span className="text-white font-mono">{layers.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Parallelizable:</span>
            <span className="text-white font-mono">{buildOrderNodes.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Critical Path:</span>
            <span className="text-white font-mono">{graph.metadata.criticalPathLength}</span>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">Build Layers</h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {layers.map(layer => (
              <div key={layer} className="bg-gray-800 rounded p-3">
                <div className="text-blue-400 font-medium text-sm mb-2">
                  Layer {layer}
                  <span className="ml-2 text-gray-400 text-xs">
                    ({layerGroups[layer].length} packages)
                  </span>
                </div>
                <div className="space-y-1">
                  {layerGroups[layer].map(node => (
                    <div
                      key={node.id}
                      className={`text-xs p-1 rounded cursor-pointer transition-colors ${
                        selectedNodeId === node.id
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => onNodeSelect(node.id)}
                    >
                      <span className="font-mono">{node.name}</span>
                      <span className="text-gray-400 ml-2">({node.ecosystem})</span>
                      {node.isRoot && <span className="ml-1 text-green-400">*</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {layers.length === 0 && (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">No build order available</div>
            <div className="text-xs text-gray-500">
              Build layers are computed during the dependency analysis.
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'node':
        return renderNodeTab()
      case 'issues':
        return renderIssuesTab()
      case 'diff':
        return renderDiffTab()
      case 'build':
        return renderBuildTab()
      default:
        return null
    }
  }

  if (isCollapsed) {
    return (
      <div className="w-8 bg-gray-800 border-l border-gray-700 flex flex-col">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          title="Expand sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
      {/* Tab Header */}
      <div className="flex-shrink-0 border-b border-gray-700">
        <div className="flex items-center justify-between p-2">
          <div className="flex space-x-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-xs font-medium rounded transition-colors relative ${
                  activeTab === tab.id
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs px-1 rounded-full min-w-[16px] h-4 flex items-center justify-center">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderTabContent()}
      </div>
    </div>
  )
}

export default Sidebar