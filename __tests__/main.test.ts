import { jest } from '@jest/globals'

describe('main', () => {
  afterEach(() => {
    jest.resetModules()
    jest.restoreAllMocks()
  })

  it('marks the action as failed for non-Error thrown values', async () => {
    const setFailed = jest.fn()

    jest.unstable_mockModule('@actions/core', () => ({
      getInput: jest.fn((name: string) => {
        switch (name) {
          case 'backlog-host':
            return 'example.backlog.com'
          case 'backlog-api-key':
            return 'dummy_key'
          case 'pr-link-template':
            return ''
          default:
            return ''
        }
      }),
      info: jest.fn(),
      setFailed,
    }))
    jest.unstable_mockModule('@actions/github', () => ({
      context: {
        payload: {
          pull_request: {
            body: 'https://example.backlog.com/view/PROJECT-1',
            html_url: 'https://github.com/circusdev/backlog-pr-link-action/pull/1',
            title: 'Test PR',
          },
        },
      },
    }))
    jest.unstable_mockModule('../src/client', () => ({
      Client: jest.fn().mockImplementation(() => ({
        containsBacklogUrl: jest.fn().mockReturnValue(true),
        parseBacklogUrl: jest.fn().mockReturnValue([[
          'https://example.backlog.com/view/PROJECT-1',
          'PROJECT',
          'PROJECT-1',
        ]]),
        updateIssuePrField: jest.fn().mockRejectedValue('plain failure'),
      })),
    }))

    await import('../src/main')
    await new Promise((resolve) => setImmediate(resolve))

    expect(setFailed).toHaveBeenCalledWith('plain failure')
  })
})
