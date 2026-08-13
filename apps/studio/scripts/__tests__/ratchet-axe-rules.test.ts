import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runAxeRatchet } from '../ratchet-axe-rules'

const studioRoot = path.resolve(__dirname, '../..')
const scriptArgvPlaceholder = path.resolve(studioRoot, 'scripts', 'ratchet-axe-rules.ts')

const ALL_RULES = ['color-contrast', 'region']

const SCAN_THEME = 'light'

const tempDirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('ratchet-axe-rules integration', () => {
  it('captures per-route counts when initializing baselines', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    const scans = buildScans([
      { surface: '/project/default', rules: { 'color-contrast': 1 } },
      { surface: '/project/default/editor', rules: { 'color-contrast': 2 } },
    ])

    expect(
      invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast', '--init'], scans)
    ).toBe(0)

    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
    expect(metadata.rules['color-contrast']).toBe(3)
    expect(metadata.ruleRoutes['color-contrast']).toEqual({
      '/project/default': 1,
      '/project/default/editor': 2,
    })
  })

  it('reports offending routes when regressions occur and metadata has per-route data', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    writeBaseline(metadataPath, {
      rules: { 'color-contrast': 2 },
      ruleRoutes: { 'color-contrast': { '/project/default': 2 } },
    })

    const scans = buildScans([
      { surface: '/project/default', rules: { 'color-contrast': 3 } },
      { surface: '/project/default/editor', rules: { 'color-contrast': 1 } },
    ])

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast'], scans)).toBe(1)

    const errors = collectCalls(errorSpy)
    expect(errors).toContain('/project/default (+1)')
    expect(errors).toContain('/project/default/editor (+1)')
  })

  it('reads rule ids from --rules-file', () => {
    const tmp = createTempDir()
    const metadataPath = path.join(tmp, 'baseline.json')
    const rulesFilePath = path.join(tmp, 'rules.json')
    writeFileSync(rulesFilePath, JSON.stringify(ALL_RULES))

    const scans = buildScans([
      { surface: '/project/default', rules: { 'color-contrast': 1, region: 2 } },
    ])

    expect(
      invokeRatchet(['--metadata', metadataPath, '--rules-file', rulesFilePath, '--init'], scans)
    ).toBe(0)

    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
    expect(metadata.rules['color-contrast']).toBe(1)
    expect(metadata.rules['region']).toBe(2)
  })

  it('falls back gracefully when baseline is missing per-route data', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    writeBaseline(metadataPath, { rules: { 'color-contrast': 1 } })

    const scans = buildScans([{ surface: '/project/default', rules: { 'color-contrast': 2 } }])

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast'], scans)).toBe(1)

    const errors = collectCalls(errorSpy)
    expect(errors).toContain('baseline missing route breakdown')
    expect(errors).toContain('/project/default (2 current)')
  })

  it('treats a missing baseline file as an error rather than a pass', () => {
    const metadataPath = path.join(createTempDir(), 'absent.json')

    const scans = buildScans([{ surface: '/project/default', rules: { 'color-contrast': 1 } }])

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast'], scans)).toBe(2)
    expect(collectCalls(errorSpy)).toContain('Run with --init')
  })

  it('errors when a ratcheted rule was never scanned', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    writeBaseline(metadataPath, { rules: { 'color-contrast': 0, region: 0 } })

    const scans = buildScans([
      { surface: '/project/default', rules: {}, scannedRules: ['color-contrast'] },
    ])

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast,region'], scans)
    ).toBe(2)
    expect(collectCalls(errorSpy)).toContain('Ratcheted rules the scan never ran: region')
  })

  it('errors when a scan unit failed to load', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    writeBaseline(metadataPath, { rules: { 'color-contrast': 5 } })

    const scans = [
      {
        surface: '/project/default/sql',
        loaded: false,
        elementCount: 0,
        scannedRules: ALL_RULES,
        violations: [],
      },
    ]

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast'], scans)).toBe(2)
    expect(collectCalls(errorSpy)).toContain('/project/default/sql')
  })

  it('passes on an improvement without tightening the baseline', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    writeBaseline(metadataPath, {
      rules: { 'color-contrast': 5 },
      ruleRoutes: { 'color-contrast': { '/project/default': 5 } },
    })

    const scans = buildScans([{ surface: '/project/default', rules: { 'color-contrast': 2 } }])

    expect(invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast'], scans)).toBe(0)

    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
    expect(metadata.rules['color-contrast']).toBe(5)
  })

  it('tightens the baseline only under --decrease-baselines', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    writeBaseline(metadataPath, {
      rules: { 'color-contrast': 5 },
      ruleRoutes: { 'color-contrast': { '/project/default': 5 } },
    })

    const scans = buildScans([{ surface: '/project/default', rules: { 'color-contrast': 2 } }])

    expect(
      invokeRatchet(
        ['--metadata', metadataPath, '--rule', 'color-contrast', '--decrease-baselines'],
        scans
      )
    ).toBe(0)

    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
    expect(metadata.rules['color-contrast']).toBe(2)
    expect(metadata.ruleRoutes['color-contrast']).toEqual({ '/project/default': 2 })
  })

  it('records the scanned theme in the baseline', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    const scans = buildScans([{ surface: '/project/default', rules: { 'color-contrast': 1 } }])

    expect(
      invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast', '--init'], scans)
    ).toBe(0)

    expect(JSON.parse(readFileSync(metadataPath, 'utf8')).theme).toBe(SCAN_THEME)
  })

  it('errors when the scan theme differs from the baseline theme', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    writeBaseline(metadataPath, { theme: 'light', rules: { 'color-contrast': 0 } })

    const scans = buildScans([{ surface: '/project/default', rules: {}, theme: 'dark' }])

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast'], scans)).toBe(2)
    expect(collectCalls(errorSpy)).toContain('captured in "light"')
  })

  it('errors when scan units rendered in more than one theme', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')

    writeBaseline(metadataPath, { theme: 'light', rules: { 'color-contrast': 0 } })

    const scans = buildScans([
      { surface: '/project/default', rules: {}, theme: 'light' },
      { surface: '/project/default/sql', rules: {}, theme: 'dark' },
    ])

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast'], scans)).toBe(2)
    expect(collectCalls(errorSpy)).toContain('more than one theme')
  })

  it('renders an improvement delta with a single minus sign', () => {
    const metadataPath = path.join(createTempDir(), 'baseline.json')
    const summaryPath = path.join(createTempDir(), 'summary.md')
    writeFileSync(summaryPath, '')

    writeBaseline(metadataPath, { rules: { 'color-contrast': 30 } })

    const scans = buildScans([{ surface: '/project/default', rules: { 'color-contrast': 4 } }])

    vi.stubEnv('GITHUB_STEP_SUMMARY', summaryPath)
    expect(invokeRatchet(['--metadata', metadataPath, '--rule', 'color-contrast'], scans)).toBe(0)
    vi.unstubAllEnvs()

    const summary = readFileSync(summaryPath, 'utf8')
    expect(summary).toContain('| -26 |')
    expect(summary).not.toContain('--26')
  })
})

function buildScans(
  units: Array<{
    surface: string
    rules: Record<string, number>
    scannedRules?: string[]
    theme?: string
  }>
) {
  return units.map(({ surface, rules, scannedRules, theme }) => ({
    surface,
    loaded: true,
    elementCount: 500,
    scannedRules: scannedRules ?? ALL_RULES,
    theme: theme ?? SCAN_THEME,
    violations: Object.entries(rules).map(([id, count]) => ({
      id,
      nodes: Array.from({ length: count }, () => ({ target: [id] })),
    })),
  }))
}

function writeBaseline(metadataPath: string, baseline: unknown): void {
  writeFileSync(metadataPath, JSON.stringify(baseline, null, 2))
}

function collectCalls(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((args) => args.join(' ')).join('\n')
}

function createTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ratchet-axe'))
  tempDirs.push(dir)
  return dir
}

function invokeRatchet(args: string[], scans: unknown[]): number {
  const argv = ['node', scriptArgvPlaceholder, ...args]
  return runAxeRatchet(argv, () => ({ results: scans as any, stderr: '' }))
}
