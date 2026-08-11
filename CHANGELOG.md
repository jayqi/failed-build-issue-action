# Changelog

## v1.3.0 (Unreleased)

- Changed action to use [Node 24 runtime](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).
- Changed the `github-token` input to default to `${{ github.token }}`, the token GitHub Actions automatically provides to every job. Basic usage now needs no `with:` block at all. Passing `github-token` explicitly still works and is unchanged, and is still how you use a different account, such as a GitHub App or a personal access token.
- Renamed the `refname` template variable to `refName`, matching the camelCase of the other template variables. `refname` still works but is deprecated and now logs a warning when a template uses it; it will be removed in a future major version.
- Added a `refUrl` template variable holding a complete, percent-encoded URL to the branch or tag. The default `body-template` now uses it for the branch link. Prefer it over building a URL out of `refName` yourself: `refName` is display text, and for a pull request from a fork it is prefixed with the owner, e.g., `contributor:feature/foo`, which is not a valid URL path.
- Fixed `refName` naming the wrong branch for `pull_request` and `workflow_run` events, which had made the branch link 404 or point at the default branch rather than the branch that failed.
- Fixed `refName` truncating branch and tag names containing slashes, so a branch like `feature/foo` no longer becomes `foo` with a broken link.
- Fixed the default `body-template` hardcoding `https://github.com`, which generated links to the wrong host on GitHub Enterprise Server. It now uses `{{serverUrl}}`. Rendered output on github.com is unchanged.
- Fixed title and body templates HTML-escaping rendered values, which corrupted issue titles and code spans in issue and comment bodies.
- Fixed the search for an existing issue incorrectly matching pull requests. GitHub's REST API returns pull requests from the issues endpoint, so a pull request carrying the configured label could become the comment target and the action would never open a real issue. Pull requests are now skipped, and the action logs a warning naming any it finds with the label.
- Fixed the action making an unnecessary API request to search for existing issues when `always-create-new-issue` is `true`.
- Fixed the incorrect `required: true` on all inputs, changing to `required: false`. GitHub Actions did not enforce `required` for action inputs anyway, so this is a metadata fix and does not change behavior.

## v1.2.0 (2024-02-16)

- Changed action to use [Node 20 runtime](https://github.blog/changelog/2023-09-22-github-actions-transitioning-from-node-16-to-node-20/)
- Updated dependency versions.

## v1.1.1 (2023-02-11)

- Removed source map and license from build command because [JasonEtco/build-and-tag-action](https://github.com/JasonEtco/build-and-tag-action/issues/20) does not support additional files.

## v1.1.0 (2023-02-11)

- Added tests.
- Added more informative error if label does not exist and `create-label` is false.
- Updated dependency versions.

## v1.0.0 (2022-07-26)

Initial release. 🚀
