import fs from 'fs'
import path from 'path'
import type { LanguageParser, RawDependency, ResolvedDependency } from '../types'

export const goPlugin: LanguageParser = {
  name: 'go-modules',
  ecosystem: 'go',

  canParse(projectDir: string): boolean {
    return fs.existsSync(path.join(projectDir, 'go.mod'))
  },

  parseManifest(projectDir: string): RawDependency[] {
    const goModPath = path.join(projectDir, 'go.mod')
    return parseGoMod(goModPath)
  },

  parseLockfile(projectDir: string): ResolvedDependency[] {
    const goSumPath = path.join(projectDir, 'go.sum')
    if (fs.existsSync(goSumPath)) {
      return parseGoSum(goSumPath)
    }
    // Fall back to go.mod
    return this.parseManifest(projectDir).map(dep => ({
      ...dep,
      resolvedVersion: dep.declaredVersion.replace(/^v/, ''),
      dependencies: [],
    }))
  },

  parseImports(_projectDir: string): string[] {
    return []
  },
}

function parseGoMod(goModPath: string): RawDependency[] {
  const deps: RawDependency[] = []

  try {
    const content = fs.readFileSync(goModPath, 'utf-8')

    // Parse "require" blocks
    // Single: require github.com/some/pkg v1.2.3
    // Block:  require ( github.com/pkg v1.2.3 )
    const singleRequire = /^require\s+(\S+)\s+(v[\d.]+[^\s]*)/gm
    let match: RegExpExecArray | null
    while ((match = singleRequire.exec(content)) !== null) {
      deps.push({
        name: match[1],
        ecosystem: 'go',
        declaredVersion: match[2],
        type: 'direct',
      })
    }

    // Block require
    const blockRequire = /require\s+\(([\s\S]*?)\)/g
    while ((match = blockRequire.exec(content)) !== null) {
      const block = match[1]
      const lineRegex = /\s+(\S+)\s+(v[\d.]+[^\s]*)/g
      let inner: RegExpExecArray | null
      while ((inner = lineRegex.exec(block)) !== null) {
        if (!inner[1].startsWith('//')) {
          deps.push({
            name: inner[1],
            ecosystem: 'go',
            declaredVersion: inner[2],
            type: 'direct',
          })
        }
      }
    }
  } catch {
    // Unreadable
  }

  return deps
}

function parseGoSum(goSumPath: string): ResolvedDependency[] {
  const seen = new Set<string>()
  const deps: ResolvedDependency[] = []

  try {
    const lines = fs.readFileSync(goSumPath, 'utf-8').split('\n')
    for (const line of lines) {
      const parts = line.trim().split(' ')
      if (parts.length < 2) continue

      const modulePath = parts[0]
      const versionFull = parts[1]  // e.g. "v1.2.3" or "v1.2.3/go.mod"
      const version = versionFull.replace('/go.mod', '')

      const key = `${modulePath}@${version}`
      if (!seen.has(key)) {
        seen.add(key)
        deps.push({
          name: modulePath,
          ecosystem: 'go',
          declaredVersion: version,
          resolvedVersion: version.replace(/^v/, ''),
          type: 'direct',
          dependencies: [],
        })
      }
    }
  } catch {
    // Unreadable
  }

  return deps
}
