const core = require('@actions/core');
const newIssueOrCommentForLabel = require('./new-issue-or-comment-for-label');

// Error message and stack are non-enumerable, so JSON.stringify(error)
// yields "{}" for plain errors. Prefer the stack, and surface the fields
// that matter most for Octokit RequestErrors.
function formatErrorForDebug(error) {
  const lines = [error.stack || String(error)];
  if (error.status) {
    lines.push(`status: ${error.status}`);
  }
  if (error.response && error.response.data !== undefined) {
    lines.push(`response data: ${JSON.stringify(error.response.data)}`);
  }
  return lines.join("\n");
}

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
    core.debug("Error:\n" + formatErrorForDebug(error))
    core.setFailed(error.message);
  }
}

module.exports = { run, formatErrorForDebug };
