'use client'

import React, { useState } from 'react'
import type { PackageNode, DependencyGraph, QueryResult } from '@/engine/types'

interface Props {
  node: PackageNode
  graph: DependencyGraph
  projectDir: string
  onNodeSelect: (id: string | null) => void
}

const NodeDetail: React.FC<Props> = ({
  node,
  graph,
  projectDir,
  onNodeSelect
}) => {
  const [showAllDeps, setShowAllDeps] = useState(false)
  const [showAllDependents, setShowAllDependents] = useState(false)
  const [transitiveQuery, setTransitiveQuery] = useState('')
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [isQuerying, setIsQuerying] = useState(false)

  // Get dependencies and dependents
  const dependencies = graph.adjacencyList[node.id] || []
  const dependents = graph.reverseAdjacency[node.id] || []

  const displayedDependencies = showAllDeps ? dependencies : dependencies.slice(0, 5)
  const displayedDependents = showAllDependents ? dependents : dependents.slice(0, 5)

  // Handle transitive query
  const handleTransitiveQuery = async () => {
    if (!transitiveQuery.trim()) return

    setIsQuerying(true)
    setQueryResult(null)

    try {
      let targetNodeId: string

      // If the query contains ':', treat it as a full node ID (ecosystem:name)
      // Otherwise, assume it's a package name in the same ecosystem
      if (transitiveQuery.includes(':')) {
        targetNodeId = transitiveQuery.trim()
      } else {
        targetNodeId = `${node.ecosystem}:${transitiveQuery.trim()}`
      }

      const response = await fetch(
        `/api/query?type=transitive&from=${encodeURIComponent(node.id)}&to=${encodeURIComponent(targetNodeId)}&dir=${encodeURIComponent(projectDir)}`
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      setQueryResult(result)
    } catch (error) {
      console.error('Query failed:', error)
      setQueryResult({
        type: 'transitive',
        query: transitiveQuery,
        result: null,
        latencyMs: 0
      })
    } finally {
      setIsQuerying(false)
    }
  }

  // Status badge component
  const StatusBadge = ({
    active,
    color,
    label
  }: {
    active: boolean
    color: string
    label: string
  }) => (
    <div className={`flex items-center space-x-2 px-2 py-1 rounded-full text-xs ${
      active ? `bg-${color}-600/20 border border-${color}-500/30` : 'bg-gray-700/50 border border-gray-600/30'
    }`}>
      <div className={`w-2 h-2 rounded-full ${active ? `bg-${color}-500` : 'bg-gray-500'}`}></div>
      <span className={active ? `text-${color}-300` : 'text-gray-400'}>{label}</span>
    </div>
  )

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
      {/* Node Header */}
      <div className="border-b border-gray-700 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-white">{node.name}</h2>
          <button
            onClick={() => onNodeSelect(null)}
            className="text-gray-400 hover:text-white p-1 rounded"
            title="Close details"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Package Metadata */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Ecosystem:</span>
              <span className="text-white font-mono bg-gray-700 px-2 py-1 rounded">{node.ecosystem}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Declared:</span>
              <span className="text-white font-mono">{node.declaredVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Resolved:</span>
              <span className="text-white font-mono">{node.resolvedVersion}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">License:</span>
              <span className={`font-mono ${node.hasLicenseConflict ? 'text-purple-300' : 'text-white'}`}>
                {node.license}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Build Layer:</span>
              <span className="text-white font-mono">{node.buildLayer !== -1 ? node.buildLayer : 'N/A'}</span>
            </div>
            {node.isRoot && (
              <div className="flex justify-between">
                <span className="text-gray-400">Type:</span>
                <span className="text-green-300 font-medium">Root Package</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Badges */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Status</h3>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            active={node.hasVersionConflict}
            color="red"
            label="Version Conflict"
          />
          <StatusBadge
            active={node.isGhostDependency}
            color="yellow"
            label="Ghost Dependency"
          />
          <StatusBadge
            active={node.hasLicenseConflict}
            color="purple"
            label="License Conflict"
          />
          <StatusBadge
            active={node.sccId !== -1 && graph.metadata.sccClusters?.some(scc => scc.id === node.sccId && scc.members.length > 1)}
            color="orange"
            label="Circular Dependency"
          />
        </div>
      </div>

      {/* Dependencies Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">
            Dependencies ({dependencies.length})
          </h3>
        </div>
        {dependencies.length > 0 ? (
          <div className="space-y-1">
            {displayedDependencies.map(depId => {
              const depNode = graph.nodes[depId]
              if (!depNode) return null

              return (
                <div
                  key={depId}
                  onClick={() => onNodeSelect(depId)}
                  className="flex items-center justify-between p-2 bg-gray-700/50 rounded cursor-pointer hover:bg-gray-700 transition-colors group"
                >
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      depNode.hasVersionConflict ? 'bg-red-500' :
                      depNode.isGhostDependency ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}></div>
                    <span className="text-gray-300 group-hover:text-white text-sm font-mono">
                      {depNode.name}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-gray-400">
                    <span>{depNode.resolvedVersion}</span>
                    <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )
            })}
            {dependencies.length > 5 && (
              <button
                onClick={() => setShowAllDeps(!showAllDeps)}
                className="w-full text-center py-2 text-xs text-blue-400 hover:text-blue-300 border border-gray-600 rounded hover:border-blue-500 transition-colors"
              >
                {showAllDeps ? 'Show Less' : `Show ${dependencies.length - 5} More`}
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            No dependencies
          </div>
        )}
      </div>

      {/* Dependents Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">
            Dependents ({dependents.length})
          </h3>
        </div>
        {dependents.length > 0 ? (
          <div className="space-y-1">
            {displayedDependents.map(depId => {
              const depNode = graph.nodes[depId]
              if (!depNode) return null

              return (
                <div
                  key={depId}
                  onClick={() => onNodeSelect(depId)}
                  className="flex items-center justify-between p-2 bg-gray-700/50 rounded cursor-pointer hover:bg-gray-700 transition-colors group"
                >
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      depNode.hasVersionConflict ? 'bg-red-500' :
                      depNode.isGhostDependency ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}></div>
                    <span className="text-gray-300 group-hover:text-white text-sm font-mono">
                      {depNode.name}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-gray-400">
                    <span>{depNode.resolvedVersion}</span>
                    <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )
            })}
            {dependents.length > 5 && (
              <button
                onClick={() => setShowAllDependents(!showAllDependents)}
                className="w-full text-center py-2 text-xs text-blue-400 hover:text-blue-300 border border-gray-600 rounded hover:border-blue-500 transition-colors"
              >
                {showAllDependents ? 'Show Less' : `Show ${dependents.length - 5} More`}
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            No dependents
          </div>
        )}
      </div>

      {/* Interactive Transitive Query */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Transitive Query</h3>
        <div className="space-y-3">
          <div className="flex space-x-2">
            <input
              type="text"
              value={transitiveQuery}
              onChange={(e) => setTransitiveQuery(e.target.value)}
              placeholder={`Package name or ecosystem:name (e.g., "express" or "${node.ecosystem}:lodash")`}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && !isQuerying && handleTransitiveQuery()}
              disabled={isQuerying}
            />
            <button
              onClick={handleTransitiveQuery}
              disabled={isQuerying || !transitiveQuery.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isQuerying ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                  <span>Checking...</span>
                </>
              ) : (
                <span>Ask</span>
              )}
            </button>
          </div>

          {/* Query Result */}
          {queryResult && (
            <div className={`p-3 rounded border ${
              queryResult.result === true
                ? 'bg-green-600/20 border-green-500/30 text-green-300'
                : queryResult.result === false
                ? 'bg-red-600/20 border-red-500/30 text-red-300'
                : 'bg-gray-600/20 border-gray-500/30 text-gray-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  Does <span className="font-mono">{node.name}</span> depend on <span className="font-mono">{transitiveQuery}</span>?
                </div>
                <div className="text-xs text-gray-400">
                  {queryResult.latencyMs}ms
                </div>
              </div>
              <div className="mt-1 font-medium">
                {queryResult.result === null ? 'Error' :
                 queryResult.result === true ? 'Yes' : 'No'}
                {queryResult.method && (
                  <span className="ml-2 text-xs opacity-75">({queryResult.method})</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default NodeDetail