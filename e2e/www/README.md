# WWW E2E tests

This guide explains how to run Playwright end-to-end checks against marketing
site content pages.

Use this suite when you change blog posts, events, customer stories, or
alternatives pages under `apps/www`. It loads each in-scope page, checks that it
returns a successful status, and scans it for a single accessibility rule.

This page covers:

- [Set up](#set-up) — install the browser once
- [Run the tests](#run-the-tests) — the usual local command
- [Choose a target URL](#choose-a-target-url) — production, preview, or local www
- [Override which pages run](#override-which-pages-run) — when the default git
  scope is wrong
- [What the suite covers](#what-the-suite-covers) — in-scope paths and limits
- [Debug failures](#debug-failures) — reports and traces
- [How CI uses this suite](#how-ci-uses-this-suite) — pull request behavior

## Set up

1. From this directory, install the Playwright Chromium browser once:

   ```bash
   cd e2e/www
   pnpm exec playwright install chromium
   ```

## Run the tests

By default, `pnpm e2e:www` tests pages affected by your current changes: commits
since `origin/master`, plus staged and unstaged working-tree files. If nothing
in scope changed, the command exits successfully without starting Playwright.

1. From the repository root, point the suite at a deployed site and run it:

   ```bash
   PLAYWRIGHT_BASE_URL=https://supabase.com pnpm e2e:www
   ```

Extra arguments pass through to Playwright, so `pnpm e2e:www --ui` opens UI mode
and `pnpm e2e:www --grep @a11y` runs only the accessibility assertions.

### Run every in-scope page

To test every content page instead of a changed-files scope — for example, a
periodic full-site check — run:

```bash
PLAYWRIGHT_BASE_URL=https://supabase.com pnpm e2e:www:all
```

This ignores `WWW_E2E_PAGE_PATHS` and the 20-page cap described in
[Limits](#limits), and tests every page across all four content directories —
around 480 as of this writing. `--all` runs also default to
`--max-failures=0`, so a full run isn't cut short by `playwright.config.ts`'s
global `maxFailures: 3`. The suite runs one worker by default, so pass
`--workers` to parallelize it:

```bash
PLAYWRIGHT_BASE_URL=https://supabase.com pnpm e2e:www:all -- --workers=4
```

Against production, raising workers does not pay off: a serial full run finishes
in about 17 minutes with no failures, while four workers took longer and timed
out on 34 of 480 navigations. Those timeouts are load, not page defects. Prefer
the default single worker unless you are pointed at a preview or a local server.

## Choose a target URL

Tests use `PLAYWRIGHT_BASE_URL`. When unset, they default to the local www dev
server at `http://localhost:3000`.

Prefer a deployed site for day-to-day checks. Use the local server only when you
need unpublished content that production does not serve yet.

For a protected Vercel preview, also set `VERCEL_AUTOMATION_BYPASS_SECRET`.

To use the local server, start it with `pnpm dev:www` from the repository root
and run the suite without `PLAYWRIGHT_BASE_URL`.

## Override which pages run

Leave `WWW_E2E_PAGE_PATHS` unset to keep the default changed-files scope.

To test specific pages instead of the git diff:

```bash
WWW_E2E_PAGE_PATHS=/blog/supabase-steve-chavez \
  PLAYWRIGHT_BASE_URL=https://supabase.com pnpm e2e:www
```

`WWW_E2E_PAGE_PATHS` accepts a comma- or newline-separated list of
site-relative paths. `WWW_E2E_BASE_REF` overrides the base ref the git diff
compares against.

## What the suite covers

### In scope

| Changed path                   | Behavior                    |
| ------------------------------ | --------------------------- |
| `apps/www/_blog/*.mdx`         | Test `/blog/<slug>`         |
| `apps/www/_events/*.mdx`       | Test `/events/<slug>`       |
| `apps/www/_customers/*.mdx`    | Test `/customers/<slug>`    |
| `apps/www/_alternatives/*.mdx` | Test `/alternatives/<slug>` |

Slugs come from the filename, matching `getAllPostSlugs` in
`apps/www/lib/posts.tsx`. Blog and event filenames drop their `YYYY-MM-DD-`
prefix; customers and alternatives use the filename as-is.

Each page gets one test: it must return a successful status, and an axe scan
must report no `page-has-heading-one` violations. That is the only rule enforced
today — add more to `ENFORCED_RULES` in `utils/axe-helpers.ts` once a class of
issue reaches zero across the site.

`heading-order` is scanned but never blocking. Article scoping already puts the
two site-wide offenders out of reach — the footer `h6` sits outside `<main>`, and
the blog related-posts `h4` sits below the article wrapper. The alternatives
template still has one inside its article, so enforcing the rule would fail every
alternatives pull request. It stays in `EXTRA_REPORTED_RULES` until that is fixed.

### Out of scope

- Events with `disable_page_build: true`, which return a 404 by design
- Static marketing routes under `apps/www/pages` and `apps/www/app`
- Index and listing pages such as `/blog` and `/customers`, for the page suite.
  The global-element suite covers them.
- Link checking

Shared chrome — the nav, the footer, and everything else outside the article
wrapper — belongs to the global-element suite described in
[Scan global elements](#scan-global-elements).

### Limits

Resolved scope is capped at 20 pages so a large content drop cannot explode
runtime. If a change resolves to more pages than that, only the first 20 in
sorted order are tested. To test beyond the cap, use `pnpm e2e:www:all` or set
`WWW_E2E_PAGE_PATHS` explicitly.

## Accessibility scans

The `@a11y`-tagged test scans each in-scope page for WCAG 2.1 A/AA violations using
`@axe-core/playwright`, limited to the article wrapper for that template.

```bash
PLAYWRIGHT_BASE_URL=https://supabase.com pnpm e2e:www:a11y
```

Which pages get scanned comes from your branch, but the content comes from
whatever you point `PLAYWRIGHT_BASE_URL` at. Production won't have your edits and
will 404 on a page you just added, so use your pull request's preview to scan your
own content.

Findings are reported, not enforced. Only `ENFORCED_RULES` in `utils/axe-helpers.ts`
fails the build; everything else lands as a warning annotation and in the
`axe-results.json` attachment on the run. Set `A11Y_ENFORCE_ALL=1` to make every
finding blocking locally.

`wwwArticleSelectorForPagePath` in `utils/www-selectors.ts` maps each route prefix
to its wrapper. The four content templates each wrap their body differently, so a
route outside those four throws rather than guessing.

`page-has-heading-one` runs against `<main id="main">` rather than the article.
Blog and event templates render their `<h1>` outside the article wrapper, so an
article-scoped scan would report a false violation on every one of those pages.

`EXCLUDED_RULES` lists the rules the scan skips. `color-contrast` is most of the
scan time and finds nothing inside an article, since www contrast comes from shared
tokens and chrome. The rest target `<html>`, `<head>`, and `<body>`, which an
article-scoped scan can't reach.

Cross-origin frames are skipped, so a third-party embed isn't reported as ours.

Event articles are short enough that a scan can fall under the 20-element floor and
warn that a clean result proves nothing. That reflects the template, not a broken
run.

Not covered by the page scan: shared chrome, listing pages, and most of WCAG.
Keyboard navigation, focus management, and screen reader behavior need manual
testing.

### Scan global elements

The page scan stops at the article wrapper. The global-element suite covers the
other half — the nav, the footer, and the rest of the page scaffolding:

```bash
PLAYWRIGHT_BASE_URL=https://supabase.com pnpm e2e:www:global-elements
```

It scans a fixed list of eight pages, one per layout, at both a 1280x800 desktop
and a 390x844 mobile viewport, plus one pass with the mobile menu open. The list
lives in `utils/www-global-elements.ts` and resolves nothing from your git diff,
so the same chrome gets scanned no matter what you changed.

Each scan covers the document with that page's article wrapper excluded. Listing
pages and `/` render no article, so they declare `articleSelector: null` rather
than excluding a selector that matches nothing — excluding nothing would
silently widen the scan back to the whole page.

Chrome ships on every page, so the enforced set is stricter here than for
content. `GLOBAL_ELEMENTS_ENFORCED_RULES` holds the WCAG 2.1 A/AA rules that
apply to every page in the list and pass today; a failure there is a regression
in markup every visitor sees. Rules that apply to only some pages, and rules
with findings today, stay reported.

This inverts the page scan's exclusions. `document-title`, `html-has-lang`,
`html-lang-valid`, and `meta-viewport` are unreachable from an article-scoped
scan and become enforceable here. `color-contrast` is reachable too, and it is
about three quarters of axe's runtime — worth paying, because this is the only
suite that checks www contrast at all.

`GLOBAL_ELEMENTS_EXTRA_REPORTED_RULES` holds `heading-order` and
`landmark-unique`. Both are axe best-practice rules rather than WCAG, so they
need a pass of their own, and both are reported and never blocking:

- The footer's `h6` headings sit under a screen-reader-only `h2`, which is a
  `heading-order` skip on every www page. Enforcing it would fail nearly every
  content pull request.
- The event template nests a `<main>` inside the layout's `<main id="main">`,
  which `landmark-unique` reports on every event page.

`dedupeViolations` collapses repeats, so a finding in shared chrome reports once
per worker instead of once per page per viewport.

Element presence is asserted softly, so a missing nav still reports its scan
instead of hiding it behind a hard failure.

Point this suite at your pull request's preview, not production, whenever you
change chrome — the `data-testid` hooks it looks for only exist on branches that
carry them.

## Debug failures

1. Open the HTML report after a run:

   ```bash
   pnpm -C e2e/www exec playwright show-report
   ```

2. Inspect traces and screenshots under `test-results/` for failed runs. The
   global-element suite writes to `test-results-global-elements/` and
   `playwright-report-global-elements/` instead, so the two runs never overwrite
   each other's output.

## How CI uses this suite

The workflow at `.github/workflows/www-e2e.yml` runs both suites in one job, each
behind its own paths filter.

The page suite runs on pull requests that touch owned www content, `e2e/www`, or
`e2e/shared`.

1. Diff the pull request against its base branch and resolve in-scope page paths.
2. Skip Playwright when nothing in scope changed.
3. When `apps/www` changed, wait for the Vercel www preview and set
   `PLAYWRIGHT_BASE_URL` to that preview. When no preview resolves, skip rather
   than test against production, which does not have pages the pull request adds.
4. Run the suite with `WWW_E2E_PAGE_PATHS` set to the resolved list.

The global-element suite runs on pull requests that touch `apps/www/components`,
`apps/www/layouts`, the app shell, or the harness. A content-only pull request
never reaches it.

1. Reuse the same preview when one resolved.
2. Fall back to production when no preview resolved and the pull request changes
   no `apps/www` files. A harness-only change ships no markup, so production is
   the same surface.
3. Skip when no preview resolved and the pull request does change `apps/www`,
   because production would not have those chrome changes.

Draft pull requests stay skipped until you mark them ready for review. Manual
`workflow_dispatch` runs accept an optional `base_url`, which defaults to
production, and require a `page_paths` input for the page suite only.

## Shared helpers

`e2e/shared` holds the pieces this suite and `e2e/docs` both use: git diff
collection, page-path parsing, the runner, and the scope-resolver CLI. Suite
directories keep only what is specific to them — for www, that is the
content-file-to-URL mapping in `utils/resolve-www-scope.ts`.
