'use client'

import React, { useRef, useEffect, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import type { DependencyGraph, PackageNode, DependencyEdge, SCCCluster } from '@/engine/types'

interface Props {
  graph: DependencyGraph
  selectedNodeId: string | null
  filterType: string
  searchTerm: string
  onNodeSelect: (id: string | null) => void
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string
  node: PackageNode
  radius: number
  color: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  id: string
  edge: DependencyEdge
  source: D3Node
  target: D3Node
}

const GraphCanvas: React.FC<Props> = ({
  graph,
  selectedNodeId,
  filterType,
  searchTerm,
  onNodeSelect
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<D3Node, D3Link> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  // Color mapping for different node types
  const getNodeColor = useCallback((node: PackageNode): string => {
    if (node.isRoot) return '#22c55e' // green-500
    if (node.hasVersionConflict) return '#ef4444' // red-500
    if (node.sccId !== -1 && graph.metadata.sccClusters.some(scc =>
      scc.members.includes(node.id) && scc.members.length > 1
    )) return '#f97316' // orange-500
    if (node.isGhostDependency) return '#eab308' // yellow-500
    if (node.hasLicenseConflict) return '#a855f7' // purple-500
    return '#64748b' // slate-500 (default)
  }, [graph.metadata.sccClusters])

  // Calculate node radius based on reverse dependency count
  const getNodeRadius = useCallback((nodeId: string): number => {
    const reverseDeps = graph.reverseAdjacency[nodeId]?.length || 0
    const baseRadius = 8
    const maxRadius = 24
    const scaleFactor = Math.min(reverseDeps / 5, 3)
    return Math.min(baseRadius + scaleFactor * 4, maxRadius)
  }, [graph.reverseAdjacency])

  // Filter nodes based on current filter type and search term
  const filteredData = useMemo(() => {
    const allNodes = Object.values(graph.nodes)
    const allEdges = graph.edges

    let visibleNodes = allNodes.filter(node => {
      // Apply search filter
      if (searchTerm && !node.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }

      // Apply type filter
      switch (filterType) {
        case 'direct':
          return node.isRoot || graph.edges.some(edge =>
            edge.from === graph.rootId && edge.to === node.id && edge.type === 'direct'
          )
        case 'dev':
          return node.isRoot || graph.edges.some(edge => edge.to === node.id && edge.type === 'dev')
        case 'conflicts':
          return node.hasVersionConflict || node.hasLicenseConflict || node.isGhostDependency
        case 'circular':
          return node.sccId !== -1 && graph.metadata.sccClusters.some(scc =>
            scc.members.includes(node.id) && scc.members.length > 1
          )
        default: // 'all'
          return true
      }
    })

    const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
    const visibleEdges = allEdges.filter(edge =>
      visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
    )

    return { nodes: visibleNodes, edges: visibleEdges }
  }, [graph, filterType, searchTerm])

  // Transform data for D3
  const d3Data = useMemo(() => {
    const nodes: D3Node[] = filteredData.nodes.map(node => ({
      id: node.id,
      node,
      radius: getNodeRadius(node.id),
      color: getNodeColor(node)
    }))

    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const links: D3Link[] = filteredData.edges
      .map(edge => {
        const source = nodeMap.get(edge.from)
        const target = nodeMap.get(edge.to)
        if (!source || !target) return null

        return {
          id: `${edge.from}-${edge.to}`,
          edge,
          source,
          target
        }
      })
      .filter((link): link is D3Link => link !== null)

    return { nodes, links }
  }, [filteredData, getNodeRadius, getNodeColor])

  // Get SCC hulls for visible nodes
  const sccHulls = useMemo(() => {
    const visibleNodeIds = new Set(d3Data.nodes.map(n => n.id))
    return graph.metadata.sccClusters
      .filter(scc => scc.members.length > 1)
      .map(scc => ({
        ...scc,
        visibleMembers: scc.members.filter(id => visibleNodeIds.has(id))
      }))
      .filter(scc => scc.visibleMembers.length > 1)
  }, [graph.metadata.sccClusters, d3Data.nodes])

  // Initialize and update D3 visualization
  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    // Clear previous content
    svg.selectAll('*').remove()

    // Create main container
    const container = svg.append('g').attr('class', 'zoom-container')

    // Setup zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform)
      })

    svg.call(zoom)
    zoomRef.current = zoom

    // Create arrow markers for directed edges
    const defs = svg.append('defs')

    const markerTypes = [
      { id: 'arrow-direct', color: '#64748b' },
      { id: 'arrow-dev', color: '#94a3b8' },
      { id: 'arrow-peer', color: '#cbd5e1' },
      { id: 'arrow-conflict', color: '#ef4444' }
    ]

    markerTypes.forEach(({ id, color }) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 15)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color)
    })

    // Create SCC hull backgrounds
    const hullContainer = container.append('g').attr('class', 'hulls')

    // Create links container
    const linkContainer = container.append('g').attr('class', 'links')

    // Create nodes container
    const nodeContainer = container.append('g').attr('class', 'nodes')

    // Create labels container
    const labelContainer = container.append('g').attr('class', 'labels')

    // Initialize force simulation
    const simulation = d3.forceSimulation<D3Node>(d3Data.nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(d3Data.links)
        .id(d => d.id)
        .distance(80)
        .strength(0.3)
      )
      .force('charge', d3.forceManyBody()
        .strength(-200)
        .distanceMax(300)
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<D3Node>()
        .radius(d => d.radius + 2)
        .strength(0.7)
      )
      .alphaDecay(0.02)
      .velocityDecay(0.3)

    simulationRef.current = simulation

    // Create link elements
    const links = linkContainer.selectAll('.link')
      .data(d3Data.links)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', d => {
        if (d.edge.isConflicting) return '#ef4444'
        switch (d.edge.type) {
          case 'dev': return '#94a3b8'
          case 'peer': return '#cbd5e1'
          default: return '#64748b'
        }
      })
      .attr('stroke-width', d => d.edge.isConflicting ? 2 : 1)
      .attr('stroke-dasharray', d => d.edge.type === 'dev' ? '3,3' : null)
      .attr('marker-end', d => {
        if (d.edge.isConflicting) return 'url(#arrow-conflict)'
        switch (d.edge.type) {
          case 'dev': return 'url(#arrow-dev)'
          case 'peer': return 'url(#arrow-peer)'
          default: return 'url(#arrow-direct)'
        }
      })
      .attr('opacity', 0.6)

    // Create node elements
    const nodes = nodeContainer.selectAll('.node')
      .data(d3Data.nodes)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('r', d => d.radius)
      .attr('fill', d => d.color)
      .attr('stroke', d => selectedNodeId === d.id ? '#3b82f6' : '#374151')
      .attr('stroke-width', d => selectedNodeId === d.id ? 3 : 1)
      .style('cursor', 'pointer')

    // Create node labels
    const labels = labelContainer.selectAll('.label')
      .data(d3Data.nodes.filter(d => d.node.isRoot || d.radius > 12))
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .attr('font-family', 'system-ui, sans-serif')
      .attr('fill', '#e5e7eb')
      .attr('pointer-events', 'none')
      .text(d => d.node.name.length > 12 ? d.node.name.substring(0, 12) + '...' : d.node.name)

    // Add drag behavior
    const drag = d3.drag<SVGCircleElement, D3Node>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    nodes.call(drag)

    // Add click behavior
    nodes.on('click', (event, d) => {
      event.stopPropagation()
      onNodeSelect(selectedNodeId === d.id ? null : d.id)
    })

    // Click on background to deselect
    svg.on('click', () => {
      onNodeSelect(null)
    })

    // Update SCC hulls
    const updateHulls = () => {
      const hullData = sccHulls.map(scc => {
        const points = scc.visibleMembers
          .map(id => d3Data.nodes.find(n => n.id === id))
          .filter((n): n is D3Node => n !== undefined && n.x !== undefined && n.y !== undefined)
          .map(n => [n.x!, n.y!] as [number, number])

        if (points.length < 3) return null

        const hull = d3.polygonHull(points)
        return hull ? { scc, hull } : null
      }).filter((h): h is { scc: SCCCluster & { visibleMembers: string[] }, hull: [number, number][] } => h !== null)

      hullContainer.selectAll('.hull')
        .data(hullData)
        .join('path')
        .attr('class', 'hull')
        .attr('d', d => {
          // Expand hull by padding
          const centroid = d3.polygonCentroid(d.hull)
          const expandedHull = d.hull.map(point => {
            const dx = point[0] - centroid[0]
            const dy = point[1] - centroid[1]
            const distance = Math.sqrt(dx * dx + dy * dy)
            const padding = 20
            const scale = (distance + padding) / distance
            return [
              centroid[0] + dx * scale,
              centroid[1] + dy * scale
            ] as [number, number]
          })
          return d3.line()(expandedHull.concat([expandedHull[0]])) || ''
        })
        .attr('fill', '#f97316')
        .attr('fill-opacity', 0.1)
        .attr('stroke', '#f97316')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,5')
    }

    // Simulation tick function
    simulation.on('tick', () => {
      links
        .attr('x1', d => (d.source as D3Node).x || 0)
        .attr('y1', d => (d.source as D3Node).y || 0)
        .attr('x2', d => (d.target as D3Node).x || 0)
        .attr('y2', d => (d.target as D3Node).y || 0)

      nodes
        .attr('cx', d => d.x || 0)
        .attr('cy', d => d.y || 0)

      labels
        .attr('x', d => d.x || 0)
        .attr('y', d => d.y || 0)

      updateHulls()
    })

    // Cleanup function
    return () => {
      simulation.stop()
    }
  }, [d3Data, sccHulls, selectedNodeId, onNodeSelect])

  // Update node selection styling
  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('.node')
      .attr('stroke', (d: any) => selectedNodeId === d.id ? '#3b82f6' : '#374151')
      .attr('stroke-width', (d: any) => selectedNodeId === d.id ? 3 : 1)
  }, [selectedNodeId])

  // Fit to view function
  const fitToView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current || d3Data.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    // Calculate bounds of all nodes
    const xExtent = d3.extent(d3Data.nodes, d => d.x || 0) as [number, number]
    const yExtent = d3.extent(d3Data.nodes, d => d.y || 0) as [number, number]

    const padding = 50
    const dx = xExtent[1] - xExtent[0] + padding * 2
    const dy = yExtent[1] - yExtent[0] + padding * 2

    const scale = Math.min(width / dx, height / dy, 2)
    const centerX = (xExtent[0] + xExtent[1]) / 2
    const centerY = (yExtent[0] + yExtent[1]) / 2

    const transform = d3.zoomIdentity
      .translate(width / 2 - centerX * scale, height / 2 - centerY * scale)
      .scale(scale)

    svg.transition()
      .duration(750)
      .call(zoomRef.current.transform, transform)
  }, [d3Data.nodes])

  // Expose fit to view function
  useEffect(() => {
    const timer = setTimeout(() => {
      if (d3Data.nodes.length > 0) {
        fitToView()
      }
    }, 1000) // Allow simulation to settle

    return () => clearTimeout(timer)
  }, [d3Data.nodes.length, fitToView])

  return (
    <div className="flex-1 relative bg-surface border border-border rounded-lg m-4 overflow-hidden">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col space-y-2">
        <button
          onClick={fitToView}
          className="px-3 py-2 bg-panel border border-border rounded text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          title="Fit to view"
        >
          Fit
        </button>
        <button
          onClick={() => {
            if (simulationRef.current) {
              simulationRef.current.alpha(0.3).restart()
            }
          }}
          className="px-3 py-2 bg-panel border border-border rounded text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          title="Restart simulation"
        >
          Reset
        </button>
      </div>

      {/* Graph info */}
      <div className="absolute top-4 left-4 z-10 bg-panel border border-border rounded px-3 py-2">
        <div className="text-sm text-gray-300">
          <span className="font-medium">{d3Data.nodes.length}</span> nodes,{' '}
          <span className="font-medium">{d3Data.links.length}</span> edges
        </div>
        {sccHulls.length > 0 && (
          <div className="text-xs text-orange-400 mt-1">
            {sccHulls.length} circular dependencies
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ background: 'transparent' }}
      />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-panel border border-border rounded p-3">
        <div className="text-sm font-medium text-gray-300 mb-2">Legend</div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-gray-400">Root package</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-gray-400">Version conflict</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span className="text-gray-400">Circular dependency</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-gray-400">Ghost dependency</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <span className="text-gray-400">License conflict</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GraphCanvas