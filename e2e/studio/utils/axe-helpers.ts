import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import type { Result } from 'axe-core'

import {
  blockingViolations as blockingViolationsFor,
  scanExcluding,
  scanRegion,
  shouldEnforceAll,
  unloadedResult as unloadedResultFor,
  WCAG_TAGS,
  type A11yScanResult,
} from '../../shared/a11y.ts'

export const MAIN_SELECTOR = '#main'

export const SIDEBAR_SELECTOR = '[data-sidebar="sidebar"]'

export const HEADER_SELECTOR = 'header'

// The app shell is byte-identical on every route, so route scans carve it out
// and it gets its own pass on one route instead of being counted ten times.
export const SHELL_SELECTORS = [SIDEBAR_SELECTOR, HEADER_SELECTOR]

// Landmark, region, and heading-order rules are axe best practices rather than
// WCAG failures, so the WCAG tags alone would never run them.
export const SCAN_TAGS = [...WCAG_TAGS, 'best-practice']

// Rules that need a rendered node subtree. Safe to run inside a region scan.
export const CONTENT_RULES = [
  'aria-required-children',
  'aria-required-parent',
  'color-contrast',
  'duplicate-id-aria',
  'heading-order',
  'label',
  'nested-interactive',
  'region',
  'scrollable-region-focusable',
]

// Rules that judge the document as a whole. Inside a region scan they either
// find nothing to match or report against a document that isn't really there.
export const STRUCTURE_RULES = [
  'landmark-banner-is-top-level',
  'landmark-complementary-is-top-level',
  'landmark-contentinfo-is-top-level',
  'landmark-main-is-top-level',
  'landmark-no-duplicate-banner',
  'landmark-no-duplicate-contentinfo',
  'landmark-no-duplicate-main',
  'landmark-one-main',
  'landmark-unique',
  'page-has-heading-one',
]

// Scanned, reported, and counted by the ratchet. Growing the count fails a PR;
// the existing count does not.
export const RATCHETED_RULES = [...CONTENT_RULES, ...STRUCTURE_RULES].sort()

// Studio is a single-page app behind one HTML shell, so document-level rules
// would report the same finding on all twelve scan units.
export const EXCLUDED_RULES = [
  'aria-hidden-body',
  'css-orientation-lock',
  'document-title',
  'html-has-lang',
  'html-lang-valid',
  'html-xml-lang-mismatch',
  'meta-refresh',
  'meta-viewport',
]

// Rules that fail the spec outright, as opposed to the ratcheted rules above,
// which are only reported. Deliberately empty: every ratcheted rule that fires
// at all fires on markup no single PR introduced, so blocking on one would fail
// pull requests for pre-existing findings. `heading-order` and
// `page-has-heading-one` are the clearest cases — Docs enforces both because
// Docs resolved its heading hierarchy, and Studio has not. The ratchet is what
// holds the line here. `A11Y_ENFORCE_ALL=1` escalates everything for a local
// triage run.
export const ENFORCED_RULES: string[] = []

export interface AxeArtifact extends A11yScanResult {
  scannedRules: string[]
}

export const AXE_RESULTS_DIR = path.resolve(import.meta.dirname, '..', 'axe-results')

export async function scanRoute(page: Page, surface: string): Promise<AxeArtifact> {
  const result = await scanExcluding(page, {
    surface,
    exclude: SHELL_SELECTORS,
    excludeRules: EXCLUDED_RULES,
    tags: SCAN_TAGS,
  })

  return { ...result, scannedRules: RATCHETED_RULES }
}

export async function scanShellRegion(
  page: Page,
  surface: string,
  include: string
): Promise<AxeArtifact> {
  const result = await scanRegion(page, {
    surface,
    include,
    enforcedRules: CONTENT_RULES,
    excludeRules: EXCLUDED_RULES,
    tags: SCAN_TAGS,
  })

  return { ...result, scannedRules: CONTENT_RULES }
}

export function unloadedResult(
  surface: string,
  url: string,
  status: number | null,
  include: string
): AxeArtifact {
  return { ...unloadedResultFor(surface, url, status, include, EXCLUDED_RULES), scannedRules: [] }
}

// One file per scan unit. Playwright workers write concurrently, so a single
// shared file would interleave.
export function writeArtifact(result: AxeArtifact): void {
  mkdirSync(AXE_RESULTS_DIR, { recursive: true })
  const name = result.surface.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  writeFileSync(
    path.join(AXE_RESULTS_DIR, `${name || 'scan'}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8'
  )
}

export function blockingViolations(result: AxeArtifact): Result[] {
  return blockingViolationsFor(result, ENFORCED_RULES)
}

export type { A11yScanResult }
export {
  annotate,
  attachScanReport,
  MIN_MEANINGFUL_ELEMENTS,
  scanLooksEmpty,
  WCAG_TAGS,
} from '../../shared/a11y.ts'
export { shouldEnforceAll }
export { formatViolations, settleForAxe, violationIds } from '../../shared/axe.ts'
