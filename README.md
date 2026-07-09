> [!IMPORTANT]
> circusdev maintains this fork of
> [toshimaru/backlog-pr-link-action](https://github.com/toshimaru/backlog-pr-link-action).
> Toshimaru archived the upstream project after
> [v2.4.0](https://github.com/toshimaru/backlog-pr-link-action/releases/tag/v2.4.0).
> Use `circusdev/backlog-pr-link-action` for future fixes and releases.

[![Test](https://github.com/circusdev/backlog-pr-link-action/actions/workflows/test.yml/badge.svg)](https://github.com/circusdev/backlog-pr-link-action/actions/workflows/test.yml)

# backlog-pr-link-action

GitHub Actions: Link GitHub Pull Request to [Backlog](https://backlog.com/) issue.

## Prerequisite

- Backlog **Premium** plan (ref. [Backlog Pricing](https://backlog.com/pricing/))
- Create custom field named **"Pull Request"** in Backlog issue

## Usage

```yml
# .github/workflows/backlog-pr-link.yml
name: 'Link PR to Backlog'

on:
  pull_request:
    types: [opened, edited]

jobs:
  backlog-pr-link:
    runs-on: ubuntu-latest
    steps:
      - uses: circusdev/backlog-pr-link-action@v2.5.0
        with:
          backlog-api-key: "${{ secrets.BACKLOG_API_KEY }}"
          backlog-host: "your-org.backlog.com"
          pr-link-template: "[{prTitle}]({link})"
```

## Versioning and releases

Use `circusdev/backlog-pr-link-action@v2` to receive compatible v2 updates. Pin
`@vX.Y.Z` or a commit SHA when you need an immutable reference.

Release tags such as `v2.5.0` are not moved after publication. The `v2` major tag
tracks the latest compatible v2 release.

Release PRs are managed by release-please. The release workflow builds and commits
`dist/` on release-please PRs, so normal pull requests should not edit `dist/`
directly. If this repository adds branch protection or required checks for release
PRs, revisit whether release automation needs a GitHub App token or PAT instead of
the default `GITHUB_TOKEN`.

### Pull request link template

By default, this action writes a Markdown link to Backlog:

```md
[Pull request title](https://github.com/owner/repo/pull/1)
```

Customize `pr-link-template` if you want another value. Set it to `{link}` to keep the
URL-only behavior.

```yml
with:
  backlog-api-key: "${{ secrets.BACKLOG_API_KEY }}"
  backlog-host: "your-org.backlog.com"
  pr-link-template: "{link}"
```

Available placeholders:

| Placeholder    | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| `{prTitle}`    | Pull request title escaped for Markdown; falls back to the PR URL |
| `{rawPrTitle}` | Pull request title with whitespace normalized                     |
| `{link}`       | Pull request URL                                                  |

`pr-link-template` must include `{link}` and must be a single line.
If your template renders Markdown, prefer `{prTitle}`. `{rawPrTitle}` writes the title
as-is.

> [!TIP]
> **Avoiding unnecessary runs**
>
> If the pull request doesn't contain a Backlog URL, there's no need to run this action.
>
> To avoid this situation, you can skip the job by using an `if` expression as follows:
>
> ```yml
> # Run the job only when the pull request contains a Backlog URL
> jobs:
>   backlog-pr-link:
>     runs-on: ubuntu-latest
>     if: contains(github.event.pull_request.body, 'https://yourhost.backlog.com/')
>     steps:
>       - ...
> ```

## How it works

- Check the pull request has a Backlog issue URL when it's opened or edited
- If it has the URL, link GitHub PR to Backlog issue

## Setup

### 1. Create a custom field named `Pull Request`

- Custom Field: `Pull Request`
- Custom Field Type: `Sentence`

<details>
  <summary>Image: Create a custom field</summary>

![create custom field](https://user-images.githubusercontent.com/803398/93299287-c5913280-f82f-11ea-8e88-6d535390b4d3.png)

</details>

#### Reference

- [English] [Setting Custom fields - Backlog Enterprise](https://backlog.com/enterprise-help/usersguide/custom-field/userguide1099/)
- [Japanese] [カスタム属性の設定方法 – Backlog ヘルプセンター](https://support-ja.backlog.com/hc/ja/articles/360035640274-%E3%82%AB%E3%82%B9%E3%82%BF%E3%83%A0%E5%B1%9E%E6%80%A7%E3%81%AE%E8%A8%AD%E5%AE%9A%E6%96%B9%E6%B3%95)

### 2. Generate Backlog API key

- Go to Backlog API Settings page
- Generate API key for the action

<details>
  <summary>Image: Generate Backlog API key</summary>

![generate backlog api key](https://user-images.githubusercontent.com/803398/94165479-3b973880-fec5-11ea-915d-733d0de6631f.png)

</details>

#### Reference

- [English] [API Settings – Backlog Help Center](https://support.backlog.com/hc/en-us/articles/115015420567-API-Settings)
- [Japanese] [APIの設定 – Backlog ヘルプセンター](https://support-ja.backlog.com/hc/ja/articles/360035641754)

### 3. Set API key to GitHub Secret

- Go to GitHub Actions secrets page
- Add GitHub Repository secret
  - secret name: `BACKLOG_API_KEY`
  - secret value: {your-backlog-api-key}

<details>
  <summary>Image: Set API key to GitHub Secret</summary>

![GitHub Repository secret](https://user-images.githubusercontent.com/803398/161873040-5e54361a-6498-4866-9562-b23151aa3666.png)

</details>

#### Reference

- [Encrypted secrets - GitHub Docs](https://docs.github.com/en/actions/reference/encrypted-secrets)
