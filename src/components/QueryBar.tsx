'use client'

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import type { DependencyGraph, QueryResult, QueryType } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  projectDir: string
  onNodeSelect: (id: string | null) => void
}

interface QueryTypeOption {
  id: QueryType
  label: string
  description: string
  inputTemplate: string
  placeholder: string
}

interface QueryHistory {
  query: string
  type: QueryType
  timestamp: number
  result: QueryResult | null
}

const QueryBar: React.FC<Props> = ({ graph, projectDir, onNodeSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedQueryType, setSelectedQueryType] = useState<QueryType>('transitive')
  const [queryInput, setQueryInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryHistory, setQueryHistory] = useState<QueryHistory[]>([])
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<HTMLDivElement>(null)

  const queryTypes: QueryTypeOption[] = [
    {
      id: 'transitive',
      label: 'Transitive',
      description: 'Check if package A depends on package B',
      inputTemplate: 'from:packageA to:packageB',
      placeholder: 'from:react to:lodash'
    },
    {
      id: 'reverse',
      label: 'Reverse Dependencies',
      description: 'Find all packages that depend on a given package',
      inputTemplate: 'package:name',
      placeholder: 'package:react'
    },
    {
      id: 'license_filter',
      label: 'License Filter',
      description: 'Find all packages with a specific license',
      inputTemplate: 'license:name',
      placeholder: 'license:MIT'
    }
  ]

  // Get all package names for autocomplete
  const packageNames = useMemo(() => {
    return Object.values(graph.nodes)
      .filter(node => !node.isRoot)
      .map(node => node.name)
      .sort()
  }, [graph.nodes])

  // Get all unique licenses for autocomplete
  const licenses = useMemo(() => {
    const licenseSet = new Set(Object.values(graph.nodes).map(node => node.license))
    return Array.from(licenseSet).filter(license => license !== 'UNKNOWN').sort()
  }, [graph.nodes])

  // Parse query input based on type
  const parseQuery = useCallback((input: string, type: QueryType) => {
    const trimmedInput = input.trim()

    switch (type) {
      case 'transitive': {
        const fromMatch = trimmedInput.match(/from:([^\s]+)/)
        const toMatch = trimmedInput.match(/to:([^\s]+)/)
        if (!fromMatch || !toMatch) {
          throw new Error('Transitive query requires "from:packageA to:packageB" format')
        }
        return { from: fromMatch[1], to: toMatch[1] }
      }

      case 'reverse': {
        const packageMatch = trimmedInput.match(/package:([^\s]+)/) || trimmedInput.match(/^([^\s]+)$/)
        if (!packageMatch) {
          throw new Error('Reverse query requires "package:name" format or just the package name')
        }
        return { nodeId: packageMatch[1] }
      }

      case 'license_filter': {
        const licenseMatch = trimmedInput.match(/license:([^\s]+)/) || trimmedInput.match(/^([^\s]+)$/)
        if (!licenseMatch) {
          throw new Error('License filter requires "license:name" format or just the license name')
        }
        return { license: licenseMatch[1] }
      }

      default:
        throw new Error('Unknown query type')
    }
  }, [])

  // Get autocomplete suggestions
  const getAutocompleteSuggestions = useCallback((input: string, type: QueryType) => {
    const lowerInput = input.toLowerCase()

    switch (type) {
      case 'transitive': {
        const fromMatch = input.match(/from:([^\s]*)/)
        const toMatch = input.match(/to:([^\s]*)/)

        if (fromMatch && !toMatch) {
          const partial = fromMatch[1].toLowerCase()
          return packageNames
            .filter(name => name.toLowerCase().includes(partial))
            .slice(0, 8)
            .map(name => input.replace(/from:[^\s]*/, `from:${name}`))
        }

        if (toMatch) {
          const partial = toMatch[1].toLowerCase()
          return packageNames
            .filter(name => name.toLowerCase().includes(partial))
            .slice(0, 8)
            .map(name => input.replace(/to:[^\s]*/, `to:${name}`))
        }

        return packageNames
          .filter(name => name.toLowerCase().includes(lowerInput))
          .slice(0, 8)
          .map(name => `from:${name} to:`)
      }

      case 'reverse': {
        const packageMatch = input.match(/package:([^\s]*)/)
        const partial = (packageMatch ? packageMatch[1] : input).toLowerCase()

        return packageNames
          .filter(name => name.toLowerCase().includes(partial))
          .slice(0, 8)
          .map(name => packageMatch ? input.replace(/package:[^\s]*/, `package:${name}`) : name)
      }

      case 'license_filter': {
        const licenseMatch = input.match(/license:([^\s]*)/)
        const partial = (licenseMatch ? licenseMatch[1] : input).toLowerCase()

        return licenses
          .filter(license => license.toLowerCase().includes(partial))
          .slice(0, 8)
          .map(license => licenseMatch ? input.replace(/license:[^\s]*/, `license:${license}`) : license)
      }

      default:
        return []
    }
  }, [packageNames, licenses])

  // Handle query execution
  const executeQuery = useCallback(async () => {
    if (!queryInput.trim()) return

    setIsLoading(true)
    setQueryError(null)

    try {
      const parsedQuery = parseQuery(queryInput, selectedQueryType)

      // Build query string
      const params = new URLSearchParams()
      params.set('dir', projectDir)
      params.set('type', selectedQueryType)

      // Add query-specific parameters
      Object.entries(parsedQuery).forEach(([key, value]) => {
        if (value !== undefined) {
          params.set(key, String(value))
        }
      })

      const response = await fetch(`/api/query?${params.toString()}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const result: QueryResult = await response.json()

      setQueryResult(result)

      // Add to history
      const historyEntry: QueryHistory = {
        query: queryInput,
        type: selectedQueryType,
        timestamp: Date.now(),
        result
      }

      setQueryHistory(prev => [historyEntry, ...prev.slice(0, 9)]) // Keep last 10 queries

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setQueryError(errorMessage)
      setQueryResult(null)
    } finally {
      setIsLoading(false)
    }
  }, [queryInput, selectedQueryType, projectDir, parseQuery])

  // Handle input changes and autocomplete
  const handleInputChange = useCallback((value: string) => {
    setQueryInput(value)
    setSelectedSuggestionIndex(-1)

    if (value.trim().length > 0) {
      setShowAutocomplete(true)
    } else {
      setShowAutocomplete(false)
    }
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const suggestions = getAutocompleteSuggestions(queryInput, selectedQueryType)

    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        setQueryInput(suggestions[selectedSuggestionIndex])
        setShowAutocomplete(false)
        setSelectedSuggestionIndex(-1)
      } else {
        executeQuery()
        setShowAutocomplete(false)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedSuggestionIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false)
      setSelectedSuggestionIndex(-1)
    }
  }, [queryInput, selectedQueryType, selectedSuggestionIndex, executeQuery, getAutocompleteSuggestions])

  // Handle clicking on autocomplete suggestion
  const handleSuggestionClick = useCallback((suggestion: string) => {
    setQueryInput(suggestion)
    setShowAutocomplete(false)
    setSelectedSuggestionIndex(-1)
    inputRef.current?.focus()
  }, [])

  // Handle history item click
  const handleHistoryClick = useCallback((historyItem: QueryHistory) => {
    setSelectedQueryType(historyItem.type)
    setQueryInput(historyItem.query)
    setQueryResult(historyItem.result)
    setQueryError(null)
  }, [])

  // Handle result item click for node selection
  const handleResultClick = useCallback((nodeId: string) => {
    if (graph.nodes[nodeId]) {
      onNodeSelect(nodeId)
    }
  }, [graph.nodes, onNodeSelect])

  // Format query results
  const formatQueryResult = useCallback((result: QueryResult) => {
    switch (result.type) {
      case 'transitive':
        return result.result ? 'Yes, dependency exists' : 'No, no dependency found'

      case 'reverse':
        if (Array.isArray(result.result)) {
          return result.result.length === 0 ? 'No dependents found' : `${result.result.length} dependents`
        }
        return 'No dependents found'

      case 'license_filter':
        if (Array.isArray(result.result)) {
          return result.result.length === 0 ? 'No packages found' : `${result.result.length} packages`
        }
        return 'No packages found'

      default:
        return 'Unknown result'
    }
  }, [])

  // Get autocomplete suggestions for current input
  const currentSuggestions = useMemo(() => {
    if (!showAutocomplete || !queryInput.trim()) return []
    return getAutocompleteSuggestions(queryInput, selectedQueryType)
  }, [showAutocomplete, queryInput, selectedQueryType, getAutocompleteSuggestions])

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowAutocomplete(false)
        setSelectedSuggestionIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedQueryTypeOption = queryTypes.find(qt => qt.id === selectedQueryType)!

  if (!isExpanded) {
    // Collapsed state - just input bar
    return (
      <div className="h-16 bg-gray-800 border-t border-gray-700 p-4">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              placeholder={`Query dependencies: ${selectedQueryTypeOption.placeholder}`}
              value={queryInput}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsExpanded(true)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />

            {/* Autocomplete dropdown */}
            {showAutocomplete && currentSuggestions.length > 0 && (
              <div
                ref={autocompleteRef}
                className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
              >
                {currentSuggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                      index === selectedSuggestionIndex
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-700'
                    }`}
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={executeQuery}
            disabled={isLoading || !queryInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                <span>Querying...</span>
              </>
            ) : (
              <span>Query</span>
            )}
          </button>

          <button
            onClick={() => setIsExpanded(true)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Expand query interface"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // Expanded state - full interface
  return (
    <div className="bg-gray-800 border-t border-gray-700">
      {/* Header with collapse button */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">Dependency Query</h3>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 text-gray-400 hover:text-white transition-colors"
          title="Collapse query interface"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <div className="flex">
        {/* Left panel - Query interface */}
        <div className="flex-1 p-4">
          {/* Query type selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Query Type</label>
            <div className="grid grid-cols-3 gap-2">
              {queryTypes.map(queryType => (
                <button
                  key={queryType.id}
                  onClick={() => {
                    setSelectedQueryType(queryType.id)
                    setQueryInput('')
                    setQueryResult(null)
                    setQueryError(null)
                  }}
                  className={`p-3 text-left rounded border transition-colors ${
                    selectedQueryType === queryType.id
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-900 border-gray-600 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium text-sm">{queryType.label}</div>
                  <div className="text-xs mt-1 opacity-75">{queryType.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Query input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Query</label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder={selectedQueryTypeOption.placeholder}
                value={queryInput}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />

              {/* Autocomplete dropdown */}
              {showAutocomplete && currentSuggestions.length > 0 && (
                <div
                  ref={autocompleteRef}
                  className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
                >
                  {currentSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                        index === selectedSuggestionIndex
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Template: {selectedQueryTypeOption.inputTemplate}
            </div>
          </div>

          {/* Execute button */}
          <div className="mb-4">
            <button
              onClick={executeQuery}
              disabled={isLoading || !queryInput.trim()}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                  <span>Executing Query...</span>
                </>
              ) : (
                <span>Execute Query</span>
              )}
            </button>
          </div>

          {/* Query results */}
          {(queryResult || queryError) && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Results</h4>
              {queryError ? (
                <div className="bg-red-900/20 border border-red-600 rounded p-3">
                  <div className="text-red-400 font-medium text-sm">Error</div>
                  <div className="text-red-300 text-sm mt-1">{queryError}</div>
                </div>
              ) : queryResult && (
                <div className="bg-gray-900 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-green-400 font-medium text-sm">
                      {formatQueryResult(queryResult)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {queryResult.latencyMs}ms
                      {queryResult.method && ` (${queryResult.method})`}
                    </div>
                  </div>

                  {/* Detailed results */}
                  {Array.isArray(queryResult.result) && queryResult.result.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {queryResult.result.map((nodeId, index) => {
                        const node = graph.nodes[nodeId]
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700 transition-colors"
                            onClick={() => handleResultClick(nodeId)}
                          >
                            <div className="flex items-center space-x-2">
                              <span className="text-gray-300 text-sm font-mono">
                                {node?.name || nodeId}
                              </span>
                              {node && (
                                <span className="text-xs text-gray-500">
                                  ({node.ecosystem})
                                </span>
                              )}
                            </div>
                            {node && (
                              <span className="text-xs text-gray-400">
                                {node.resolvedVersion}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel - Query history */}
        {queryHistory.length > 0 && (
          <div className="w-80 border-l border-gray-700 p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Query History</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {queryHistory.map((historyItem, index) => (
                <div
                  key={index}
                  className="bg-gray-900 rounded p-3 cursor-pointer hover:bg-gray-700 transition-colors"
                  onClick={() => handleHistoryClick(historyItem)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-blue-400 font-medium capitalize">
                      {historyItem.type}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(historyItem.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-300 font-mono truncate">
                    {historyItem.query}
                  </div>
                  {historyItem.result && (
                    <div className="text-xs text-gray-400 mt-1">
                      {formatQueryResult(historyItem.result)}
                      {historyItem.result.latencyMs && (
                        <span className="ml-2">({historyItem.result.latencyMs}ms)</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default QueryBar