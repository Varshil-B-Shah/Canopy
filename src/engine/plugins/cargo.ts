import fs from 'fs'
import path from 'path'
import type { RawDependency, ResolvedDependency } from '../types'
import type { LanguageParser } from './base'

export const cargoPlugin: LanguageParser = {
  name: 'cargo',
  ecosystem: 'cargo',

  canParse(projectDir: string): boolean {
    return fs.existsSync(path.join(projectDir, 'Cargo.toml'))
  },

  parseManifest(projectDir: string): RawDependency[] {
    const cargoPath = path.join(projectDir, 'Cargo.toml')
    return parseCargoToml(cargoPath)
  },

  parseLockfile(projectDir: string): ResolvedDependency[] {
    const lockPath = path.join(projectDir, 'Cargo.lock')
    if (fs.existsSync(lockPath)) {
      return parseCargoLock(lockPath)
    }
    return this.parseManifest(projectDir).map((dep: RawDependency) => ({
      ...dep,
      resolvedVersion: dep.declaredVersion.replace(/[^0-9.]/g, '') || '0.0.0',
      dependencies: [],
    }))
  },

  parseImports(_projectDir: string): string[] {
    return []
  },
}

function parseCargoToml(cargoPath: string): RawDependency[] {
  const deps: RawDependency[] = []

  try {
    const content = fs.readFileSync(cargoPath, 'utf-8')

    // Parse [dependencies] section
    const depSectionMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/)
    if (depSectionMatch) {
      parseDepSection(depSectionMatch[1], 'direct', deps)
    }

    // Parse [dev-dependencies] section
    const devDepMatch = content.match(/\[dev-dependencies\]([\s\S]*?)(?:\[|$)/)
    if (devDepMatch) {
      parseDepSection(devDepMatch[1], 'dev', deps)
    }
  } catch {
    // Unreadable
  }

  return deps
}

function parseDepSection(
  section: string,
  type: 'direct' | 'dev',
  deps: RawDependency[],
): void {
  // Simple: name = "version"
  const simpleRegex = /^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/gm
  let match: RegExpExecArray | null
  while ((match = simpleRegex.exec(section)) !== null) {
    deps.push({
      name: match[1],
      ecosystem: 'cargo',
      declaredVersion: match[2],
      type,
    })
  }

  // Inline table: name = { version = "x.y.z" }
  const inlineRegex = /^([a-zA-Z0-9_-]+)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"[^}]*\}/gm
  while ((match = inlineRegex.exec(section)) !== null) {
    deps.push({
      name: match[1],
      ecosystem: 'cargo',
      declaredVersion: match[2],
      type,
    })
  }
}

function parseCargoLock(lockPath: string): ResolvedDependency[] {
  const deps: ResolvedDependency[] = []

  try {
    const content = fs.readFileSync(lockPath, 'utf-8')

    // Cargo.lock uses [[package]] blocks
    const packageBlocks = content.split('[[package]]').slice(1)
    for (const block of packageBlocks) {
      const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m)
      const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m)

      if (nameMatch && versionMatch) {
        deps.push({
          name: nameMatch[1],
          ecosystem: 'cargo',
          declaredVersion: versionMatch[1],
          resolvedVersion: versionMatch[1],
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
