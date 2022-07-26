const core = require('@actions/core');
const github = require('@actions/github');
var Mustache = require('mustache');

let newIssueOrCommentForLabel = async function (
  githubToken, labelName, titleTemplate, bodyTemplate, createLabel, alwaysCreateNewIssue
) {
  // octokit client
  // https://octokit.github.io/rest.js/
  const octokit = github.getOctokit(githubToken);
  const context = Object.assign(
    github.context,
    { refname: github.context.ref.split("/").pop() } // just the branch or tag name
  )

  core.debug("labelName: " + labelName)
  core.debug("titleTemplate: " + titleTemplate)
  core.debug("bodyTemplate: " + bodyTemplate)
  core.debug("createLabel: " + String(createLabel))
  core.debug("alwaysCreateNewIssue: " + String(alwaysCreateNewIssue))
  core.debug("context: " + JSON.stringify(context))

  core.info("Checking if label '" + labelName + "' exists...")
  try {
    const get_label_response = await octokit.rest.issues.getLabel({
      owner: context.repo.owner,
      repo: context.repo.repo,
      name: labelName,
    });
    core.debug("get_label_response:\n" + JSON.stringify(get_label_response))
  }
  catch (error) {
    if (error.message === "Not Found" && createLabel) {
      core.info("Creating label '" + labelName + "'...")
      const create_label_response = await octokit.rest.issues.createLabel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        name: labelName,
      });
      core.debug("create_label_response:\n" + JSON.stringify(create_label_response))
    } else {
      throw error
    }
  }

  core.info("Finding latest open issue with label '" + labelName + "'...")
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
  let create_issue_or_comment_response;
  if (alwaysCreateNewIssue || issues_with_label.length === 0) {
    core.info(alwaysCreateNewIssue ? "always-create-new-issue set to true" : "No open issue found.")
    core.info("Creating new issue...")
    create_issue_or_comment_response = await octokit.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: Mustache.render(titleTemplate, context),
      body: Mustache.render(bodyTemplate, context),
      labels: [labelName],
    });
    issueNumber = create_issue_or_comment_response.data.number;
  } else {
    issueNumber = issues_with_label[0].number;
    core.info("Found issue #" + String(issueNumber) + ". Creating new comment...")
    create_issue_or_comment_response = await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber,
      body: Mustache.render(bodyTemplate, context),
    });
  }

  core.debug("create_issue_or_comment_response:\n" + JSON.stringify(create_issue_or_comment_response));

  const created = create_issue_or_comment_response.data

  return { issueNumber, created }
};

module.exports = newIssueOrCommentForLabel;
