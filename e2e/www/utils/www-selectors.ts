export const BLOG_ARTICLE_SELECTOR = '[data-testid="sb-www-blog-main-article"]'
export const EVENT_ARTICLE_SELECTOR = '[data-testid="sb-www-event-main-article"]'
export const CUSTOMER_ARTICLE_SELECTOR = '[data-testid="sb-www-customer-main-article"]'
export const ALTERNATIVE_ARTICLE_SELECTOR = '[data-testid="sb-www-alternative-main-article"]'

// Every content template renders through Default.tsx, whose `<main id="main">`
// is also the skip link target.
export const PAGE_SELECTOR = '#main'

const ARTICLE_SELECTORS_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ['/blog/', BLOG_ARTICLE_SELECTOR],
  ['/events/', EVENT_ARTICLE_SELECTOR],
  ['/customers/', CUSTOMER_ARTICLE_SELECTOR],
  ['/alternatives/', ALTERNATIVE_ARTICLE_SELECTOR],
]

// Each content template wraps its body differently, and the four in-scope
// routes are the only ones with a wrapper to scan. Anything else is a caller
// bug rather than a page worth guessing at.
export function wwwArticleSelectorForPagePath(pagePath: string): string {
  const pathname = pagePath.startsWith('http') ? new URL(pagePath).pathname : pagePath

  for (const [prefix, selector] of ARTICLE_SELECTORS_BY_PREFIX) {
    if (pathname.startsWith(prefix)) return selector
  }

  throw new Error(
    `No article selector for "${pagePath}". This suite covers ${ARTICLE_SELECTORS_BY_PREFIX.map(
      ([prefix]) => prefix
    ).join(', ')} only.`
  )
}
