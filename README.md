# Create Failed Build Issue Action

[![tests](https://github.com/jayqi/failed-build-issue-action/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/jayqi/failed-build-issue-action/actions/workflows/tests.yml) [![codecov](https://codecov.io/github/jayqi/failed-build-issue-action/branch/main/graph/badge.svg?token=LKAEGPVU4N)](https://codecov.io/github/jayqi/failed-build-issue-action)

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

This action accepts title and body templates to use when creating new issues or comments through the `title-template` and `body-template` parameters, respectively.

These templates can render data from the GitHub Actions run context using [mustache.js](https://github.com/janl/mustache.js/). For example, to render the run number, use the double-curly-brace mustache syntax: `{{runNumber}}`. See the attributes of the [`Context` class](https://github.com/actions/toolkit/blob/main/packages/github/src/context.ts) in actions/toolkit for available context variables that you can use. For documention on the environment variables used to populate the context, see the documentation for GitHub Actions' [default environment variables](https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables).

If you need to inject data that isn't available from the context object within the Javascript, you can also use the GitHub Actions [expressions](https://docs.github.com/en/actions/learn-github-actions/expressions) and [workflow run context](https://docs.github.com/en/actions/learn-github-actions/contexts) to generate the strings that you pass to this action as a title or body template.

## Comments vs. New Issues

The default behavior of appending to the latest open `"build failed"` issue assumes that if the issue is still open, it is unaddressed and most likely the cause of the addiional failure.

If you would like to always create a new issue, set the parameter `always-create-new-issue` to `true`.

If you are sticking with the default behavior of appending a comment to the latest open issue in general, but you have a particular case where you don't want it to append a comment and instead open a new issue, you can remove the `"build failed"` label from the open issue(s). One situation where you might want to do this is if you've temporarily fixed the cause of a failure, but you want to keep the issue open to track additional to-dos.

## Using the development version

To use the development version on the `main` branch (or any other version that is not a tagged release), you will need to check out the repository and build the Node.js package. Here is an example set of steps to include in a job to use the latest version from `main`:

```
steps:
  - name: Checkout
    uses: actions/checkout@v2
    with:
      repository: jayqi/failed-build-issue-action
      ref: main

  - name: Install dependencies
    run: npm ci

  - name: Build package
    run: npm run build

  - name: Run failed-build-issue-action
    uses: ./
    with:
      github-token: ${{ secrets.GITHUB_TOKEN }}
```
