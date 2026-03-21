import type { Ecosystem, RawDependency, ResolvedDependency } from '../types'

export interface LanguageParser {
  name: string
  ecosystem: Ecosystem

  // Returns true if this parser can handle the project directory
  canParse(projectDir: string): boolean

  // Reads manifests → declared dependencies
  parseManifest(projectDir: string): RawDependency[]

  // Reads lockfile → resolved + transitive dependencies
  parseLockfile(projectDir: string): ResolvedDependency[]

  // Reads source files → list of imported package names (for ghost detection)
  parseImports(projectDir: string): string[]

  // Extracts license information from lockfile (optional - returns empty map if not implemented)
  parseLicenses?(projectDir: string): Record<string, string>
}
