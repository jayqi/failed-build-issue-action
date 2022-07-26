const core = require('@actions/core');
const newIssueOrCommentForLabel = require('./new-issue-or-comment-for-label');

// most @actions toolkit packages have async methods
async function run() {
  try {
    // This should be a token with access to your repository scoped in as a secret.
    // The YML workflow will need to set github-token with the GitHub Secret Token
    // github-token: ${{ secrets.GITHUB_TOKEN }}
    // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
    const githubToken = core.getInput('github-token');
    const labelName = core.getInput('label-name');
    const titleTemplate = core.getInput('title-template');
    const bodyTemplate = core.getInput('body-template');

    const { issueNumber, created } = await newIssueOrCommentForLabel(githubToken, labelName, titleTemplate, bodyTemplate)
    const htmlUrl = created.html_url
    core.info("Created url:" + htmlUrl);

    core.setOutput('issue-number', issueNumber);
    core.setOutput('html-url', htmlUrl);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
