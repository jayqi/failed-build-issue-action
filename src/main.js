const util = require('util');
const core = require('@actions/core');
const newIssueOrCommentForLabel = require('./new-issue-or-comment-for-label');

// most @actions toolkit packages have async methods
async function run() {
  try {
    const githubToken = core.getInput('github-token');
    const labelName = core.getInput('label-name');
    const titleTemplate = core.getInput('title-template');
    const bodyTemplate = core.getInput('body-template');
    const createLabel = core.getBooleanInput('create-label');
    const alwaysCreateNewIssue = core.getBooleanInput('always-create-new-issue');

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      githubToken,
      labelName,
      titleTemplate,
      bodyTemplate,
      createLabel,
      alwaysCreateNewIssue,
    )
    const htmlUrl = created.html_url
    core.info("Created url: " + htmlUrl);

    core.setOutput('issue-number', issueNumber);
    core.setOutput('html-url', htmlUrl);
  } catch (error) {
    // util.inspect is what console.error uses to format errors
    core.debug("Error:\n" + util.inspect(error, { depth: null }))
    core.setFailed(error.message);
  }
}

module.exports = { run };
