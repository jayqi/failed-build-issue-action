const core = require('@actions/core');
const issues = require('./issues');

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
    const descriptionTemplate = core.getInput('description-template');

    const { issueNumber, created } = await issues.newIssueOrCommentForLabel(githubToken, labelName, titleTemplate, descriptionTemplate)
    console.log(created);

    core.setOutput('issue-number', issueNumber);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
