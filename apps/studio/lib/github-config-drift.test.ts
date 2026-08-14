import { describe, expect, it } from 'vitest'

import { getConfigDriftSummary, getConfigFieldState } from './github-config-drift'

const authGithubConfig = {
  auth: {
    email: { enable_signup: true },
    sms: { enable_confirmations: false },
    external: {
      github: { enabled: true, client_id: 'github-client', secret: 'do-not-compare' },
    },
  },
}

describe('getConfigFieldState (auth)', () => {
  it('maps global and external Auth fields to config paths', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'EXTERNAL_GITHUB_CLIENT_ID',
        dashboardValue: 'github-client',
        githubConfig: authGithubConfig,
      })
    ).toMatchObject({ configPath: 'auth.external.github.client_id' })

    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'EXTERNAL_LINKEDIN_OIDC_CLIENT_ID',
        dashboardValue: undefined,
        githubConfig: authGithubConfig,
      })
    ).toMatchObject({ status: 'unmanaged' })
  })

  it('marks matching dashboard values as managed', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'EXTERNAL_GITHUB_CLIENT_ID',
        dashboardValue: 'github-client',
        githubConfig: authGithubConfig,
      })
    ).toEqual({
      status: 'managed',
      configPath: 'auth.external.github.client_id',
      settingHref: expect.any(Function),
      githubValue: 'github-client',
    })
  })

  it('compares redirect URLs as a trimmed, deduplicated, order-insensitive set', () => {
    const config = {
      auth: {
        additional_redirect_urls: [
          'https://app.example.com/auth/callback',
          'https://preview.example.com/auth/callback',
        ],
      },
    }

    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'URI_ALLOW_LIST',
        dashboardValue:
          ' https://preview.example.com/auth/callback,https://app.example.com/auth/callback,https://app.example.com/auth/callback ',
        githubConfig: config,
      })
    ).toMatchObject({ status: 'managed' })

    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'URI_ALLOW_LIST',
        dashboardValue: 'https://app.example.com/auth/callback',
        githubConfig: config,
      })
    ).toMatchObject({ status: 'drifted' })
  })

  it('treats matching site URLs as managed', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'SITE_URL',
        dashboardValue: 'https://app.example.com',
        githubConfig: { auth: { site_url: 'https://app.example.com' } },
      })
    ).toMatchObject({ status: 'managed' })
  })

  it('marks different dashboard values as drifted', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'EXTERNAL_GITHUB_ENABLED',
        dashboardValue: false,
        githubConfig: authGithubConfig,
      })
    ).toMatchObject({ status: 'drifted', githubValue: true })
  })

  it('compares the normalized phone-confirmation form value', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'SMS_AUTOCONFIRM',
        dashboardValue: false,
        githubConfig: authGithubConfig,
      })
    ).toMatchObject({ status: 'managed', githubValue: false })
  })

  it('does not classify secrets or absent config fields', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'EXTERNAL_GITHUB_SECRET',
        dashboardValue: 'masked',
        githubConfig: authGithubConfig,
      })
    ).toEqual({ status: 'unmanaged' })
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'EXTERNAL_GITLAB_ENABLED',
        dashboardValue: false,
        githubConfig: authGithubConfig,
      })
    ).toEqual({ status: 'unmanaged' })
  })

  it('treats missing fields with known defaults as governed by code-owned config', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'SITE_URL',
        dashboardValue: 'https://app.example.com',
        githubConfig: { config_source: 'code', auth: {} },
      })
    ).toMatchObject({
      status: 'drifted',
      configPath: 'auth.site_url',
      githubValue: 'http://localhost:3000',
    })

    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'URI_ALLOW_LIST',
        dashboardValue: 'https://app.example.com/callback',
        githubConfig: { config_source: 'code', auth: {} },
      })
    ).toMatchObject({
      status: 'drifted',
      configPath: 'auth.additional_redirect_urls',
      githubValue: [],
    })
  })

  it('leaves missing fields unmanaged when the current environment uses the default', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'SITE_URL',
        dashboardValue: 'http://localhost:3000',
        githubConfig: { config_source: 'code', auth: {} },
      })
    ).toEqual({ status: 'unmanaged' })

    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'URI_ALLOW_LIST',
        dashboardValue: '',
        githubConfig: { config_source: 'code', auth: {} },
      })
    ).toEqual({ status: 'unmanaged' })
  })

  it('does not audit missing fields unless the root config declares code ownership', () => {
    for (const config_source of [undefined, 'remote']) {
      expect(
        getConfigFieldState({
          section: 'auth',
          fieldName: 'SITE_URL',
          dashboardValue: 'https://app.example.com',
          githubConfig: { config_source, auth: {} },
        })
      ).toEqual({ status: 'unmanaged' })
    }
  })

  it('does not infer a governed state for fields without a known hosted default', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'EXTERNAL_GITHUB_ENABLED',
        dashboardValue: true,
        githubConfig: { config_source: 'code', auth: {} },
      })
    ).toEqual({ status: 'unmanaged' })

    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'EXTERNAL_GITHUB_SECRET',
        dashboardValue: 'masked',
        githubConfig: { config_source: 'code', auth: {} },
      })
    ).toEqual({ status: 'unmanaged' })
  })

  it('preserves true drift semantics for paths that are present in config', () => {
    expect(
      getConfigFieldState({
        section: 'auth',
        fieldName: 'SITE_URL',
        dashboardValue: 'https://live.example.com',
        githubConfig: {
          config_source: 'code',
          auth: { site_url: 'https://config.example.com' },
        },
      })
    ).toMatchObject({
      status: 'drifted',
      configPath: 'auth.site_url',
      githubValue: 'https://config.example.com',
    })
  })
})

describe('getConfigFieldState (api, storage, and unmapped sections)', () => {
  it('compares api.max_rows directly', () => {
    expect(
      getConfigFieldState({
        section: 'api',
        fieldName: 'max_rows',
        dashboardValue: 1000,
        githubConfig: { api: { max_rows: 1000 } },
      })
    ).toMatchObject({ status: 'managed' })

    expect(
      getConfigFieldState({
        section: 'api',
        fieldName: 'max_rows',
        dashboardValue: 1000,
        githubConfig: { api: { max_rows: 500 } },
      })
    ).toMatchObject({ status: 'drifted', githubValue: 500 })
  })

  it('converts the config.toml file size string to bytes before comparing', () => {
    expect(
      getConfigFieldState({
        section: 'storage',
        fieldName: 'file_size_limit',
        dashboardValue: 50 * 1024 * 1024,
        githubConfig: { storage: { file_size_limit: '50MiB' } },
      })
    ).toMatchObject({ status: 'managed', githubValue: '50MiB' })

    expect(
      getConfigFieldState({
        section: 'storage',
        fieldName: 'file_size_limit',
        dashboardValue: 10 * 1024 * 1024,
        githubConfig: { storage: { file_size_limit: '50MiB' } },
      })
    ).toMatchObject({ status: 'drifted' })
  })

  it('treats fields outside the registry as unmanaged, regardless of section', () => {
    expect(
      getConfigFieldState({
        section: 'database',
        fieldName: 'ssl_enforced',
        dashboardValue: true,
        githubConfig: { database: {} },
      })
    ).toEqual({ status: 'unmanaged' })

    expect(
      getConfigFieldState({
        section: 'pooler',
        fieldName: 'pool_mode',
        dashboardValue: 'transaction',
        githubConfig: { db: { pooler: { pool_mode: 'transaction' } } },
      })
    ).toEqual({ status: 'unmanaged' })

    expect(
      getConfigFieldState({
        section: 'realtime',
        fieldName: 'max_channels_per_client',
        dashboardValue: 100,
        githubConfig: { realtime: { max_channels_per_client: 100 } },
      })
    ).toEqual({ status: 'unmanaged' })
  })
})

describe('getConfigDriftSummary', () => {
  it('summarizes only confirmed non-secret auth drift', () => {
    const summary = getConfigDriftSummary({
      dashboardConfig: {
        auth: {
          external_email_enabled: true,
          external_github_enabled: false,
          external_github_client_id: 'github-client',
          external_github_secret: 'different-secret',
        },
      },
      githubConfig: authGithubConfig,
    })

    expect(summary.managedCount).toBe(2)
    expect(summary.driftedFields).toMatchObject([
      {
        section: 'auth',
        fieldName: 'EXTERNAL_GITHUB_ENABLED',
        configPath: 'auth.external.github.enabled',
        dashboardValue: false,
        githubValue: true,
      },
    ])
    expect(summary.unmanagedFields).toEqual([
      { section: 'auth', fieldName: 'EXTERNAL_GITHUB_SECRET', dashboardValue: 'different-secret' },
    ])
  })

  it('summarizes missing code-owned values against their known defaults', () => {
    const summary = getConfigDriftSummary({
      dashboardConfig: {
        auth: {
          site_url: 'https://live.example.com',
          additional_redirect_urls: 'https://live.example.com/callback',
        },
      },
      githubConfig: { config_source: 'code', auth: {} },
    })

    expect(summary.managedCount).toBe(0)
    expect(summary.driftedFields).toMatchObject([
      {
        fieldName: 'SITE_URL',
        configPath: 'auth.site_url',
        dashboardValue: 'https://live.example.com',
        githubValue: 'http://localhost:3000',
      },
      {
        fieldName: 'URI_ALLOW_LIST',
        configPath: 'auth.additional_redirect_urls',
        dashboardValue: 'https://live.example.com/callback',
        githubValue: [],
      },
    ])
  })

  it('does not report drift until both configurations are available', () => {
    expect(
      getConfigDriftSummary({ dashboardConfig: { auth: { external_github_enabled: false } } })
    ).toEqual({ managedCount: 0, driftedFields: [], unmanagedFields: [] })
  })

  it('matches global boolean settings using config semantics', () => {
    const summary = getConfigDriftSummary({
      dashboardConfig: {
        auth: {
          disable_signup: false,
          external_anonymous_users_enabled: true,
          security_manual_linking_enabled: false,
          mailer_autoconfirm: false,
        },
      },
      githubConfig: {
        auth: {
          enable_signup: true,
          enable_anonymous_sign_ins: true,
          enable_manual_linking: false,
          email: { enable_confirmations: true },
        },
      },
    })

    expect(summary.managedCount).toBe(4)
    expect(summary.driftedFields).toEqual([])
  })

  it('compares every section, surfacing unregistered fields as unmanaged rather than dropping them', () => {
    const summary = getConfigDriftSummary({
      dashboardConfig: {
        api: { max_rows: 500, db_schema: 'public' },
        auth: { site_url: 'https://app.example.com' },
        database: { ssl_enforced: true },
        pooler: { pool_mode: 'transaction' },
        realtime: { max_channels_per_client: 100 },
        storage: { file_size_limit: 100, migration_version: 'v1' },
      },
      githubConfig: {
        api: { max_rows: 1000 },
        auth: { site_url: 'https://app.example.com' },
        storage: { file_size_limit: '50MiB' },
      },
    })

    expect(summary.managedCount).toBe(1)
    expect(summary.driftedFields).toMatchObject([
      { section: 'api', fieldName: 'max_rows', dashboardValue: 500, githubValue: 1000 },
      { section: 'storage', fieldName: 'file_size_limit', dashboardValue: 100 },
    ])
    expect(summary.unmanagedFields).toEqual([
      { section: 'api', fieldName: 'db_schema', dashboardValue: 'public' },
      { section: 'database', fieldName: 'ssl_enforced', dashboardValue: true },
      { section: 'pooler', fieldName: 'pool_mode', dashboardValue: 'transaction' },
      { section: 'realtime', fieldName: 'max_channels_per_client', dashboardValue: 100 },
      { section: 'storage', fieldName: 'migration_version', dashboardValue: 'v1' },
    ])
  })
})
