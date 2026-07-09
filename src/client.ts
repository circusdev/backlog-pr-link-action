import * as core from '@actions/core'
import 'isomorphic-fetch'
import 'isomorphic-form-data'
import { Backlog } from 'backlog-js'

const PR_FIELD_NAME = 'Pull Request'
const PR_LINK_TEMPLATE_PLACEHOLDERS = ['prTitle', 'rawPrTitle', 'link'] as const
const PR_LINK_TEMPLATE_PLACEHOLDER_REGEX = /\{([A-Za-z][A-Za-z0-9]*)\}/g

export const DEFAULT_PR_LINK_TEMPLATE = '[{prTitle}]({link})'

export function parsePrLinkTemplate(value: string): string {
  const template = value || DEFAULT_PR_LINK_TEMPLATE
  if (/[\r\n]/.test(template)) {
    throw new Error('Invalid pr-link-template: template must be a single line')
  }
  if (!template.includes('{link}')) {
    throw new Error('Invalid pr-link-template: template must include {link}')
  }

  for (const [, placeholder] of template.matchAll(PR_LINK_TEMPLATE_PLACEHOLDER_REGEX)) {
    if (!PR_LINK_TEMPLATE_PLACEHOLDERS.includes(placeholder as PrLinkTemplatePlaceholder)) {
      throw new Error(`Invalid pr-link-template: unknown placeholder {${placeholder}}`)
    }
  }

  const withoutPlaceholders = template.replace(PR_LINK_TEMPLATE_PLACEHOLDER_REGEX, '')
  if (withoutPlaceholders.includes('{') || withoutPlaceholders.includes('}')) {
    throw new Error('Invalid pr-link-template: malformed placeholder')
  }

  return template
}

type PrLinkTemplatePlaceholder = (typeof PR_LINK_TEMPLATE_PLACEHOLDERS)[number]

function normalizePrTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim()
}

function escapeMarkdownText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/`/g, '\\`')
}

function isPrUrlContinuation(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9/_:.\-[\]=&%]/.test(char)
}

function hasExactPrUrl(line: string, prUrl: string): boolean {
  let startIndex = line.indexOf(prUrl)
  while (startIndex !== -1) {
    const before = startIndex > 0 ? line[startIndex - 1] : undefined
    const after = line[startIndex + prUrl.length]
    if (!isPrUrlContinuation(before) && !isPrUrlContinuation(after)) {
      return true
    }
    startIndex = line.indexOf(prUrl, startIndex + 1)
  }
  return false
}

function hasPrUrl(value: string, prUrl: string): boolean {
  return value
    .split('\n')
    .map((line) => line.trim())
    .some((line) => hasExactPrUrl(line, prUrl))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatPrLink(template: string, title: string, url: string): string {
  const rawPrTitle = normalizePrTitle(title)
  const prTitle = escapeMarkdownText(rawPrTitle || url)
  return template.replace(
    PR_LINK_TEMPLATE_PLACEHOLDER_REGEX,
    (match, placeholder: string): string => {
      switch (placeholder) {
        case 'rawPrTitle':
          return rawPrTitle
        case 'prTitle':
          return prTitle
        case 'link':
          return url
        default:
          return match
      }
    },
  )
}

export function buildPrFieldValue(
  template: string,
  currentValue: string | null | undefined,
  prUrl: string,
  prTitle: string,
): string | null {
  const value = currentValue || ''
  if (hasPrUrl(value, prUrl)) {
    return null
  }
  const linkText = formatPrLink(template, prTitle, prUrl)
  return value ? `${value}\n${linkText}` : linkText
}

interface CustomField {
  id: number
  name: string
  value?: string | null
}

export class Client {
  private host: string
  private backlog: Backlog
  private prLinkTemplate: string

  constructor(host: string, apiKey: string, prLinkTemplate = DEFAULT_PR_LINK_TEMPLATE) {
    this.host = host
    this.prLinkTemplate = parsePrLinkTemplate(prLinkTemplate)
    this.backlog = new Backlog({ host, apiKey })
  }

  containsBacklogUrl(body: string): boolean {
    return this.urlRegex.test(body)
  }

  parseBacklogUrl(body: string): Array<Array<string>> {
    const urls: Array<Array<string>> = []
    const urlRegex: RegExp = this.urlRegex
    let matchData: Array<string> | null
    while ((matchData = urlRegex.exec(body)) !== null) {
      const [url, projectId, issueNo] = matchData
      urls.push([url, projectId, `${projectId}-${issueNo}`])
    }
    return urls
  }

  async updateIssuePrField(
    projectId: string,
    issueId: string,
    prUrl: string,
    prTitle = '',
  ): Promise<boolean> {
    if (!await this.validateProject(projectId)) {
      core.warning(`Invalid ProjectID: ${projectId}`)
      return false
    }

    let prCustomField: CustomField | undefined
    try {
      prCustomField = await this.getPrCustomField(projectId)
    } catch (error) {
      if (error instanceof Error) {
        core.error(error.message)
      }
      core.error('Failed to get custom field')
      return false
    }
    if (prCustomField === undefined) {
      core.warning('Skip process since "Pull Request" custom field not found')
      return false
    }

    let currentPrField: CustomField | undefined
    try {
      currentPrField = await this.getCurrentPrField(issueId, prCustomField.id)
    } catch (error) {
      if (error instanceof Error) {
        core.error(error.message)
      }
      core.warning(`Invalid IssueID: ${issueId}`)
      return false
    }
    if (currentPrField === undefined) {
      core.error('Failed to get the current value of the custom field')
      return false
    }
    const updateValue = buildPrFieldValue(
      this.prLinkTemplate,
      currentPrField.value,
      prUrl,
      prTitle,
    )
    if (updateValue === null) {
      core.info(`Pull Request (${prUrl}) has already been linked`)
      return false
    }

    try {
      await this.backlog.patchIssue(issueId, {
        [`customField_${currentPrField.id}`]: updateValue,
      })
      return true
    } catch (error) {
      if (error instanceof Error) {
        core.error(error.message)
      }
      core.error('Failed to update')
      return false
    }
  }

  async validateProject(projectId: string): Promise<boolean> {
    try {
      await this.backlog.getProject(projectId)
      return true
    } catch {
      return false
    }
  }

  async getPrCustomField(projectId: string): Promise<CustomField | undefined> {
    const fields: Array<CustomField> = await this.backlog.getCustomFields(
      projectId,
    )
    const prField: CustomField | undefined = fields.find(
      (field: CustomField) => field.name === PR_FIELD_NAME,
    )
    return prField
  }

  async getCurrentPrField(
    issueId: string,
    prFieldId: number,
  ): Promise<CustomField | undefined> {
    const issue = await this.backlog.getIssue(issueId)
    const prField: CustomField | undefined = issue.customFields.find(
      (field: CustomField) => field.id === prFieldId,
    )
    return prField
  }

  private get urlRegex(): RegExp {
    return new RegExp(`https://${escapeRegExp(this.host)}/view/(\\w+)-(\\d+)`, 'g')
  }
}
