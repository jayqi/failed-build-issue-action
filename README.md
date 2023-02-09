# Create Failed Build Issue or Comment

This action makes it easy to notify maintainers of a failed GitHub Actions workflow via GitHub's issue tracker. By default, the action will find the latest open issue with the label `"build failed"` and add a comment. If no such issue is open, it will instead open a new issue.

## Basic Usage

```yml
- uses: jayqi/failed-build-issue-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

For all options, see [`action.yml`](./action.yml)

## Full workflow example

Below is the basic structure of an example GitHub Workflow YAML configuration that might look like a practical example for notifying failures when running tests. In this example, we run the workflow on pull requests, pushes to the `main` branch, and on a weekly schedule. We split this workflow into two jobs: the first one is `tests` and actually runs the tests; the second is `notify` which runs after the `tests` job, and only triggers if `tests` failed and the workflow was not triggered by a pull request.

```yml
name: tests

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "0 0 * * 0"  # Run every Sunday at 00:00 UTC

jobs:
  tests:
    name: Tests
    needs: code-quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: |
          bash run_tests.sh

  notify:
    name: Notify failed build
    needs: tests
    if: failure() && github.event.pull_request == null
    runs-on: ubuntu-latest
    steps:
      - uses: jayqi/failed-build-issue-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Title and Body Templates

This action accepts title and body templates to use when creating new issues or comments. These templates can render data from the GitHub Actions run context using [mustache.js](https://github.com/janl/mustache.js/). For example, to render the run number, use the double-curly-brace mustache syntax: `{{runNumber}}`. See the attributes of the [`Context` class](https://github.com/actions/toolkit/blob/main/packages/github/src/context.ts) in actions/toolkit for available context variables that you can use. For documention on the environment variables used to populate the context, see the documentation for GitHub Actions' [default environment variables](https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables).
