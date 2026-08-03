# Changelog

## Unreleased

- Fixed the `refname` template variable truncating branch and tag names that contain slashes. A push to `releases/v1` previously rendered as `v1`, producing a branch link that 404'd. Only the `refs/heads/` or `refs/tags/` prefix is now stripped. Note that refs of other types, such as the `refs/pull/<n>/merge` ref of a `pull_request` event, have no short form and now render in full rather than as their last path segment.
- Fixed title and body templates HTML-escaping rendered values, which corrupted issue titles and code spans in issue and comment bodies.
- Removed unused dependency on `dist` package.

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
