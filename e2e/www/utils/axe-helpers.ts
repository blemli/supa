import type { Page } from '@playwright/test'
import type { Result } from 'axe-core'

import {
  blockingViolations as blockingViolationsFor,
  scanExcluding,
  scanRegion,
  unloadedResult as unloadedResultFor,
  type A11yScanResult,
} from '../../shared/a11y.ts'
import { scan } from '../../shared/axe.ts'
import { PAGE_SELECTOR } from './www-selectors.ts'

// Worth reporting but outside the WCAG tag sweep, which covers wcag2a/wcag2aa
// only. Reported, never blocking.
export const EXTRA_REPORTED_RULES = ['heading-order']

// Every template renders its `<h1>` outside the article wrapper, so this runs
// against the page landmark rather than the article.
export const ENFORCED_RULES = ['page-has-heading-one']

export const EXCLUDED_RULES = [
  'color-contrast',
  'html-has-lang',
  'html-lang-valid',
  'html-xml-lang-mismatch',
  'document-title',
  'aria-hidden-body',
  'meta-viewport',
  'meta-refresh',
  'css-orientation-lock',
]

export async function scanArticle(
  page: Page,
  surface: string,
  include: string
): Promise<A11yScanResult> {
  const result = await scanRegion(page, {
    surface,
    include,
    enforcedRules: EXTRA_REPORTED_RULES,
    excludeRules: EXCLUDED_RULES,
  })

  const pageViolations = await scan(page, { rules: ENFORCED_RULES, include: PAGE_SELECTOR })

  return { ...result, violations: [...result.violations, ...pageViolations] }
}

// Chrome ships on every www page, so a rule only moves in here once it is clean
// across the whole global-element page list. These are the WCAG 2.1 A/AA rules
// that apply to every page in that list and pass today. `document-title`,
// `html-has-lang`, `html-lang-valid`, and `meta-viewport` are unreachable from
// an article-scoped scan and only become testable here.
export const GLOBAL_ELEMENTS_ENFORCED_RULES = [
  'aria-allowed-attr',
  'aria-conditional-attr',
  'aria-deprecated-role',
  'aria-hidden-body',
  'aria-prohibited-attr',
  'aria-required-attr',
  'aria-roles',
  'aria-valid-attr',
  'aria-valid-attr-value',
  'avoid-inline-spacing',
  'button-name',
  'bypass',
  'document-title',
  'form-field-multiple-labels',
  'html-has-lang',
  'html-lang-valid',
  'image-alt',
  'label',
  'list',
  'listitem',
  'meta-viewport',
  'svg-img-alt',
]

// Best practice rather than WCAG, so these sit outside the tag sweep and need
// their own pass. Reported, never blocking: www has not resolved its heading
// hierarchy, and the footer `h6` under the screen-reader-only `h2` would fail
// nearly every content pull request.
export const GLOBAL_ELEMENTS_EXTRA_REPORTED_RULES = ['heading-order', 'landmark-unique']

// Nothing is excluded, which inverts the article scan: `color-contrast` and the
// `<html>`-level rules are only reachable once the scan covers the document.
export const GLOBAL_ELEMENTS_EXCLUDED_RULES: string[] = []

// The document minus the article wrapper, so findings land on chrome and page
// scaffolding rather than on content the page scan already covers.
export async function scanGlobalElements(
  page: Page,
  surface: string,
  exclude: string[]
): Promise<A11yScanResult> {
  const result = await scanExcluding(page, {
    surface,
    exclude,
    excludeRules: GLOBAL_ELEMENTS_EXCLUDED_RULES,
  })

  const extra = await scan(page, { rules: GLOBAL_ELEMENTS_EXTRA_REPORTED_RULES, exclude })
  const byRule = new Map(
    [...result.violations, ...extra].map((violation) => [violation.id, violation])
  )

  return { ...result, violations: [...byRule.values()] }
}

export function unloadedResult(
  surface: string,
  url: string,
  status: number | null,
  include: string
): A11yScanResult {
  return unloadedResultFor(surface, url, status, include, EXCLUDED_RULES)
}

export function unloadedGlobalElementsResult(
  surface: string,
  url: string,
  status: number | null
): A11yScanResult {
  return unloadedResultFor(surface, url, status, 'document', GLOBAL_ELEMENTS_EXCLUDED_RULES)
}

export function blockingGlobalElementViolations(result: A11yScanResult): Result[] {
  return blockingViolationsFor(result, GLOBAL_ELEMENTS_ENFORCED_RULES)
}

export function blockingViolations(result: A11yScanResult): Result[] {
  return blockingViolationsFor(result, ENFORCED_RULES)
}

export type { A11yScanResult }
export {
  annotate,
  attachScanReport,
  dedupeViolations,
  MIN_MEANINGFUL_ELEMENTS,
  scanLooksEmpty,
  shouldEnforceAll,
  WCAG_TAGS,
} from '../../shared/a11y.ts'
export { formatViolations, settleForAxe, violationIds } from '../../shared/axe.ts'
