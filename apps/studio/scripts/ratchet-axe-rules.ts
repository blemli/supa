/* eslint-disable turbo/no-undeclared-env-vars */
/**
 * Ratchet axe-core violations for selected rules.
 *
 * Reads the JSON the Playwright a11y scan writes to `e2e/studio/axe-results`,
 * one file per scan unit, and compares per-rule node counts against a baseline.
 *
 * Examples:
 *   # Initialize baselines from a scan
 *   tsx scripts/ratchet-axe-rules.ts --init --rules-file scripts/axe-ratchet-rules.json
 *
 *   # Compare current counts vs baselines
 *   tsx scripts/ratchet-axe-rules.ts --rules-file scripts/axe-ratchet-rules.json
 *
 *   # Lower baselines when improvements occur
 *   tsx scripts/ratchet-axe-rules.ts --rules-file scripts/axe-ratchet-rules.json \
 *     --decrease-baselines
 *
 * Flags:
 *   --metadata <path>     Path to baseline file (default .github/axe-rule-baselines.json)
 *   --results <path>      Directory of scan result JSON (default ../../e2e/studio/axe-results)
 *   --init                Write current counts for the provided --rule(s) into metadata and exit 0
 *   --rule <id>[,<id>...] Rule id(s). Repeat flag or comma-separate.
 *   --rules-file <path>   Path to a JSON file containing an array of rule id strings.
 *                         Combines with --rule if both are given. One of the two is REQUIRED.
 *   --decrease-baselines  When improvements occur, lower stored baselines to match the new counts.
 *
 * Exit codes:
 *   0 stable or improved, 1 regression, 2 usage error or unusable scan data.
 *
 * Notes:
 * - Counts violating nodes, not violating rules, so a rule firing on ten
 *   elements counts ten.
 * - A rule with no baseline is an error, not a silent pass.
 * - Improvements do not tighten the baseline unless --decrease-baselines is
 *   passed, so a PR that fixes violations cannot break a concurrent PR.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Mirrors MIN_MEANINGFUL_ELEMENTS in e2e/shared/a11y.ts. A scan unit below this
// rendered an empty state or never mounted, so its zero counts prove nothing.
const MIN_MEANINGFUL_ELEMENTS = 20

const MAX_ROUTES = 5

interface Args {
  metadata: string
  results: string
  init: boolean
  decreaseBaselines: boolean
  rules: string[]
  rulesFile?: string
}

interface ScanViolation {
  id?: string
  nodes?: unknown[]
}

interface ScanArtifact {
  surface?: string
  url?: string
  loaded?: boolean
  elementCount?: number
  scannedRules?: string[]
  violations?: ScanViolation[]
}

interface ScanExecutionResult {
  results: ScanArtifact[]
  stderr: string
}

interface BaselineData {
  rules: Record<string, number>
  ruleRoutes?: Record<string, Record<string, number>>
}

interface RuleSnapshot {
  total: number
  routes: Record<string, number>
}

function readRulesFile(filePath: string): string[] {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (e) {
    console.error(`Error: Could not read --rules-file ${filePath}: ${e}`)
    process.exit(2)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    console.error(`Error: Could not parse --rules-file ${filePath} as JSON: ${e}`)
    process.exit(2)
  }

  if (!Array.isArray(parsed) || !parsed.every((r) => typeof r === 'string')) {
    console.error(`Error: --rules-file ${filePath} must contain a JSON array of rule id strings.`)
    process.exit(2)
  }

  return parsed
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    metadata: '.github/axe-rule-baselines.json',
    results: path.join('..', '..', 'e2e', 'studio', 'axe-results'),
    init: false,
    decreaseBaselines: false,
    rules: [],
  }

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--init') {
      args.init = true
    } else if (a === '--metadata') {
      args.metadata = argv[++i]
    } else if (a === '--results') {
      args.results = argv[++i]
    } else if (a === '--rule') {
      const val = (argv[++i] ?? '').trim()
      if (val) {
        args.rules.push(
          ...val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      }
    } else if (a === '--rules-file') {
      args.rulesFile = argv[++i]
    } else if (a === '--decrease-baselines') {
      args.decreaseBaselines = true
    } else {
      console.warn(`Unknown argument: ${a}`)
    }
  }

  if (args.rulesFile) {
    args.rules.push(...readRulesFile(args.rulesFile))
  }

  if (args.rules.length === 0) {
    console.error('Error: You must provide at least one --rule <rule-id> or a --rules-file.')
    console.error('Example: --rule color-contrast --rule region')
    console.error('Example: --rules-file scripts/axe-ratchet-rules.json')
    process.exit(2)
  }

  args.rules = Array.from(new Set(args.rules))

  return args
}

function readScanResults(resultsPath: string): ScanExecutionResult {
  if (!existsSync(resultsPath)) {
    console.error(
      `No scan results at ${resultsPath}. Run the a11y Playwright specs first ` +
        '(`pnpm -C e2e/studio exec playwright test --grep @a11y`).'
    )
    process.exit(2)
  }

  const files = readdirSync(resultsPath).filter((file) => file.endsWith('.json'))
  if (!files.length) {
    console.error(`No scan result JSON files in ${resultsPath}.`)
    process.exit(2)
  }

  const results: ScanArtifact[] = []
  const problems: string[] = []

  for (const file of files) {
    const full = path.join(resultsPath, file)
    try {
      results.push(JSON.parse(readFileSync(full, 'utf8')) as ScanArtifact)
    } catch (e) {
      problems.push(`Could not parse ${full}: ${e}`)
    }
  }

  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(2)
  }

  return { results, stderr: '' }
}

function collectRuleSnapshots(
  results: ScanArtifact[],
  ruleIds: string[]
): Record<string, RuleSnapshot> {
  const checkedIds = new Set(ruleIds)
  const snapshots: Record<string, RuleSnapshot> = {}

  for (const id of ruleIds) {
    snapshots[id] = { total: 0, routes: {} }
  }

  for (const artifact of results) {
    const surface = artifact?.surface
    if (!surface || !Array.isArray(artifact.violations)) continue

    for (const violation of artifact.violations) {
      const id = violation?.id ?? ''
      if (!id || !checkedIds.has(id)) continue

      const count = Array.isArray(violation.nodes) ? violation.nodes.length : 1
      const snapshot = snapshots[id] ?? { total: 0, routes: {} }
      snapshot.total += count
      snapshot.routes[surface] = (snapshot.routes[surface] ?? 0) + count
      snapshots[id] = snapshot
    }
  }

  return snapshots
}

// A scan unit that never loaded, or that rendered an empty state, reports zero
// violations for reasons that have nothing to do with accessibility.
function findUnusableScans(results: ScanArtifact[]): { unloaded: string[]; empty: string[] } {
  const unloaded: string[] = []
  const empty: string[] = []

  for (const artifact of results) {
    const surface = artifact?.surface ?? '(unnamed)'
    if (artifact?.loaded === false) {
      unloaded.push(surface)
    } else if ((artifact?.elementCount ?? 0) < MIN_MEANINGFUL_ELEMENTS) {
      empty.push(surface)
    }
  }

  return { unloaded, empty }
}

// Guards against ratcheting a rule the scan never actually ran, which would
// baseline at zero and stay there.
function findUnscannedRules(results: ScanArtifact[], ruleIds: string[]): string[] {
  const scanned = new Set<string>()
  for (const artifact of results) {
    for (const rule of artifact?.scannedRules ?? []) scanned.add(rule)
  }

  if (!scanned.size) return []
  return ruleIds.filter((rule) => !scanned.has(rule))
}

function readBaselines(fp: string): BaselineData | null {
  if (!existsSync(fp)) return null
  try {
    const data = JSON.parse(readFileSync(fp, 'utf8')) as Partial<BaselineData>
    if (data && typeof data === 'object' && data.rules && typeof data.rules === 'object') {
      return { rules: data.rules, ruleRoutes: data.ruleRoutes ?? {} }
    }
  } catch {
    // ignore invalid metadata files and report them as missing baselines
  }
  return null
}

function writeBaselines(fp: string, updates: Record<string, RuleSnapshot>, merge = true): void {
  mkdirSync(path.dirname(fp), { recursive: true })

  const current = (merge && readBaselines(fp)) || { rules: {}, ruleRoutes: {} }

  const nextRules = merge ? { ...current.rules } : {}
  const nextRuleRoutes = merge ? { ...(current.ruleRoutes ?? {}) } : {}

  for (const [rule, snapshot] of Object.entries(updates)) {
    nextRules[rule] = snapshot.total
    nextRuleRoutes[rule] = snapshot.routes
  }

  const next: BaselineData = { rules: nextRules, ruleRoutes: nextRuleRoutes }
  writeFileSync(fp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

function writeSummary(markdown: string): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  if (summaryFile) {
    try {
      appendFileSync(summaryFile, `${markdown}\n`, 'utf8')
    } catch {
      // ignore summary write errors because they shouldn't block the script
    }
  }
}

export function runAxeRatchet(argv: string[], readViolations = readScanResults): number {
  const args = parseArgs(argv)

  const { results, stderr } = readViolations(args.results)

  const { unloaded, empty } = findUnusableScans(results)
  if (unloaded.length) {
    const msg =
      `Scan units failed to load: ${unloaded.join(', ')}. Their zero counts are not ` +
      'comparable, so the ratchet cannot run. Fix the scan before comparing baselines.'
    console.error(msg)
    writeSummary(`### Axe rule ratchet\n${msg}`)
    console.log(`::error title=Unusable scan::${msg}`)
    return 2
  }

  const unscanned = findUnscannedRules(results, args.rules)
  if (unscanned.length) {
    const msg =
      `Ratcheted rules the scan never ran: ${unscanned.join(', ')}. They would baseline at ` +
      'zero and never move. Add them to the scan rule set or drop them from the ratchet.'
    console.error(msg)
    writeSummary(`### Axe rule ratchet\n${msg}`)
    console.log(`::error title=Unscanned rules::${msg}`)
    return 2
  }

  if (empty.length) {
    const msg =
      `Scan units rendered fewer than ${MIN_MEANINGFUL_ELEMENTS} elements: ${empty.join(', ')}. ` +
      'A clean result there proves nothing.'
    console.warn(msg)
    console.log(`::warning title=Empty scan::${msg}`)
  }

  const currentSnapshots = collectRuleSnapshots(results, args.rules)
  const currentCounts: Record<string, number> = {}
  for (const rule of args.rules) {
    currentCounts[rule] = currentSnapshots[rule]?.total ?? 0
  }

  if (args.init) {
    writeBaselines(args.metadata, currentSnapshots, true)

    const rows = Object.entries(currentCounts)
      .map(([rule, count]) => `| \`${rule}\` | **${count}** |`)
      .join('\n')

    writeSummary(
      [
        `### Axe rule baselines initialized`,
        `Metadata: \`${args.metadata}\``,
        ``,
        `| Rule | Baseline |`,
        `| --- | ---: |`,
        rows,
        ``,
      ].join('\n')
    )

    console.log(
      `Initialized/updated baselines for: ${args.rules.join(', ')} (saved to ${args.metadata}).`
    )
    return 0
  }

  const baselineData = readBaselines(args.metadata)
  if (!baselineData) {
    const msg = `No usable baselines in ${args.metadata}. Run with --init to capture them.`
    console.error(msg)
    writeSummary(`### Axe rule ratchet\n${msg}`)
    console.log(`::error title=Missing baselines::${msg}`)
    return 2
  }

  const baselineRules = baselineData.rules
  const baselineRuleRoutes = baselineData.ruleRoutes ?? {}

  const missing = args.rules.filter((r) => typeof baselineRules[r] !== 'number')
  if (missing.length) {
    const msg = `Missing baselines for: ${missing.join(', ')} in ${args.metadata}. Run with --init to set them.`
    console.error(msg)
    writeSummary(`### Axe rule ratchet\n${msg}`)
    console.log(`::error title=Missing baselines::${msg}`)
    return 2
  }

  let failed = false
  const tableRows: string[] = []
  const improvedRules: string[] = []
  const decreasedBaselines: Record<string, { from: number; to: number; snapshot: RuleSnapshot }> =
    {}

  for (const rule of args.rules) {
    const baseline = baselineRules[rule] ?? 0
    const current = currentCounts[rule] ?? 0
    const delta = current - baseline
    const currentSnapshot = currentSnapshots[rule] ?? { total: 0, routes: {} }
    const baselineRoutes = baselineRuleRoutes[rule] ?? {}

    tableRows.push(
      `| \`${rule}\` | **${baseline}** | **${current}** | ${delta >= 0 ? '+' : ''}${delta} |`
    )

    if (current > baseline) {
      failed = true
      const baselineHasRoutes = Object.hasOwn(baselineRuleRoutes, rule)
      const routeSummary = describeRouteRegression(
        baselineRoutes,
        currentSnapshot.routes,
        baselineHasRoutes
      )
      const msgParts = [
        `You added ${delta === 1 ? 'a new violation' : `${delta} new violations`} of ${rule}. Please fix it: baseline=${baseline}, current=${current}`,
      ]
      if (routeSummary) {
        msgParts.push(
          `Affected routes: ${routeSummary}${baselineHasRoutes ? '' : ' (baseline missing route breakdown; rerun with --init to capture it)'}`
        )
      }
      const msg = msgParts.join(' ')
      console.error(msg)
      console.log(`::error title=New violations::${msg}`)
    } else if (current < baseline) {
      improvedRules.push(rule)
      if (args.decreaseBaselines) {
        decreasedBaselines[rule] = { from: baseline, to: current, snapshot: currentSnapshot }
      }
    }
  }

  const summaryLines = [
    `### Axe rule ratchet`,
    `Metadata: \`${args.metadata}\``,
    ``,
    `| Rule | Baseline | Current | Δ |`,
    `| --- | ---: | ---: | ---: |`,
    ...tableRows,
    ``,
  ]

  if (args.decreaseBaselines && Object.keys(decreasedBaselines).length > 0) {
    if (empty.length) {
      const msg =
        'Refusing to decrease baselines: ' +
        `${empty.join(', ')} scanned as empty, so the improvement may be an unrendered route.`
      console.error(msg)
      summaryLines.push('', msg, '')
    } else {
      const updates: Record<string, RuleSnapshot> = {}
      const details: string[] = []
      const logParts: string[] = []
      for (const [rule, { from, to, snapshot }] of Object.entries(decreasedBaselines)) {
        updates[rule] = snapshot
        details.push(`- \`${rule}\`: ${from} -> ${to}`)
        logParts.push(`${rule}: ${from} -> ${to}`)
      }
      writeBaselines(args.metadata, updates, true)
      summaryLines.push('', 'Baselines decreased for improved rules:', ...details, '')
      console.log(`Baselines decreased for improved rules: ${logParts.join(', ')}`)
    }
  }

  writeSummary(summaryLines.join('\n'))

  if (failed) {
    if (stderr && stderr.trim()) console.error('\nScan stderr:\n', stderr)
    return 1
  }

  console.log(
    improvedRules.length > 0
      ? 'Nice! Some rules improved.'
      : 'Stable: No regressions for selected rules.'
  )
  return 0
}

function describeRouteRegression(
  baselineRoutes: Record<string, number>,
  currentRoutes: Record<string, number>,
  baselineHasRoutes: boolean
): string {
  if (baselineHasRoutes) {
    const entries = Object.entries(currentRoutes)
      .map(([route, count]) => ({ route, delta: count - (baselineRoutes[route] ?? 0) }))
      .filter(({ delta }) => delta > 0)
      .sort((a, b) => b.delta - a.delta || a.route.localeCompare(b.route))

    if (!entries.length) return ''

    return formatRouteList(
      entries.map(({ route, delta }) => `${route} (+${delta})`),
      MAX_ROUTES
    )
  }

  const currentEntries = Object.entries(currentRoutes)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([route, count]) => `${route} (${count} current)`)

  if (!currentEntries.length) return ''

  return formatRouteList(currentEntries, MAX_ROUTES)
}

function formatRouteList(entries: string[], maxRoutes: number): string {
  if (entries.length <= maxRoutes) {
    return entries.join(', ')
  }
  const remainder = entries.length - maxRoutes
  const plural = remainder === 1 ? 'route' : 'routes'
  return `${entries.slice(0, maxRoutes).join(', ')}, +${remainder} more ${plural}`
}

function main(): void {
  process.exit(runAxeRatchet(process.argv, readScanResults))
}

if (process.argv[1]) {
  const invokedPath = pathToFileURL(path.resolve(process.argv[1])).href
  if (import.meta.url === invokedPath) {
    main()
  }
}
