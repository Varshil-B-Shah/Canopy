'use client'

import React from 'react'
import semver from 'semver'
import type { DependencyDiff, DependencyGraph, PackageNode, UpdatedPackage, ConflictDetail, VersionChangeType } from '@/engine/types'

interface Props {
  diff: DependencyDiff | null
  graph: DependencyGraph
  onNodeSelect: (id: string) => void
}

// Utility function to determine version change type
const getVersionChangeType = (previousVersion: string, currentVersion: string): VersionChangeType => {
  try {
    const cleanPrev = semver.clean(previousVersion)
    const cleanCurr = semver.clean(currentVersion)

    if (!cleanPrev || !cleanCurr) {
      return 'unknown'
    }

    const diff = semver.diff(cleanPrev, cleanCurr)

    if (diff === 'major') return 'major'
    if (diff === 'minor' || diff === 'preminor') return 'minor'
    if (diff === 'patch' || diff === 'prepatch') return 'patch'

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// Get badge color classes for change types
const getChangeTypeBadge = (changeType: VersionChangeType) => {
  switch (changeType) {
    case 'major':
      return 'bg-red-600 text-white'
    case 'minor':
      return 'bg-yellow-600 text-white'
    case 'patch':
      return 'bg-green-600 text-white'
    case 'unknown':
    default:
      return 'bg-gray-600 text-white'
  }
}

const DiffPanel: React.FC<Props> = ({ diff, graph, onNodeSelect }) => {
  // Handle null diff case
  if (!diff) {
    return (
      <div className="w-full bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Dependency Changes</h2>
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-400 mb-1">No Previous Scan</h3>
          <p className="text-sm text-gray-500">
            Diff information will appear here after rescanning a project that has been analyzed before.
          </p>
        </div>
      </div>
    )
  }

  // Handle no changes case
  if (!diff.hasChanges) {
    return (
      <div className="w-full bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Dependency Changes</h2>
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-blue-400 mb-1">No Changes Detected</h3>
          <p className="text-sm text-gray-400">
            Your dependencies are unchanged since the last scan.
          </p>
        </div>
      </div>
    )
  }

  // Calculate statistics
  const totalChanges = diff.added.length + diff.removed.length + diff.updated.length
  const conflictChanges = diff.newConflicts.length + diff.resolvedConflicts.length

  return (
    <div className="w-full bg-gray-800 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Dependency Changes</h2>
        <div className="flex items-center space-x-4 text-sm">
          <span className="text-gray-400">
            {totalChanges} package{totalChanges !== 1 ? 's' : ''} changed
          </span>
          {conflictChanges > 0 && (
            <span className="text-orange-400">
              {conflictChanges} conflict{conflictChanges !== 1 ? 's' : ''} affected
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Added Packages */}
        {diff.added.length > 0 && (
          <div>
            <div className="flex items-center mb-3">
              <h3 className="text-sm font-medium text-green-400">Added Packages</h3>
              <span className="ml-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                {diff.added.length}
              </span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {diff.added.map((pkg, idx) => (
                <div
                  key={idx}
                  className="bg-gray-750 border border-green-600/20 rounded p-3 cursor-pointer hover:bg-gray-700 transition-colors"
                  onClick={() => onNodeSelect(pkg.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-green-400 font-medium text-sm">{pkg.name}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        <span className="mr-3">{pkg.ecosystem}</span>
                        <span className="font-mono">{pkg.resolvedVersion}</span>
                      </div>
                    </div>
                    <div className="text-xs">
                      <span className="bg-green-600/20 text-green-400 px-2 py-1 rounded text-xs">
                        NEW
                      </span>
                    </div>
                  </div>
                  {pkg.license && (
                    <div className="text-xs text-gray-500 mt-2">
                      License: <span className="text-gray-400">{pkg.license}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Removed Packages */}
        {diff.removed.length > 0 && (
          <div>
            <div className="flex items-center mb-3">
              <h3 className="text-sm font-medium text-red-400">Removed Packages</h3>
              <span className="ml-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
                {diff.removed.length}
              </span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {diff.removed.map((pkg, idx) => (
                <div
                  key={idx}
                  className="bg-gray-750 border border-red-600/20 rounded p-3 cursor-pointer hover:bg-gray-700 transition-colors"
                  onClick={() => onNodeSelect(pkg.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-red-400 font-medium text-sm line-through">{pkg.name}</div>
                      <div className="text-xs text-gray-400 mt-1 line-through">
                        <span className="mr-3">{pkg.ecosystem}</span>
                        <span className="font-mono">{pkg.resolvedVersion}</span>
                      </div>
                    </div>
                    <div className="text-xs">
                      <span className="bg-red-600/20 text-red-400 px-2 py-1 rounded text-xs">
                        REMOVED
                      </span>
                    </div>
                  </div>
                  {pkg.license && (
                    <div className="text-xs text-gray-500 mt-2 line-through">
                      License: <span className="text-gray-400">{pkg.license}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Updated Packages */}
        {diff.updated.length > 0 && (
          <div>
            <div className="flex items-center mb-3">
              <h3 className="text-sm font-medium text-blue-400">Updated Packages</h3>
              <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                {diff.updated.length}
              </span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {diff.updated.map((update, idx) => {
                const changeType = getVersionChangeType(update.previousVersion, update.currentVersion)
                return (
                  <div
                    key={idx}
                    className="bg-gray-750 border border-blue-600/20 rounded p-3 cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => onNodeSelect(update.node.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-blue-400 font-medium text-sm">{update.node.name}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          <span className="mr-3">{update.node.ecosystem}</span>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="font-mono text-gray-300">{update.previousVersion}</span>
                            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="font-mono text-gray-300">{update.currentVersion}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs">
                        <span className={`px-2 py-1 rounded text-xs uppercase ${getChangeTypeBadge(changeType)}`}>
                          {changeType}
                        </span>
                      </div>
                    </div>
                    {update.node.license && (
                      <div className="text-xs text-gray-500 mt-2">
                        License: <span className="text-gray-400">{update.node.license}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* New Conflicts */}
        {diff.newConflicts.length > 0 && (
          <div>
            <div className="flex items-center mb-3">
              <h3 className="text-sm font-medium text-orange-400">New Conflicts</h3>
              <span className="ml-2 bg-orange-600 text-white text-xs px-2 py-0.5 rounded-full">
                {diff.newConflicts.length}
              </span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {diff.newConflicts.map((conflict, idx) => (
                <div key={idx} className="bg-gray-750 border border-orange-600/20 rounded p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-orange-400 font-medium text-sm">{conflict.packageName}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {conflict.constraints.length} conflicting constraint{conflict.constraints.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-xs">
                      <span className={`px-2 py-1 rounded text-xs uppercase ${
                        conflict.severity === 'error' ? 'bg-red-600 text-white' : 'bg-yellow-600 text-white'
                      }`}>
                        {conflict.severity}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {conflict.constraints.slice(0, 2).map((constraint, cidx) => (
                      <div key={cidx} className="text-xs text-gray-500">
                        {constraint.constraint}
                        <span className="text-gray-600"> from </span>
                        <span
                          className="text-blue-400 hover:text-blue-300 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            onNodeSelect(constraint.imposedBy)
                          }}
                        >
                          {graph.nodes[constraint.imposedBy]?.name || constraint.imposedBy}
                        </span>
                      </div>
                    ))}
                    {conflict.constraints.length > 2 && (
                      <div className="text-xs text-gray-600">
                        +{conflict.constraints.length - 2} more constraint{conflict.constraints.length - 2 !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolved Conflicts */}
        {diff.resolvedConflicts.length > 0 && (
          <div>
            <div className="flex items-center mb-3">
              <h3 className="text-sm font-medium text-green-400">Resolved Conflicts</h3>
              <span className="ml-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                {diff.resolvedConflicts.length}
              </span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {diff.resolvedConflicts.map((conflict, idx) => (
                <div key={idx} className="bg-gray-750 border border-green-600/20 rounded p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-green-400 font-medium text-sm">{conflict.packageName}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Conflict resolved
                      </div>
                    </div>
                    <div className="text-xs">
                      <span className="bg-green-600/20 text-green-400 px-2 py-1 rounded text-xs">
                        RESOLVED
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Previous {conflict.severity} with {conflict.constraints.length} constraint{conflict.constraints.length !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Empty state for when diff exists but has no changes in specific categories */}
      {totalChanges === 0 && conflictChanges === 0 && (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">No significant changes detected</div>
          <div className="text-xs text-gray-500">
            The dependency graph structure remains the same.
          </div>
        </div>
      )}
    </div>
  )
}

export default DiffPanel