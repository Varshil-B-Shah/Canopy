// Example of how to integrate DiffPanel into the existing Sidebar or as a standalone component

import DiffPanel from '@/components/DiffPanel'
import type { DependencyDiff, DependencyGraph } from '@/engine/types'

// Example usage in a parent component
const ExampleIntegration = () => {
  // These would come from your application state
  const graph: DependencyGraph | null = null // Replace with actual graph data

  const diff: DependencyDiff | null = null // Replace with actual diff data from API

  const handleNodeSelect = (nodeId: string) => {
    console.log('Selected node:', nodeId)
    // Handle node selection - highlight in graph, show in sidebar, etc.
  }

  return (
    <div className="container mx-auto p-4">
      {diff && graph && (
        <DiffPanel
          diff={diff}
          graph={graph}
          onNodeSelect={handleNodeSelect}
        />
      )}
    </div>
  )
}

// Integration into existing Sidebar component (alternative)
// You could add this as another tab in the existing Sidebar by modifying the renderDiffTab() method
// to use the new DiffPanel component instead of the current implementation:
//
// const renderDiffTab = () => {
//   return (
//     <DiffPanel
//       diff={diff}
//       graph={graph}
//       onNodeSelect={onNodeSelect}
//     />
//   )
// }

export default ExampleIntegration