const core = require('@actions/core');
const github = require('@actions/github');
var Mustache = require('mustache');
const resolveRef = require('./resolve-ref');

// The output target is markdown/plain text, not HTML, so Mustache's default
// HTML escaping corrupts titles and code spans while adding no protection
// beyond GitHub's own server-side sanitization of issue bodies.
const render = (template, view) => Mustache.render(template, view, {}, { escape: (v) => v });

// GitHub's REST API models every pull request as an issue, so issues.listForRepo returns both.
// A pull request carries a `pull_request` key; an issue omits it.
const isPullRequest = (item) => item.pull_request !== undefined;

// Deprecated alias for refName
const deprecatedRefname = (refName) => {
  let warned = false;
  return () => {
    if (!warned) {
      warned = true;
      core.warning(
        "The 'refname' template variable is deprecated and will be removed in a " +
        "future major version. Use 'refName' instead, or 'refUrl' for a branch link."
      );
    }
    return refName;
  };
};

// A view built for Mustache, kept separate from the run context it reads. Returning a new
// object rather than assigning onto github.context, which is a shared singleton.
// repo and issue are getters inherited from the Context class rather than stored values, so
// spreading alone would silently drop them and blank out {{repo.owner}}; reading them here
// materializes each into plain data.
const templateView = (context, ref) => ({
  ...context,
  repo: context.repo,
  issue: context.issue,
  ...ref,
  refname: deprecatedRefname(ref.refName),
});

let newIssueOrCommentForLabel = async function (
  githubToken, labelName, titleTemplate, bodyTemplate, createLabel, alwaysCreateNewIssue,
  labelColor, labelDescription
) {
  // octokit client
  // https://octokit.github.io/rest.js/
  const octokit = github.getOctokit(githubToken);
  const context = github.context
  const ref = resolveRef(context, process.env)
  const view = templateView(context, ref)
  // The API wants owner/repo; the templates want the whole view. Two separate needs.
  const { owner, repo } = context.repo

  core.debug("labelName: " + labelName)
  core.debug("titleTemplate: " + titleTemplate)
  core.debug("bodyTemplate: " + bodyTemplate)
  core.debug("createLabel: " + String(createLabel))
  core.debug("alwaysCreateNewIssue: " + String(alwaysCreateNewIssue))
  core.debug("view: " + JSON.stringify(view))

  core.info("Checking if label '" + labelName + "' exists...")
  try {
    const get_label_response = await octokit.rest.issues.getLabel({
      owner,
      repo,
      name: labelName,
    });
    core.debug("get_label_response:\n" + JSON.stringify(get_label_response))
  }
  catch (error) {
    if (error.status === 404) {
      core.info("Label '" + labelName + "' not found.")
      if (createLabel) {
        core.info("Creating label '" + labelName + "'...")
        const createLabelBody = { name: labelName };
        if (labelColor) {
          createLabelBody.color = labelColor;
        }
        if (labelDescription) {
          createLabelBody.description = labelDescription;
        }
        const create_label_response = await octokit.rest.issues.createLabel({
          owner,
          repo,
          ...createLabelBody,
        });
        core.debug("create_label_response:\n" + JSON.stringify(create_label_response))
      } else {
        throw new Error(`Label "${labelName}" not found and createLabel = false.`, { cause: error });
      }
    } else {
      throw error
    }
  }

  let latestIssue;
  if (alwaysCreateNewIssue) {
    core.info("always-create-new-issue set to true")
  } else {
    core.info("Finding latest open issue with label '" + labelName + "'...")
    // A small page suffices: it only needs to be larger than the number of labeled pull
    // requests newer than the newest labeled issue. If it ever is not, the action opens a
    // duplicate issue rather than commenting, which is the benign direction to fail.
    const { data: labeledItems } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: [labelName],
      state: 'open',
      sort: 'created',
      direction: 'desc',
      per_page: 10,
      page: 1,
    });

    // The label is meant for the issues this action creates, so a pull request wearing it is
    // a misconfiguration. Warn once, naming all of them, rather than once per pull request.
    const pullRequests = labeledItems.filter(isPullRequest)
    if (pullRequests.length > 0) {
      const numbers = pullRequests.map((pullRequest) => "#" + pullRequest.number).join(", ")
      core.warning(
        `Ignoring pull request${pullRequests.length === 1 ? "" : "s"} ${numbers} with the ` +
        `'${labelName}' label. This action only comments on issues; the label is intended ` +
        "for the issues it creates."
      )
    }

    latestIssue = labeledItems.find((item) => !isPullRequest(item))
    if (latestIssue === undefined) {
      core.info("No open issue found.")
    }
  }

  let issueNumber;
  let create_issue_or_comment_response;
  if (latestIssue === undefined) {
    core.info("Creating new issue...")
    create_issue_or_comment_response = await octokit.rest.issues.create({
      owner,
      repo,
      title: render(titleTemplate, view),
      body: render(bodyTemplate, view),
      labels: [labelName],
    });
    issueNumber = create_issue_or_comment_response.data.number;
  } else {
    issueNumber = latestIssue.number;
    core.info("Found issue #" + String(issueNumber) + ". Creating new comment...")
    create_issue_or_comment_response = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: render(bodyTemplate, view),
    });
  }

  core.debug("create_issue_or_comment_response:\n" + JSON.stringify(create_issue_or_comment_response));

  const created = create_issue_or_comment_response.data

  return { issueNumber, created }
};

module.exports = newIssueOrCommentForLabel;
// Exported for unit tests; not part of the action's interface.
module.exports.templateView = templateView;
