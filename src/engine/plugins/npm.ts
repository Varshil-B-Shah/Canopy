import fs from 'fs'
import path from 'path'
import type { RawDependency, ResolvedDependency } from '../types'
import type { LanguageParser } from './base'

export const npmPlugin: LanguageParser = {
  name: 'npm',
  ecosystem: 'npm',

  canParse(projectDir: string): boolean {
    return fs.existsSync(path.join(projectDir, 'package.json'))
  },

  parseManifest(projectDir: string): RawDependency[] {
    const pkgPath = path.join(projectDir, 'package.json')
    const raw: RawDependency[] = []

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

      for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
        raw.push({ name, ecosystem: 'npm', declaredVersion: version as string, type: 'direct' })
      }
      for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
        raw.push({ name, ecosystem: 'npm', declaredVersion: version as string, type: 'dev' })
      }
      for (const [name, version] of Object.entries(pkg.peerDependencies ?? {})) {
        raw.push({ name, ecosystem: 'npm', declaredVersion: version as string, type: 'peer' })
      }
    } catch {
      // Malformed package.json — return empty
    }

    return raw
  },

  parseLockfile(projectDir: string): ResolvedDependency[] {
    // Try package-lock.json first (npm), then yarn.lock, then pnpm-lock.yaml
    const lockPath = path.join(projectDir, 'package-lock.json')
    if (fs.existsSync(lockPath)) return parsePackageLock(lockPath)

    const yarnPath = path.join(projectDir, 'yarn.lock')
    if (fs.existsSync(yarnPath)) return parseYarnLock(yarnPath, projectDir)

    // No lockfile — fall back to manifest only
    return this.parseManifest(projectDir).map((dep: RawDependency) => ({
      ...dep,
      resolvedVersion: dep.declaredVersion,
      dependencies: [],
    }))
  },

  parseImports(_projectDir: string): string[] {
    // Ghost detection handled in ghost.ts using regex scan
    return []
  },
}

function parsePackageLock(lockPath: string): ResolvedDependency[] {
  const resolved: ResolvedDependency[] = []

  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))

    // package-lock.json v2/v3 format uses "packages" key
    if (lock.packages) {
      for (const [pkgPath, info] of Object.entries(lock.packages as Record<string, any>)) {
        if (pkgPath === '') continue  // Root package
        if (pkgPath.includes('node_modules/node_modules/')) continue  // Skip hoisted dupes

        // Extract name from path like "node_modules/express" or "node_modules/@org/pkg"
        const name = pkgPath.replace(/^.*node_modules\//, '')
        const version = info.version ?? '0.0.0'
        const license = info.license ?? 'UNKNOWN'

        resolved.push({
          name,
          ecosystem: 'npm',
          declaredVersion: version,
          resolvedVersion: version,
          type: info.dev ? 'dev' : info.peer ? 'peer' : 'direct',
          dependencies: [],
        })
      }
    } else if (lock.dependencies) {
      // v1 format
      function flattenDeps(deps: Record<string, any>): void {
        for (const [name, info] of Object.entries(deps)) {
          resolved.push({
            name,
            ecosystem: 'npm',
            declaredVersion: info.version ?? '0.0.0',
            resolvedVersion: info.version ?? '0.0.0',
            type: info.dev ? 'dev' : 'direct',
            dependencies: [],
          })
          if (info.dependencies) flattenDeps(info.dependencies)
        }
      }
      flattenDeps(lock.dependencies)
    }
  } catch {
    // Corrupt lockfile
  }

  return resolved
}

function parseYarnLock(lockPath: string, projectDir: string): ResolvedDependency[] {
  // Yarn.lock format is custom — parse line by line
  const resolved: ResolvedDependency[] = []

  try {
    const content = fs.readFileSync(lockPath, 'utf-8')
    const lines = content.split('\n')
    let currentName = ''
    let currentVersion = ''

    for (const line of lines) {
      // Package header: "name@version:", or "@scope/name@version:"
      const headerMatch = line.match(/^"?([^@\s"]+(?:@[^@\s"]+)*)@[^"]+(?:,.*)?:$/)
      if (headerMatch) {
        if (currentName && currentVersion) {
          resolved.push({
            name: currentName,
            ecosystem: 'npm',
            declaredVersion: currentVersion,
            resolvedVersion: currentVersion,
            type: 'direct',
            dependencies: [],
          })
        }
        currentName = headerMatch[1]
        currentVersion = ''
      }

      const versionMatch = line.match(/^\s+version\s+"([^"]+)"/)
      if (versionMatch) {
        currentVersion = versionMatch[1]
      }
    }

    // Push the last package
    if (currentName && currentVersion) {
      resolved.push({
        name: currentName,
        ecosystem: 'npm',
        declaredVersion: currentVersion,
        resolvedVersion: currentVersion,
        type: 'direct',
        dependencies: [],
      })
    }
  } catch {
    // Fall back to manifest
    return npmPlugin.parseManifest(projectDir).map((dep: RawDependency) => ({
      ...dep,
      resolvedVersion: dep.declaredVersion,
      dependencies: [],
    }))
  }

  return resolved
}
