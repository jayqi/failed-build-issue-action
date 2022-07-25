const github = require('@actions/github');
var Mustache = require('mustache');

let newIssueOrCommentForLabel = async function (githubToken, labelName, titleTemplate, bodyTemplate) {
  // octokit client
  // https://octokit.github.io/rest.js/
  const octokit = github.getOctokit(githubToken);
  const context = github.context;

  const { data: issues_with_label } = await octokit.rest.issues.listForRepo({
    owner: context.repo.owner,
    repo: context.repo.repo,
    labels: [labelName],
    state: 'open',
    sort: 'created',
    direction: 'desc',
    per_page: 1,
    page: 1,
  });

  let issueNumber;
  let created;
  if (issues_with_label.length === 0) {
    // No open issue, create new one
    ({ data: created } = await octokit.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: Mustache.render(titleTemplate, context),
      body: Mustache.render(bodyTemplate, context),
      labels: [labelName],
    }));
    issueNumber = created.number;
  } else {
    // Append as comment to existing issue
    issueNumber = issues_with_label[0].number;
    ({ data: created } = await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber,
      body: Mustache.render(bodyTemplate, context),
    }));
  }

  return issueNumber, created
};

module.exports = newIssueOrCommentForLabel;
