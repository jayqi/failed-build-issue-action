# Create Failed Build Issue Action

[![tests](https://github.com/jayqi/failed-build-issue-action/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/jayqi/failed-build-issue-action/actions/workflows/tests.yml) [![codecov](https://codecov.io/github/jayqi/failed-build-issue-action/branch/main/graph/badge.svg?token=LKAEGPVU4N)](https://codecov.io/github/jayqi/failed-build-issue-action)

This action makes it easy to notify maintainers of a failed GitHub Actions workflow via GitHub's issue tracker. By default, the action will find the latest open issue with the label `"build failed"` and add a comment. If no such issue is open, it will instead open a new issue.

## Basic usage

> [!IMPORTANT]
> This action requires "Read and write permissions". You can set the default permissions granted to GitHub Actions workflows by going to your repository's **Settings** > **Actions** > **General** and looking under the **Workflow permissions** section. You can also set permissions at the individual workflow level. Learn more from [GitHub's documentation about workflow permissions](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token).

```yml
- uses: jayqi/failed-build-issue-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

For all options, see [`action.yml`](./action.yml)

See the two examples below for more realistic usage in full workflows.

## Example 1: As a step

Below is an example GitHub Workflow YAML file that demonstrates a simple case of using this action in a workflow. If your workflow just runs a single job, then you can set things up in this way. 

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
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          bash run_tests.sh
      - name: Notify failed build
        uses: jayqi/failed-build-issue-action@v1
        if: failure() && github.event.pull_request == null
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Explanation

In this example, we run `failed-build-issue-action` as a [**step**](https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions#the-components-of-github-actions) in the single job in the workflow. One key part is the [`if` conditional](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepsif) to control when the step runs. 

```yml
if: failure() && github.event.pull_request == null
```

There are two conditions here that we combine with a `&&` (and) operator:

1. `failure()` — the step will only run if there is a failure in any previous step in this job.
2. `github.event.pull_request == null` — In this example, we exclude pull requests because they represent in-development work where failures are more expected. See ["Conditioning on event triggers"](#conditioning-on-event-triggers) below for additional discussion.

You'll want to make sure the `failed-build-issue-action` step is after any step that you might want to trigger it. 

## Example 2: As a job

Below is an example GitHub Workflow YAML file that demonstrates a more complex workflow with multiple jobs. If your workflow has multiple jobs, such as from a matrix, then you'll want to follow this example.

```yml
name: tests

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "0 0 * * 0"  # Run every Sunday at 00:00 UTC

jobs:
  code-quality:
    name: Code quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run linting
        run: |
          bash run_linting.sh

  tests:
    name: Tests - ${{ matrix.os }}
    needs: [code-quality]
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          bash run_tests.sh

  notify:
    name: Notify failed build
    needs: [code-quality, tests]
    if: failure() && github.event.pull_request == null
    runs-on: ubuntu-latest
    steps:
      - uses: jayqi/failed-build-issue-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Explanation

In this example, we've separated things out into multiple stages using [**jobs**](https://docs.github.com/en/actions/using-jobs/using-jobs-in-a-workflow). First, the `code-quality` job runs to perform linting. Next, if `code-quality` succeeded, the `tests` job runs on a matrix of operating systems. We want to run `failed-build-issue-action` when either `code-quality` failures or if `tests` failures on any OS. To do this, we define a separate `notify` job. We use the [`needs` keyword](https://docs.github.com/en/actions/using-jobs/using-jobs-in-a-workflow#defining-prerequisite-jobs) to define the prerequisite of our `notify` job. 

```yml
needs: [code-quality, tests]
```

We also use the `if` keyword to condition the `notify` job on one of its prerequisites failing, as well as skipping pull requests as described in the previous example.

```yml
if: failure() && github.event.pull_request == null
```

Note that we don't need to use `actions/checkout` in this job because it doesn't depend on any files in our repository.  

## Conditioning on event triggers

**Events** in GitHub Actions refer to things that can cause a workflow to run, such as a pushing a commit to a branch or pushing a commit to a pull request. 

You may not want `failed-build-issue-action` to not run for _all_ of the same event triggers as the workflow itself. For instance, our examples above run on (1) commits to pull requests, (2) pushes to the main branch, and (3) on a weekly schedule on the main branch. You probably don't want to be notified for every test failure for pull requests, since in-development work is expected to fail more often. You can easily use the `github.event` payload to determine whether a particular type of event is running. For example:

- `if: github.event.pull_request` will be true if it's a pull request
- `if: github.event.pull_request == null` will be true if it's _not_ a pull request

See the GitHub Actions documentation for more details. The ["Using event information"](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#using-event-information) documentation provides for information about how to use the metadata provided in the event payload. You can find a full list of supported events in ["Events that trigger workflows"](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows).

## Title and body templates

This action accepts title and body templates to use when creating new issues or comments through the `title-template` and `body-template` parameters, respectively.

These templates can render data from the GitHub Actions run context using [mustache.js](https://github.com/janl/mustache.js/). For example, to render the run number, use the double-curly-brace mustache syntax: `{{runNumber}}`. See the attributes of the [`Context` class](https://github.com/actions/toolkit/blob/main/packages/github/src/context.ts) in actions/toolkit for available context variables that you can use. For documention on the environment variables used to populate the context, see the documentation for GitHub Actions' [default environment variables](https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables).

If you need to inject data that isn't available from the context object within the Javascript, you can also use the GitHub Actions [expressions](https://docs.github.com/en/actions/learn-github-actions/expressions) and [workflow run context](https://docs.github.com/en/actions/learn-github-actions/contexts) to generate the strings that you pass to this action as a title or body template.

## Comments vs. new issues

The default behavior of appending to the latest open `"build failed"` issue assumes that if the issue is still open, it is unaddressed and most likely the cause of the addiional failure.

If you would like to always create a new issue, set the parameter `always-create-new-issue` to `true`.

If you are sticking with the default behavior of appending a comment to the latest open issue in general, but you have a particular case where you don't want it to append a comment and instead open a new issue, you can remove the `"build failed"` label from the open issue(s). One situation where you might want to do this is if you've temporarily fixed the cause of a failure, but you want to keep the issue open to track additional to-dos.

## Using with GitHub Projects

[GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects) is a work planning tool in GitHub that provides additional ways to view and interact with issues and pull requests across repos. Since this action just creates or interacts with issues, you can use GitHub Projects to manage those issues like any other issue.

One common requirement may be to automatically add issues created by this action to a GitHub Project. You can use the built-in [auto-add workflow](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/quickstart-for-projects#configure-built-in-automation) with the `"build failed"` label (or whatever label you've configured) to accomplish this.

## Using the development version

To use the development version on the `main` branch (or any other version that is not a tagged release), you will need to check out the repository and build the Node.js package. Here is an example set of steps to include in a job to use the latest version from `main`:

```
steps:
  - name: Checkout
    uses: actions/checkout@v4
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
