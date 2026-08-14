import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ConfigurationDriftPage,
  ConfigurationDriftPageSkeleton,
  ConfigurationDriftResults,
} from './ConfigurationDriftPage'
import { customRender } from '@/tests/lib/custom-render'

const { driftHookMock, refetchMock } = vi.hoisted(() => ({
  driftHookMock: vi.fn(),
  refetchMock: vi.fn(),
}))

vi.mock('@/hooks/misc/useGitHubConfigDrift', () => ({
  useSelectedGitHubConfigDrift: driftHookMock,
}))

const redirectUrlRow = {
  status: 'drifted' as const,
  section: 'auth' as const,
  fieldName: 'URI_ALLOW_LIST',
  configPath: 'auth.additional_redirect_urls',
  dashboardValue: ['https://dashboard.example.com'],
  githubValue: ['https://config.example.com'],
  settingLabel: 'Redirect URLs',
  settingHref: '/project/project-ref/auth/url-configuration',
  valueDiff: {
    kind: 'list' as const,
    onlyInDashboard: ['https://dashboard.example.com'],
    onlyInConfig: ['https://config.example.com'],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  refetchMock.mockResolvedValue([])
})

describe('ConfigurationDriftPageSkeleton', () => {
  it('reserves the source and results regions while loading', () => {
    customRender(<ConfigurationDriftPageSkeleton />)

    const skeleton = screen.getByLabelText('Loading configuration drift')
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
    expect(skeleton.children).toHaveLength(2)
  })
})

describe('ConfigurationDriftResults', () => {
  it('shows semantic URL differences and a link to the setting', () => {
    customRender(<ConfigurationDriftResults rows={[redirectUrlRow]} />)

    expect(screen.getByText('1 setting differs')).toBeVisible()
    expect(screen.getByText('Only in current environment')).toBeVisible()
    expect(screen.getByText('https://dashboard.example.com')).toBeVisible()
    expect(screen.getByText('Only in config.toml')).toBeVisible()
    expect(screen.getByText('https://config.example.com')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open setting' })).toHaveAttribute(
      'href',
      '/project/project-ref/auth/url-configuration'
    )
  })
})

describe('ConfigurationDriftPage source resolution', () => {
  it('shows the source repository and branch, with a working refresh action', () => {
    driftHookMock.mockReturnValue({
      requestedGitBranch: undefined,
      source: {
        repository: 'example/project',
        branch: 'main',
        path: 'supabase/config.toml',
        format: 'toml',
        sha: 'source-sha',
        htmlUrl: 'https://github.com/example/project/blob/main/supabase/config.toml',
      },
      hasSourceBranchFallback: false,
      summary: { managedCount: 0, driftedFields: [] },
      unmanagedFields: [],
      isReady: true,
      isPending: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch: refetchMock,
    })

    customRender(<ConfigurationDriftPage />)

    expect(
      screen.getByRole('link', { name: 'config.toml on GitHub (opens in new tab)' })
    ).toHaveAttribute('href', 'https://github.com/example/project/blob/main/supabase/config.toml')
    expect(
      screen.getByRole('link', { name: 'example/project repository (opens in new tab)' })
    ).toHaveAttribute('href', 'https://github.com/example/project')
    expect(
      screen.getByRole('link', { name: 'main source branch (opens in new tab)' })
    ).toHaveAttribute('href', 'https://github.com/example/project/tree/main')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(refetchMock).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a fallback source branch notice when the requested branch config was not found', () => {
    driftHookMock.mockReturnValue({
      requestedGitBranch: 'feat/google-auth.v2',
      source: {
        repository: 'example/project',
        branch: 'main',
        path: 'supabase/config.toml',
        format: 'toml',
        sha: 'source-sha',
        htmlUrl: 'https://github.com/example/project/blob/main/supabase/config.toml',
      },
      hasSourceBranchFallback: true,
      summary: { managedCount: 0, driftedFields: [] },
      unmanagedFields: [],
      isReady: true,
      isPending: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch: refetchMock,
    })

    customRender(<ConfigurationDriftPage />)

    const fallbackNotice = screen.getByRole('status')
    expect(fallbackNotice).toHaveTextContent('Requested branch config was not found.')
    expect(fallbackNotice).toHaveTextContent('feat/google-auth.v2')
    expect(fallbackNotice).toHaveTextContent('main')
    expect(fallbackNotice).toHaveTextContent('supabase/config.toml')
  })
})

describe('ConfigurationDriftPage states', () => {
  it('shows a skeleton while pending', () => {
    driftHookMock.mockReturnValue({
      source: undefined,
      summary: { managedCount: 0, driftedFields: [] },
      unmanagedFields: [],
      isReady: false,
      isPending: true,
      isFetching: true,
      isError: false,
      error: undefined,
      refetch: refetchMock,
    })

    customRender(<ConfigurationDriftPage />)

    expect(screen.getByLabelText('Loading configuration drift')).toBeVisible()
  })

  it('shows an error state with a retry action', () => {
    driftHookMock.mockReturnValue({
      source: undefined,
      summary: { managedCount: 0, driftedFields: [] },
      unmanagedFields: [],
      isReady: false,
      isPending: false,
      isFetching: false,
      isError: true,
      error: new Error('Failed to load'),
      refetch: refetchMock,
    })

    customRender(<ConfigurationDriftPage />)

    expect(screen.getByText('Could not check configuration drift')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(refetchMock).toHaveBeenCalledOnce()
  })

  it('explains when there are no comparable settings', () => {
    driftHookMock.mockReturnValue({
      source: undefined,
      summary: { managedCount: 0, driftedFields: [] },
      unmanagedFields: [],
      isReady: true,
      isPending: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch: refetchMock,
    })

    customRender(<ConfigurationDriftPage />)

    expect(screen.getByText('No comparable settings found')).toBeVisible()
  })

  it('explains when every comparable setting matches', () => {
    driftHookMock.mockReturnValue({
      source: undefined,
      summary: { managedCount: 2, driftedFields: [] },
      unmanagedFields: [],
      isReady: true,
      isPending: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch: refetchMock,
    })

    customRender(<ConfigurationDriftPage />)

    expect(screen.getByText('All compared settings match')).toBeVisible()
  })

  it('lists every drifted setting for the current environment', () => {
    driftHookMock.mockReturnValue({
      source: undefined,
      summary: {
        managedCount: 0,
        driftedFields: [
          {
            section: 'auth',
            fieldName: 'URI_ALLOW_LIST',
            configPath: 'auth.additional_redirect_urls',
            settingHref: (ref: string) => `/project/${ref}/auth/url-configuration`,
            dashboardValue: ['https://dashboard.example.com'],
            githubValue: ['https://config.example.com'],
          },
          {
            section: 'auth',
            fieldName: 'SITE_URL',
            configPath: 'auth.site_url',
            settingHref: (ref: string) => `/project/${ref}/auth/url-configuration`,
            dashboardValue: 'https://dashboard.example.com',
            githubValue: 'https://site.config.example.com',
          },
        ],
      },
      unmanagedFields: [],
      isReady: true,
      isPending: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch: refetchMock,
    })

    customRender(<ConfigurationDriftPage />)

    expect(screen.getByText('2 settings differ')).toBeVisible()
    const siteUrlRow = screen.getByText('Site URL').closest('article')
    expect(siteUrlRow).not.toBeNull()
    expect(within(siteUrlRow!).getByText('https://site.config.example.com')).toBeVisible()
    expect(screen.getByText('Redirect URLs')).toBeVisible()
  })

  it('lists unmanaged fields grouped by section in a collapsed disclosure', async () => {
    driftHookMock.mockReturnValue({
      source: undefined,
      summary: { managedCount: 1, driftedFields: [] },
      unmanagedFields: [
        { section: 'database', fieldName: 'ssl_enforced', dashboardValue: true },
        { section: 'pooler', fieldName: 'pool_mode', dashboardValue: 'transaction' },
      ],
      isReady: true,
      isPending: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch: refetchMock,
    })

    customRender(<ConfigurationDriftPage />)

    const trigger = screen.getByText('Not tracked in config.toml (2)')
    expect(trigger).toBeVisible()
    expect(screen.queryByText('Ssl Enforced')).not.toBeInTheDocument()

    fireEvent.click(trigger)

    expect(await screen.findByText('Ssl Enforced')).toBeVisible()
    expect(screen.getByText('Pool Mode')).toBeVisible()
    expect(screen.getByText('Database')).toBeVisible()
    expect(screen.getByText('Pooler')).toBeVisible()
  })
})
