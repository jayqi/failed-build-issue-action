const core = require('@actions/core');
const github = require('@actions/github');
var Mustache = require('mustache');

let newIssueOrCommentForLabel = async function (githubToken, labelName, titleTemplate, bodyTemplate) {
  // octokit client
  // https://octokit.github.io/rest.js/
  const octokit = github.getOctokit(githubToken);
  const context = {
    ...github.context,
    refname: github.context.ref.split("/").pop() // just the branch or tag name
  };

  core.debug("labelName: " + labelName)
  core.debug("titleTemplate: " + titleTemplate)
  core.debug("bodyTemplate: " + bodyTemplate)
  core.debug("context: " + JSON.stringify(context))

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
  let response;
  if (issues_with_label.length === 0) {
    // No open issue, create new one
    response = await octokit.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: Mustache.render(titleTemplate, context),
      body: Mustache.render(bodyTemplate, context),
      labels: [labelName],
    });
    issueNumber = response.data.number;
  } else {
    // Append as comment to existing issue
    issueNumber = issues_with_label[0].number;
    response = await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber,
      body: Mustache.render(bodyTemplate, context),
    });
  }

  core.debug(JSON.stringify(response));

  const created = response.data

  return { issueNumber, created }
};

module.exports = newIssueOrCommentForLabel;
