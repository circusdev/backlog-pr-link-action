import { jest } from '@jest/globals'
import { Client, parsePrLinkTemplate } from '../src/client'

const client = new Client('xxx.backlog.com', 'dummy_key')

function createClientWithPrFieldValue(value?: string | null, prLinkTemplate?: string): {
  client: Client
  patchIssue: jest.Mock
} {
  const testClient = new Client('xxx.backlog.com', 'dummy_key', prLinkTemplate)
  const patchIssue = jest.fn().mockResolvedValue({})

  Object.assign(testClient, {
    backlog: {
      getProject: jest.fn().mockResolvedValue({}),
      getCustomFields: jest.fn().mockResolvedValue([{ id: 123, name: 'Pull Request' }]),
      getIssue: jest.fn().mockResolvedValue({
        customFields: [{ id: 123, name: 'Pull Request', value }],
      }),
      patchIssue,
    },
  })

  return { client: testClient, patchIssue }
}

describe('parsePrLinkTemplate', () => {
  test.each([
    ['', '[{prTitle}]({link})'],
    ['[{prTitle}]({link})', '[{prTitle}]({link})'],
    ['{link}', '{link}'],
    ['PR: {rawPrTitle} {link}', 'PR: {rawPrTitle} {link}'],
  ])('parses %#', (value, expected) => {
    expect(parsePrLinkTemplate(value)).toBe(expected)
  })

  test.each([
    '{prTitle}',
    '{unknown} {link}',
    '{link',
    '{link}\n{prTitle}',
  ])('rejects invalid template %#', (value) => {
    expect(() => parsePrLinkTemplate(value)).toThrow(
      'Invalid pr-link-template',
    )
  })
})

describe('containsBacklogUrl', () => {
  test.concurrent.each([
    '',
    'xxx.backlog.com',
    'xxx.backlog.com/view/',
    'https://xxx.backlog.com/view/',
    'https://xxx.backlog.com/view/PROJECT',
    'https://xxx.backlog.com/view/PROJECT',
    'https://xxx.backlog.com/view/PROJECT1',
    'https://xxx.backlog.com/view/PROJECT-',
    'https://xxx.backlog.com/view/-1',
    'https://xxx.backlog.com/view/1-X',
    'https://xxx.backlog.com/view/X-X',
  ])('%s does NOT contain Backlog URL', (invalidUrl) => {
    expect(client.containsBacklogUrl(invalidUrl)).toBe(false)
  })

  test.concurrent.each([
    'https://xxx.backlog.com/view/1-1',
    'https://xxx.backlog.com/view/PROJECT-1',
    ' https://xxx.backlog.com/view/PROJECT-1 ',
    '\nhttps://xxx.backlog.com/view/PROJECT-1\n',
  ])('%s contains Backlog URL', (validUrl) => {
    expect(client.containsBacklogUrl(validUrl)).toBe(true)
    expect(client.containsBacklogUrl(validUrl)).toBe(true)
  })
})

describe('parseBacklogUrl', () => {
  test.concurrent.each([
    '',
    '\n',
    'https://xxx.backlog.com/view',
  ])('invalid URL %#', (body) => {
    expect(client.parseBacklogUrl(body)).toStrictEqual([])
  })

  test.concurrent.each([
    [
      'URL: https://xxx.backlog.com/view/PROJECT-1 ',
      'https://xxx.backlog.com/view/PROJECT-1',
      'PROJECT',
      'PROJECT-1',
    ],
    [
      ' hhttps://xxx.backlog.com/view/PROJECT-1x ',
      'https://xxx.backlog.com/view/PROJECT-1',
      'PROJECT',
      'PROJECT-1',
    ],
    ['\nhttps://xxx.backlog.com/view/PJ-2\n', 'https://xxx.backlog.com/view/PJ-2', 'PJ', 'PJ-2'],
  ])('Single URL %#', (body, url, projectId, issueId) => {
    expect(client.parseBacklogUrl(body)).toStrictEqual([[url, projectId, issueId]])
  })

  test.concurrent.each([
    [
      'https://xxx.backlog.com/view/PROJECT-1 https://xxx.backlog.com/view/PJ-2',
      'https://xxx.backlog.com/view/PROJECT-1',
      'PROJECT',
      'PROJECT-1',
      'https://xxx.backlog.com/view/PJ-2',
      'PJ',
      'PJ-2',
    ],
    [
      'https://xxx.backlog.com/view/PROJECT-1\nhttps://xxx.backlog.com/view/PJ-2',
      'https://xxx.backlog.com/view/PROJECT-1',
      'PROJECT',
      'PROJECT-1',
      'https://xxx.backlog.com/view/PJ-2',
      'PJ',
      'PJ-2',
    ],
    [
      ' https://xxx.backlog.com/view/PROJECT-1https://xxx.backlog.com/view/PJ-2 ',
      'https://xxx.backlog.com/view/PROJECT-1',
      'PROJECT',
      'PROJECT-1',
      'https://xxx.backlog.com/view/PJ-2',
      'PJ',
      'PJ-2',
    ],
  ])('multiple URLs %#', (body, url1, projectId1, issueId1, url2, projectId2, issueId2) => {
    expect(client.parseBacklogUrl(body)).toStrictEqual([[url1, projectId1, issueId1], [
      url2,
      projectId2,
      issueId2,
    ]])
  })
})

describe('validateProject', () => {
  test('invalid project', async () => {
    expect(await client.validateProject('')).toBe(false)
    expect(await client.validateProject('INVALID')).toBe(false)
  })
})

describe('updateIssuePrField', () => {
  it('failed to update', async () => {
    const result = await client.updateIssuePrField(
      'PROJECT',
      'PROJECT-1',
      'https://github.com/xxx/pull/1',
      'Some PR title',
    )
    expect(result).toBe(false)
  })

  test.each([
    ['Add feature', '[Add feature](https://github.com/xxx/pull/1)'],
    [
      '[HR_DEV-19] fix [bug] with `code`\\path',
      '[\\[HR_DEV-19\\] fix \\[bug\\] with \\`code\\`\\\\path](https://github.com/xxx/pull/1)',
    ],
    ['line1\nline2   line3', '[line1 line2 line3](https://github.com/xxx/pull/1)'],
    [
      'Add {link} and {prTitle} support',
      '[Add {link} and {prTitle} support](https://github.com/xxx/pull/1)',
    ],
    ['', '[https://github.com/xxx/pull/1](https://github.com/xxx/pull/1)'],
    ['   ', '[https://github.com/xxx/pull/1](https://github.com/xxx/pull/1)'],
  ])('updates the PR custom field with a Markdown PR link %#', async (title, expectedValue) => {
    const { client, patchIssue } = createClientWithPrFieldValue()

    const result = await client.updateIssuePrField(
      'PROJECT',
      'PROJECT-1',
      'https://github.com/xxx/pull/1',
      title,
    )

    expect(result).toBe(true)
    expect(patchIssue).toHaveBeenCalledWith('PROJECT-1', {
      customField_123: expectedValue,
    })
  })

  it('appends the Markdown PR link to an existing value', async () => {
    const { client, patchIssue } = createClientWithPrFieldValue('existing')

    const result = await client.updateIssuePrField(
      'PROJECT',
      'PROJECT-1',
      'https://github.com/xxx/pull/1',
      'Add feature',
    )

    expect(result).toBe(true)
    expect(patchIssue).toHaveBeenCalledWith('PROJECT-1', {
      customField_123: 'existing\n[Add feature](https://github.com/xxx/pull/1)',
    })
  })

  it('updates the PR custom field with the raw PR URL template', async () => {
    const { client, patchIssue } = createClientWithPrFieldValue(undefined, '{link}')

    const result = await client.updateIssuePrField(
      'PROJECT',
      'PROJECT-1',
      'https://github.com/xxx/pull/1',
      'Add feature',
    )

    expect(result).toBe(true)
    expect(patchIssue).toHaveBeenCalledWith('PROJECT-1', {
      customField_123: 'https://github.com/xxx/pull/1',
    })
  })

  it('appends the raw PR URL template to an existing value', async () => {
    const { client, patchIssue } = createClientWithPrFieldValue('existing', '{link}')

    const result = await client.updateIssuePrField(
      'PROJECT',
      'PROJECT-1',
      'https://github.com/xxx/pull/1',
      'Add feature',
    )

    expect(result).toBe(true)
    expect(patchIssue).toHaveBeenCalledWith('PROJECT-1', {
      customField_123: 'existing\nhttps://github.com/xxx/pull/1',
    })
  })

  it('updates the PR custom field with a custom PR link template', async () => {
    const { client, patchIssue } = createClientWithPrFieldValue(
      undefined,
      'PR: {rawPrTitle} <{link}>',
    )

    const result = await client.updateIssuePrField(
      'PROJECT',
      'PROJECT-1',
      'https://github.com/xxx/pull/1',
      '[HR_DEV-19] fix [bug]',
    )

    expect(result).toBe(true)
    expect(patchIssue).toHaveBeenCalledWith('PROJECT-1', {
      customField_123: 'PR: [HR_DEV-19] fix [bug] <https://github.com/xxx/pull/1>',
    })
  })

  test.each([
    ['https://github.com/xxx/pull/1'],
    ['https://github.com/xxx/pull/1?foo=bar'],
    ['https://github.com/xxx/pull/1#issuecomment-123'],
    ['[title](https://github.com/xxx/pull/1)'],
    ['PR: https://github.com/xxx/pull/1 - title'],
    ['https://github.com/xxx/pull/281\n[title](https://github.com/xxx/pull/1)'],
  ])('skips update when the PR URL is already linked %#', async (currentValue) => {
    const { client, patchIssue } = createClientWithPrFieldValue(currentValue)

    const result = await client.updateIssuePrField(
      'PROJECT',
      'PROJECT-1',
      'https://github.com/xxx/pull/1',
      'Add feature',
    )

    expect(result).toBe(false)
    expect(patchIssue).not.toHaveBeenCalled()
  })

  test.each([
    ['https://github.com/xxx/pull/281'],
    ['[title](https://github.com/xxx/pull/281)'],
    ['PR: https://github.com/xxx/pull/281 - title'],
  ])('does not treat a prefix URL match as an existing link %#', async (currentValue) => {
    const { client, patchIssue } = createClientWithPrFieldValue(currentValue)

    const result = await client.updateIssuePrField(
      'PROJECT',
      'PROJECT-1',
      'https://github.com/xxx/pull/28',
      'Add feature',
    )

    expect(result).toBe(true)
    expect(patchIssue).toHaveBeenCalledWith('PROJECT-1', {
      customField_123: `${currentValue}\n[Add feature](https://github.com/xxx/pull/28)`,
    })
  })
})
