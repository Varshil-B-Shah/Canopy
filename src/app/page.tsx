'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { DependencyGraph, DependencyDiff } from '@/engine/types'

interface ScanState {
  status: 'idle' | 'scanning' | 'done' | 'error'
  graph: DependencyGraph | null
  diff: DependencyDiff | null
  error: string | null
  scanTimeMs: number
  fromCache: boolean
}

// Placeholder component for GraphCanvas
const GraphCanvasPlaceholder = ({ graph }: { graph: DependencyGraph }) => (
  <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-8 m-4">
    <h3 className="text-lg font-semibold text-gray-300 mb-4">Dependency Graph</h3>
    <div className="text-sm text-gray-400">
      <p>Nodes: {Object.keys(graph.nodes).length}</p>
      <p>Edges: {graph.edges.length}</p>
      <p>Root: {graph.rootId}</p>
      <p className="mt-4 text-xs">Graph visualization will be implemented here</p>
    </div>
  </div>
)

// Placeholder component for Sidebar
const SidebarPlaceholder = ({ graph }: { graph: DependencyGraph | null }) => (
  <div className="w-80 bg-gray-800 border-r border-gray-700 p-4">
    <h3 className="text-lg font-semibold text-gray-300 mb-4">Analysis</h3>
    {graph ? (
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Metadata</h4>
          <div className="text-xs text-gray-500 space-y-1">
            <p>Ecosystems: {graph.metadata.ecosystems.join(', ')}</p>
            <p>Total Packages: {graph.metadata.totalPackages}</p>
            <p>Max Depth: {graph.metadata.maxDepth}</p>
            <p>SCC Clusters: {graph.metadata.sccClusters.length}</p>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-red-400 mb-2">Issues</h4>
          <div className="text-xs text-gray-500 space-y-1">
            <p>Version Conflicts: {graph.metadata.versionConflicts.length}</p>
            <p>Ghost Dependencies: {graph.metadata.ghostDependencies.length}</p>
            <p>License Conflicts: {graph.metadata.licenseConflicts.length}</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-4">Detailed sidebar will be implemented here</p>
      </div>
    ) : (
      <p className="text-sm text-gray-500">No graph data available</p>
    )}
  </div>
)

// Placeholder component for FilterBar
const FilterBarPlaceholder = () => (
  <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4">
    <div className="flex space-x-4 text-sm text-gray-400">
      <span>Filters:</span>
      <button className="text-blue-400 hover:text-blue-300">All</button>
      <button className="text-gray-500 hover:text-gray-400">Direct</button>
      <button className="text-gray-500 hover:text-gray-400">Dev</button>
      <button className="text-gray-500 hover:text-gray-400">Conflicts</button>
    </div>
    <div className="ml-auto text-xs text-gray-600">
      Filter controls will be implemented here
    </div>
  </div>
)

// Placeholder component for QueryBar
const QueryBarPlaceholder = ({ graph }: { graph: DependencyGraph | null }) => (
  <div className="h-16 bg-gray-800 border-t border-gray-700 p-4">
    <div className="flex items-center space-x-4">
      <input
        type="text"
        placeholder="Query dependencies (e.g., transitive:react, reverse:lodash)"
        className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-300 placeholder-gray-500"
        disabled={!graph}
      />
      <button
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
        disabled={!graph}
      >
        Query
      </button>
      <span className="text-xs text-gray-600">Query interface will be implemented here</span>
    </div>
  </div>
)

export default function HomePage() {
  return (
    <Suspense fallback={<HomePageFallback />}>
      <HomePageContent />
    </Suspense>
  )
}

// Fallback component while Suspense is loading
function HomePageFallback() {
  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <div className="h-16 bg-gray-900 border-b border-gray-700 flex items-center px-6">
        <h1 className="text-xl font-bold text-white">Canopy</h1>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading...</p>
        </div>
      </div>
    </div>
  )
}

// Main component that uses useSearchParams
function HomePageContent() {
  const [state, setState] = useState<ScanState>({
    status: 'idle',
    graph: null,
    diff: null,
    error: null,
    scanTimeMs: 0,
    fromCache: false,
  })

  const [projectDir, setProjectDir] = useState('')
  const [isScanning, setIsScanning] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()

  // Parse URL parameters for auto-scanning
  useEffect(() => {
    const dirParam = searchParams.get('dir')
    const autoScan = searchParams.get('autoScan') === 'true'

    if (dirParam) {
      setProjectDir(dirParam)
      if (autoScan) {
        handleScan(dirParam, false)
      }
    }
  }, [searchParams])

  const handleScan = useCallback(async (directory: string, force: boolean = false) => {
    if (!directory.trim()) {
      setState(prev => ({ ...prev, status: 'error', error: 'Please enter a project directory' }))
      return
    }

    setIsScanning(true)
    setState(prev => ({
      ...prev,
      status: 'scanning',
      error: null,
      scanTimeMs: 0,
      fromCache: false
    }))

    try {
      const startTime = Date.now()
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectDir: directory, force }),
      })

      const endTime = Date.now()
      const clientScanTime = endTime - startTime

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()

      setState({
        status: 'done',
        graph: data.graph,
        diff: data.diff,
        error: null,
        scanTimeMs: data.scanTimeMs || clientScanTime,
        fromCache: data.fromCache || false,
      })

      // Update URL with project directory (without auto-scan to avoid re-triggering)
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.set('dir', directory)
      newUrl.searchParams.delete('autoScan')
      router.replace(newUrl.pathname + newUrl.search)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }))
    } finally {
      setIsScanning(false)
    }
  }, [router])

  const handleReset = () => {
    setState({
      status: 'idle',
      graph: null,
      diff: null,
      error: null,
      scanTimeMs: 0,
      fromCache: false,
    })
    setProjectDir('')

    // Clear URL parameters
    router.replace('/')
  }

  const formatScanTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const renderTopBar = () => (
    <div className="h-16 bg-gray-900 border-b border-gray-700 flex items-center px-6">
      <div className="flex items-center space-x-4 flex-1">
        <h1 className="text-xl font-bold text-white">Canopy</h1>
        <div className="flex items-center space-x-2 flex-1 max-w-2xl">
          <input
            type="text"
            value={projectDir}
            onChange={(e) => setProjectDir(e.target.value)}
            placeholder="Enter project directory path..."
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            disabled={isScanning}
            onKeyPress={(e) => e.key === 'Enter' && !isScanning && handleScan(projectDir)}
          />
          <button
            onClick={() => handleScan(projectDir)}
            disabled={isScanning || !projectDir.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                <span>Scanning...</span>
              </>
            ) : (
              <span>Scan</span>
            )}
          </button>
          {state.status !== 'idle' && (
            <button
              onClick={handleReset}
              className="px-3 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {state.status === 'done' && (
        <div className="flex items-center space-x-4 text-sm text-gray-400">
          <span>Scan time: {formatScanTime(state.scanTimeMs)}</span>
          {state.fromCache && <span className="text-green-400">From cache</span>}
          <button
            onClick={() => handleScan(projectDir, true)}
            className="text-blue-400 hover:text-blue-300 text-xs"
            title="Force rescan (ignore cache)"
          >
            Force rescan
          </button>
        </div>
      )}
    </div>
  )

  const renderContent = () => {
    switch (state.status) {
      case 'idle':
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-semibold text-gray-300">
                Welcome to Canopy
              </h2>
              <p className="text-gray-500 max-w-md">
                A polyglot dependency graph analyzer that helps you understand your project's dependencies,
                detect conflicts, and visualize the complete dependency tree.
              </p>
              <div className="mt-8 space-y-2 text-sm text-gray-600">
                <p>Supported ecosystems: npm, pip, go modules, cargo</p>
                <p>Features: conflict detection, ghost dependencies, license analysis</p>
              </div>
            </div>
          </div>
        )

      case 'scanning':
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-12 h-12 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
              <h2 className="text-xl font-semibold text-gray-300">
                Analyzing Dependencies
              </h2>
              <p className="text-gray-500">
                Parsing manifests, resolving versions, and building the dependency graph...
              </p>
            </div>
          </div>
        )

      case 'error':
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-red-400">Scan Failed</h2>
              <p className="text-gray-400 break-words">{state.error}</p>
              <button
                onClick={() => handleScan(projectDir, true)}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Retry Scan
              </button>
            </div>
          </div>
        )

      case 'done':
        if (!state.graph) {
          return (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-500">No graph data received</p>
              </div>
            </div>
          )
        }

        return (
          <div className="flex-1 flex flex-col">
            <FilterBarPlaceholder />
            <div className="flex-1 flex">
              <SidebarPlaceholder graph={state.graph} />
              <GraphCanvasPlaceholder graph={state.graph} />
            </div>
            <QueryBarPlaceholder graph={state.graph} />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {renderTopBar()}
      {renderContent()}
    </div>
  )
}