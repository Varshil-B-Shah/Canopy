'use client'

import React, { useState } from 'react'
import type { DependencyGraph, ConflictDetail, GhostDependency, LicenseConflict, SCCCluster } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  onNodeSelect: (id: string) => void
}

interface IssueSection {
  id: string
  title: string
  count: number
  color: string
  bgColor: string
  expanded: boolean
}

const IssuesPanel: React.FC<Props> = ({ graph, onNodeSelect }) => {
  const versionConflicts = graph.metadata.versionConflicts || []
  const ghostDeps = graph.metadata.ghostDependencies || []
  const licenseConflicts = graph.metadata.licenseConflicts || []
  const circularDeps = graph.metadata.sccClusters?.filter(scc => scc.members.length > 1) || []

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    version: true,
    circular: true,
    ghost: true,
    license: true
  })

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  const handlePackageClick = (packageName: string) => {
    // Find the node ID for this package name
    const nodeId = Object.keys(graph.nodes).find(id =>
      graph.nodes[id].name === packageName
    )
    if (nodeId) {
      onNodeSelect(nodeId)
    }
  }

  const getSeverityIcon = (severity: 'error' | 'warning') => {
    if (severity === 'error') {
      return (
        <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )
    }
    return (
      <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    )
  }

  const renderVersionConflicts = () => {
    if (versionConflicts.length === 0) return null

    return (
      <div className="mb-6">
        <button
          onClick={() => toggleSection('version')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <h3 className="text-sm font-medium text-red-400">Version Conflicts</h3>
            <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">
              {versionConflicts.length}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transform transition-transform ${
              expandedSections.version ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSections.version && (
          <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
            {versionConflicts.map((conflict, idx) => (
              <div key={idx} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <div className="flex items-start justify-between mb-3">
                  <button
                    onClick={() => handlePackageClick(conflict.packageName)}
                    className="text-red-400 font-medium hover:text-red-300 transition-colors cursor-pointer text-left"
                  >
                    {conflict.packageName}
                  </button>
                  <div className="flex items-center space-x-2">
                    {getSeverityIcon(conflict.severity)}
                    <span className={`text-xs font-medium ${
                      conflict.severity === 'error' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {conflict.severity}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-gray-400">
                    <span className="font-medium">Conflicting Constraints:</span>
                  </div>
                  {conflict.constraints.map((constraint, cidx) => (
                    <div key={cidx} className="flex justify-between items-center bg-gray-800 rounded p-2">
                      <code className="text-xs text-blue-300">{constraint.constraint}</code>
                      <button
                        onClick={() => handlePackageClick(graph.nodes[constraint.imposedBy]?.name || constraint.imposedBy)}
                        className="text-xs text-gray-400 hover:text-white cursor-pointer"
                        title="Click to view imposing package"
                      >
                        imposed by: {graph.nodes[constraint.imposedBy]?.name || constraint.imposedBy}
                      </button>
                    </div>
                  ))}

                  {conflict.intersection === null && (
                    <div className="bg-red-900 border border-red-700 rounded p-2 text-xs text-red-200">
                      <strong>No compatible version found</strong> - These constraints cannot be satisfied together
                    </div>
                  )}

                  {conflict.intersection && (
                    <div className="bg-yellow-900 border border-yellow-700 rounded p-2 text-xs text-yellow-200">
                      <strong>Compatible range:</strong> <code>{conflict.intersection}</code>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderCircularDependencies = () => {
    if (circularDeps.length === 0) return null

    return (
      <div className="mb-6">
        <button
          onClick={() => toggleSection('circular')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
            <h3 className="text-sm font-medium text-orange-400">Circular Dependencies</h3>
            <span className="bg-orange-600 text-white text-xs px-2 py-1 rounded-full">
              {circularDeps.length}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transform transition-transform ${
              expandedSections.circular ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSections.circular && (
          <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
            {circularDeps.map((scc, idx) => (
              <div key={idx} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-orange-400 font-medium">SCC Cluster #{scc.id}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {scc.members.length} packages
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-gray-400 font-medium">Packages in Cycle:</div>
                  <div className="flex flex-wrap gap-1">
                    {scc.members.map((memberId, midx) => (
                      <button
                        key={midx}
                        onClick={() => onNodeSelect(memberId)}
                        className="bg-gray-800 hover:bg-gray-700 text-orange-300 text-xs px-2 py-1 rounded cursor-pointer transition-colors"
                      >
                        {graph.nodes[memberId]?.name || memberId}
                      </button>
                    ))}
                  </div>

                  {scc.cycleEdges && scc.cycleEdges.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-gray-400 font-medium mb-1">Cycle Path:</div>
                      <div className="bg-gray-800 rounded p-2 text-xs">
                        {scc.cycleEdges.map(([from, to], eidx) => (
                          <div key={eidx} className="flex items-center space-x-2 py-1">
                            <button
                              onClick={() => onNodeSelect(from)}
                              className="text-orange-300 hover:text-orange-200 cursor-pointer"
                            >
                              {graph.nodes[from]?.name || from}
                            </button>
                            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <button
                              onClick={() => onNodeSelect(to)}
                              className="text-orange-300 hover:text-orange-200 cursor-pointer"
                            >
                              {graph.nodes[to]?.name || to}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderGhostDependencies = () => {
    if (ghostDeps.length === 0) return null

    return (
      <div className="mb-6">
        <button
          onClick={() => toggleSection('ghost')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <h3 className="text-sm font-medium text-yellow-400">Ghost Dependencies</h3>
            <span className="bg-yellow-600 text-white text-xs px-2 py-1 rounded-full">
              {ghostDeps.length}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transform transition-transform ${
              expandedSections.ghost ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSections.ghost && (
          <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
            {ghostDeps.map((ghost, idx) => (
              <div key={idx} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <button
                      onClick={() => handlePackageClick(ghost.packageName)}
                      className="text-yellow-400 font-medium hover:text-yellow-300 transition-colors cursor-pointer"
                    >
                      {ghost.packageName}
                    </button>
                  </div>
                  <span className="text-xs text-gray-400">
                    {ghost.importedIn.length} file{ghost.importedIn.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="space-y-2">
                  {ghost.providedBy && (
                    <div className="bg-gray-800 rounded p-2">
                      <div className="text-xs text-gray-400 mb-1">Provided by:</div>
                      <button
                        onClick={() => handlePackageClick(ghost.providedBy!)}
                        className="text-blue-300 hover:text-blue-200 text-xs cursor-pointer"
                      >
                        {ghost.providedBy}
                      </button>
                    </div>
                  )}

                  <div className="bg-gray-800 rounded p-2">
                    <div className="text-xs text-gray-400 mb-1">Used in files:</div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {ghost.importedIn.slice(0, 5).map((file, fidx) => (
                        <div key={fidx} className="text-xs text-gray-300 font-mono">
                          {file}
                        </div>
                      ))}
                      {ghost.importedIn.length > 5 && (
                        <div className="text-xs text-gray-500 italic">
                          ... and {ghost.importedIn.length - 5} more files
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-yellow-900 border border-yellow-700 rounded p-2 text-xs text-yellow-200">
                    <strong>Fix:</strong> Add this package to your dependencies or remove the imports
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderLicenseConflicts = () => {
    if (licenseConflicts.length === 0) return null

    return (
      <div className="mb-6">
        <button
          onClick={() => toggleSection('license')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            <h3 className="text-sm font-medium text-purple-400">License Conflicts</h3>
            <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
              {licenseConflicts.length}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transform transition-transform ${
              expandedSections.license ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSections.license && (
          <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
            {licenseConflicts.map((license, idx) => (
              <div key={idx} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <div className="flex items-start justify-between mb-3">
                  <button
                    onClick={() => handlePackageClick(license.packageName)}
                    className="text-purple-400 font-medium hover:text-purple-300 transition-colors cursor-pointer"
                  >
                    {license.packageName}
                  </button>
                  <div className="flex items-center space-x-2">
                    {getSeverityIcon(license.severity)}
                    <span className={`text-xs font-medium ${
                      license.severity === 'error' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {license.severity}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="bg-gray-800 rounded p-2">
                    <div className="text-xs text-gray-400 mb-1">License:</div>
                    <code className="text-purple-300 text-xs">{license.license}</code>
                  </div>

                  <div className="bg-gray-800 rounded p-2">
                    <div className="text-xs text-gray-400 mb-1">Dependency Path:</div>
                    <div className="flex items-center space-x-1 text-xs overflow-x-auto">
                      {license.path.map((nodeId, pidx) => (
                        <React.Fragment key={pidx}>
                          <button
                            onClick={() => onNodeSelect(nodeId)}
                            className="text-purple-300 hover:text-purple-200 cursor-pointer whitespace-nowrap"
                          >
                            {graph.nodes[nodeId]?.name || nodeId}
                          </button>
                          {pidx < license.path.length - 1 && (
                            <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className={`border rounded p-2 text-xs ${
                    license.severity === 'error'
                      ? 'bg-red-900 border-red-700 text-red-200'
                      : 'bg-yellow-900 border-yellow-700 text-yellow-200'
                  }`}>
                    <strong>License Issue:</strong> This license may be incompatible with your project's licensing requirements
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const totalIssues = versionConflicts.length + circularDeps.length + ghostDeps.length + licenseConflicts.length

  if (totalIssues === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-green-400 mb-2">No Issues Found</h3>
        <p className="text-gray-400 text-center max-w-sm">
          Your dependency graph looks healthy! All version constraints are satisfied,
          no circular dependencies detected, and no license conflicts found.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-900 min-h-full">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Dependency Issues</h2>
        <p className="text-gray-400">
          Found {totalIssues} issue{totalIssues !== 1 ? 's' : ''} in your dependency graph.
          Click on package names to navigate to them in the graph.
        </p>
      </div>

      <div className="space-y-6">
        {renderVersionConflicts()}
        {renderCircularDependencies()}
        {renderGhostDependencies()}
        {renderLicenseConflicts()}
      </div>
    </div>
  )
}

export default IssuesPanel