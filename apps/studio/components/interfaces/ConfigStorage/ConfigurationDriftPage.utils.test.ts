import { describe, expect, it } from 'vitest'

import {
  createConfigurationDriftRows,
  formatConfigFieldValue,
  groupUnmanagedConfigFields,
} from './ConfigurationDriftPage.utils'

const toUrlConfigHref = (projectRef: string) => `/project/${projectRef}/auth/url-configuration`
const toProvidersHref = (projectRef: string) => `/project/${projectRef}/auth/providers`
const toApiSettingsHref = (projectRef: string) => `/project/${projectRef}/settings/api`

describe('configuration drift page utilities', () => {
  it('creates labels and setting links for URL and provider drift', () => {
    expect(
      createConfigurationDriftRows(
        [
          {
            section: 'auth',
            fieldName: 'SITE_URL',
            configPath: 'auth.site_url',
            settingHref: toUrlConfigHref,
            dashboardValue: 'https://live.example.com',
            githubValue: 'https://config.example.com',
          },
          {
            section: 'auth',
            fieldName: 'EXTERNAL_GITHUB_CLIENT_ID',
            configPath: 'auth.external.github.client_id',
            settingHref: toProvidersHref,
            dashboardValue: 'live-client',
            githubValue: 'config-client',
          },
        ],
        'project-ref'
      )
    ).toMatchObject([
      {
        settingLabel: 'Site URL',
        settingHref: '/project/project-ref/auth/url-configuration',
        valueDiff: {
          kind: 'scalar',
          dashboardValue: 'https://live.example.com',
          configValue: 'https://config.example.com',
        },
      },
      {
        settingLabel: 'GitHub · Client ID',
        settingHref: '/project/project-ref/auth/providers',
      },
    ])
  })

  it('labels global Auth settings and routes them to the providers page', () => {
    expect(
      createConfigurationDriftRows(
        [
          {
            section: 'auth',
            fieldName: 'DISABLE_SIGNUP',
            configPath: 'auth.enable_signup',
            settingHref: toProvidersHref,
            dashboardValue: false,
            githubValue: true,
          },
          {
            section: 'auth',
            fieldName: 'EXTERNAL_ANONYMOUS_USERS_ENABLED',
            configPath: 'auth.enable_anonymous_sign_ins',
            settingHref: toProvidersHref,
            dashboardValue: false,
            githubValue: true,
          },
          {
            section: 'auth',
            fieldName: 'SECURITY_MANUAL_LINKING_ENABLED',
            configPath: 'auth.enable_manual_linking',
            settingHref: toProvidersHref,
            dashboardValue: false,
            githubValue: true,
          },
          {
            section: 'auth',
            fieldName: 'MAILER_AUTOCONFIRM',
            configPath: 'auth.email.enable_confirmations',
            settingHref: toProvidersHref,
            dashboardValue: false,
            githubValue: true,
          },
        ],
        'project-ref'
      )
    ).toMatchObject([
      {
        settingLabel: 'New user signups',
        settingHref: '/project/project-ref/auth/providers',
      },
      {
        settingLabel: 'Anonymous sign-ins',
        settingHref: '/project/project-ref/auth/providers',
      },
      {
        settingLabel: 'Manual account linking',
        settingHref: '/project/project-ref/auth/providers',
      },
      {
        settingLabel: 'Email confirmations',
        settingHref: '/project/project-ref/auth/providers',
      },
    ])
  })

  it('labels a non-Auth field using its registry name', () => {
    expect(
      createConfigurationDriftRows(
        [
          {
            section: 'api',
            fieldName: 'max_rows',
            configPath: 'api.max_rows',
            settingHref: toApiSettingsHref,
            dashboardValue: 500,
            githubValue: 1000,
          },
        ],
        'project-ref'
      )
    ).toMatchObject([
      {
        settingLabel: 'Max rows',
        settingHref: '/project/project-ref/settings/api',
        valueDiff: { kind: 'scalar', dashboardValue: '500', configValue: '1000' },
      },
    ])
  })

  it('formats redirect URLs as a sorted, deduplicated list', () => {
    expect(
      formatConfigFieldValue(
        'URI_ALLOW_LIST',
        ' https://b.example.com,https://a.example.com,https://b.example.com '
      )
    ).toBe('https://a.example.com\nhttps://b.example.com')
  })

  it('represents redirect URL drift as semantic additions on either side', () => {
    const [row] = createConfigurationDriftRows(
      [
        {
          section: 'auth',
          fieldName: 'URI_ALLOW_LIST',
          configPath: 'auth.additional_redirect_urls',
          settingHref: toUrlConfigHref,
          dashboardValue: 'https://shared.example.com, https://dashboard-only.example.com',
          githubValue: ['https://config-only.example.com', 'https://shared.example.com'],
        },
      ],
      'project-ref'
    )

    expect(row?.valueDiff).toEqual({
      kind: 'list',
      onlyInDashboard: ['https://dashboard-only.example.com'],
      onlyInConfig: ['https://config-only.example.com'],
    })
  })

  it('formats booleans semantically and empty values explicitly', () => {
    expect(formatConfigFieldValue('EXTERNAL_GITHUB_ENABLED', false)).toBe('Disabled')
    expect(formatConfigFieldValue('EXTERNAL_GITHUB_ENABLED', true)).toBe('Enabled')
    expect(formatConfigFieldValue('EXTERNAL_GITHUB_CLIENT_ID', '')).toBe('Not set')
    expect(formatConfigFieldValue('URI_ALLOW_LIST', [])).toBe('Not set')
  })

  it('groups unmanaged fields by section for display', () => {
    expect(
      groupUnmanagedConfigFields([
        { section: 'database', fieldName: 'ssl_enforced', dashboardValue: true },
        { section: 'pooler', fieldName: 'pool_mode', dashboardValue: 'transaction' },
        {
          section: 'database',
          fieldName: 'network_restrictions',
          dashboardValue: { entitlement: 'allowed' },
        },
      ])
    ).toEqual([
      {
        section: 'database',
        sectionLabel: 'Database',
        rows: [
          { fieldName: 'ssl_enforced', label: 'Ssl Enforced', value: 'Enabled' },
          {
            fieldName: 'network_restrictions',
            label: 'Network Restrictions',
            value: JSON.stringify({ entitlement: 'allowed' }, null, 2),
          },
        ],
      },
      {
        section: 'pooler',
        sectionLabel: 'Pooler',
        rows: [{ fieldName: 'pool_mode', label: 'Pool Mode', value: 'transaction' }],
      },
    ])
  })

  it('returns no groups when there are no unmanaged fields', () => {
    expect(groupUnmanagedConfigFields([])).toEqual([])
  })
})
