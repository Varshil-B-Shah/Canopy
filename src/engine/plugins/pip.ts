import fs from 'fs'
import path from 'path'
import type { LanguageParser, RawDependency, ResolvedDependency } from '../types'

export const pipPlugin: LanguageParser = {
  name: 'pip',
  ecosystem: 'pip',

  canParse(projectDir: string): boolean {
    return (
      fs.existsSync(path.join(projectDir, 'requirements.txt')) ||
      fs.existsSync(path.join(projectDir, 'pyproject.toml')) ||
      fs.existsSync(path.join(projectDir, 'Pipfile'))
    )
  },

  parseManifest(projectDir: string): RawDependency[] {
    // Try requirements.txt first
    const reqPath = path.join(projectDir, 'requirements.txt')
    if (fs.existsSync(reqPath)) {
      return parseRequirementsTxt(reqPath)
    }

    // Try pyproject.toml
    const pyprojectPath = path.join(projectDir, 'pyproject.toml')
    if (fs.existsSync(pyprojectPath)) {
      return parsePyproject(pyprojectPath)
    }

    return []
  },

  parseLockfile(projectDir: string): ResolvedDependency[] {
    // Try poetry.lock
    const poetryLockPath = path.join(projectDir, 'poetry.lock')
    if (fs.existsSync(poetryLockPath)) {
      return parsePoetryLock(poetryLockPath)
    }

    // Fall back to manifest
    return this.parseManifest(projectDir).map(dep => ({
      ...dep,
      resolvedVersion: dep.declaredVersion.replace(/[^0-9.]/g, '') || '0.0.0',
      dependencies: [],
    }))
  },

  parseImports(_projectDir: string): string[] {
    return []
  },
}

function parseRequirementsTxt(reqPath: string): RawDependency[] {
  const deps: RawDependency[] = []

  try {
    const lines = fs.readFileSync(reqPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue

      // Remove inline comments
      const withoutComment = trimmed.split('#')[0].trim()

      // Parse package==version, package>=version, package~=version, etc.
      const match = withoutComment.match(/^([a-zA-Z0-9_.-]+)\s*([>=<~!].*)?$/)
      if (match) {
        deps.push({
          name: match[1],
          ecosystem: 'pip',
          declaredVersion: match[2]?.trim() ?? '*',
          type: 'direct',
        })
      }
    }
  } catch {
    // Unreadable file
  }

  return deps
}

function parsePyproject(pyprojectPath: string): RawDependency[] {
  const deps: RawDependency[] = []

  try {
    // Simple TOML parsing without the library for basic cases
    const content = fs.readFileSync(pyprojectPath, 'utf-8')

    // Extract [tool.poetry.dependencies] or [project.dependencies]
    const depSectionMatch = content.match(
      /\[(?:tool\.poetry\.)?dependencies\]([\s\S]*?)(?:\[|$)/,
    )
    if (depSectionMatch) {
      const section = depSectionMatch[1]
      const lineRegex = /^([a-zA-Z0-9_.-]+)\s*=\s*"([^"]+)"/gm
      let match: RegExpExecArray | null
      while ((match = lineRegex.exec(section)) !== null) {
        if (match[1] === 'python') continue
        deps.push({
          name: match[1],
          ecosystem: 'pip',
          declaredVersion: match[2],
          type: 'direct',
        })
      }
    }
  } catch {
    // Unreadable
  }

  return deps
}

function parsePoetryLock(lockPath: string): ResolvedDependency[] {
  const deps: ResolvedDependency[] = []

  try {
    const content = fs.readFileSync(lockPath, 'utf-8')

    // Each package is a [[package]] block
    const packageBlocks = content.split('[[package]]').slice(1)
    for (const block of packageBlocks) {
      const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m)
      const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m)

      if (nameMatch && versionMatch) {
        deps.push({
          name: nameMatch[1],
          ecosystem: 'pip',
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
