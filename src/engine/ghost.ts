import fs from 'fs'
import path from 'path'
import type { DependencyGraph, GhostDependency } from './types'

// Node.js built-in modules — these are never ghost dependencies
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'http2', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url',
  'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
])

// Extracts all imported package names from a JavaScript/TypeScript source file
// using regex (no full AST needed for this use case)
function extractJSImports(fileContent: string): string[] {
  const imports = new Set<string>()

  // ES module imports: import X from 'package' or import 'package'
  const esImportRegex = /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"./][^'"]*)['"]/g
  let match: RegExpExecArray | null
  while ((match = esImportRegex.exec(fileContent)) !== null) {
    imports.add(extractPackageName(match[1]))
  }

  // CommonJS requires: require('package')
  const requireRegex = /require\(['"]([^'"./][^'"]*)['"]\)/g
  while ((match = requireRegex.exec(fileContent)) !== null) {
    imports.add(extractPackageName(match[1]))
  }

  // Dynamic imports: import('package')
  const dynamicImportRegex = /import\(['"]([^'"./][^'"]*)['"]\)/g
  while ((match = dynamicImportRegex.exec(fileContent)) !== null) {
    imports.add(extractPackageName(match[1]))
  }

  return [...imports].filter(
    name => name && !NODE_BUILTINS.has(name) && !name.startsWith('@types/'),
  )
}

// Extracts all imported package names from a Python source file
function extractPythonImports(fileContent: string): string[] {
  const imports = new Set<string>()

  // import package or import package.submodule
  const importRegex = /^import\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gm
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(fileContent)) !== null) {
    imports.add(match[1].split('.')[0])
  }

  // from package import ... (only first segment = package name)
  const fromImportRegex = /^from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import/gm
  while ((match = fromImportRegex.exec(fileContent)) !== null) {
    const pkg = match[1].split('.')[0]
    if (!pkg.startsWith('.')) imports.add(pkg)
  }

  // Normalize common Python package name differences (e.g. PIL → Pillow)
  const pythonNameMap: Record<string, string> = {
    PIL: 'Pillow',
    cv2: 'opencv-python',
    sklearn: 'scikit-learn',
    bs4: 'beautifulsoup4',
    yaml: 'PyYAML',
  }

  return [...imports].map(name => pythonNameMap[name] ?? name)
}

// Extracts all imported package names from a Go source file
function extractGoImports(fileContent: string): string[] {
  const imports = new Set<string>()

  // Single import: import "github.com/some/package"
  const singleImportRegex = /import\s+"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = singleImportRegex.exec(fileContent)) !== null) {
    imports.add(match[1])
  }

  // Grouped imports: import ( "pkg1" "pkg2" )
  const groupImportRegex = /import\s+\(([\s\S]*?)\)/g
  while ((match = groupImportRegex.exec(fileContent)) !== null) {
    const block = match[1]
    const innerRegex = /"([^"]+)"/g
    let inner: RegExpExecArray | null
    while ((inner = innerRegex.exec(block)) !== null) {
      imports.add(inner[1])
    }
  }

  // Filter out standard library (no dot in first path segment)
  return [...imports].filter(pkg => {
    const firstSegment = pkg.split('/')[0]
    return firstSegment.includes('.') // e.g. github.com, golang.org/x
  })
}

// Normalizes a scoped or sub-path import to the root package name
// "@org/package/subpath" → "@org/package"
// "package/utils" → "package"
function extractPackageName(importPath: string): string {
  if (importPath.startsWith('@')) {
    // Scoped package: keep @org/name, drop subpath
    const parts = importPath.split('/')
    return parts.slice(0, 2).join('/')
  }
  // Regular package: take first path segment
  return importPath.split('/')[0]
}

// Recursively collects all source files of given extensions from a directory
function collectSourceFiles(
  dir: string,
  extensions: string[],
  excludeDirs: string[] = ['node_modules', '.git', '.next', 'dist', 'build'],
): string[] {
  const files: string[] = []

  if (!fs.existsSync(dir)) return files

  function walk(currentDir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          walk(fullPath)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name)
        if (extensions.includes(ext)) {
          files.push(fullPath)
        }
      }
    }
  }

  walk(dir)
  return files
}

// Main ghost dependency detector.
// Compares imported packages in source code against declared dependencies.
export function detectGhostDependencies(
  graph: DependencyGraph,
  projectDir: string,
): GhostDependency[] {
  const ghosts: GhostDependency[] = []

  // Collect declared direct dependency names (npm + pip)
  const declaredDirect = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.from === graph.rootId && (edge.type === 'direct' || edge.type === 'dev')) {
      const node = graph.nodes[edge.to]
      if (node) declaredDirect.add(node.name.toLowerCase())
    }
  }

  // All transitive package names (for "provided by" lookup)
  const transitiveNames = new Map<string, string>()  // name → nodeId
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    transitiveNames.set(node.name.toLowerCase(), nodeId)
  }

  // Scan JS/TS source files
  const jsFiles = collectSourceFiles(projectDir, ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])
  const jsImportMap: Record<string, string[]> = {}
  for (const file of jsFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const imports = extractJSImports(content)
      for (const pkg of imports) {
        if (!jsImportMap[pkg]) jsImportMap[pkg] = []
        jsImportMap[pkg].push(file)
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Scan Python source files
  const pyFiles = collectSourceFiles(projectDir, ['.py'])
  const pyImportMap: Record<string, string[]> = {}
  for (const file of pyFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const imports = extractPythonImports(content)
      for (const pkg of imports) {
        if (!pyImportMap[pkg]) pyImportMap[pkg] = []
        pyImportMap[pkg].push(file)
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Check for ghost dependencies in JS/TS imports
  for (const [pkgName, files] of Object.entries(jsImportMap)) {
    const normalized = pkgName.toLowerCase()
    if (!declaredDirect.has(normalized) && transitiveNames.has(normalized)) {
      const providedBy = transitiveNames.get(normalized) ?? null
      ghosts.push({ packageName: pkgName, importedIn: files, providedBy })

      // Mark the node as a ghost dependency
      const nodeId = transitiveNames.get(normalized)
      if (nodeId && graph.nodes[nodeId]) {
        graph.nodes[nodeId].isGhostDependency = true
      }
    }
  }

  // Check for ghost dependencies in Python imports
  for (const [pkgName, files] of Object.entries(pyImportMap)) {
    const normalized = pkgName.toLowerCase()
    if (!declaredDirect.has(normalized) && transitiveNames.has(normalized)) {
      const providedBy = transitiveNames.get(normalized) ?? null
      ghosts.push({ packageName: pkgName, importedIn: files, providedBy })

      const nodeId = transitiveNames.get(normalized)
      if (nodeId && graph.nodes[nodeId]) {
        graph.nodes[nodeId].isGhostDependency = true
      }
    }
  }

  return ghosts
}
