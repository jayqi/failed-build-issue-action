jest.mock('@actions/core');
jest.mock('../src/new-issue-or-comment-for-label');

const core = require('@actions/core');
const newIssueOrCommentForLabel = require('../src/new-issue-or-comment-for-label');
const { run } = require('../src/main');

describe("Test run", () => {
  const testHtmlUrl = "https://github.com/jayqi/not-a-real-repo/issues/100";
  const inputs = {
    'github-token': "github_token_here",
    'label-name': "build failed",
    'title-template': "Failed build: {{workflow}}",
    'body-template': "Build failed on {{refName}}.",
  };
  const booleanInputs = {
    'create-label': true,
    'always-create-new-issue': false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    core.getInput.mockImplementation((name) => inputs[name]);
    core.getBooleanInput.mockImplementation((name) => booleanInputs[name]);
  });

  it("should pass inputs through and set outputs", async () => {
    newIssueOrCommentForLabel.mockResolvedValue({
      issueNumber: 100,
      created: { number: 100, html_url: testHtmlUrl },
    });

    await run();

    // Argument order matters: the signature ends in two adjacent booleans
    // that are trivially transposable.
    expect(newIssueOrCommentForLabel).toHaveBeenCalledWith(
      "github_token_here",
      "build failed",
      "Failed build: {{workflow}}",
      "Build failed on {{refName}}.",
      true,
      false,
    );
    expect(core.setOutput).toHaveBeenCalledWith('issue-number', 100);
    expect(core.setOutput).toHaveBeenCalledWith('html-url', testHtmlUrl);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("should read boolean inputs with getBooleanInput", async () => {
    newIssueOrCommentForLabel.mockResolvedValue({
      issueNumber: 1,
      created: { html_url: testHtmlUrl },
    });

    await run();

    expect(core.getBooleanInput).toHaveBeenCalledWith('create-label');
    expect(core.getBooleanInput).toHaveBeenCalledWith('always-create-new-issue');
    expect(core.getInput).not.toHaveBeenCalledWith('create-label');
    expect(core.getInput).not.toHaveBeenCalledWith('always-create-new-issue');
  });

  it("should set failed when newIssueOrCommentForLabel throws", async () => {
    newIssueOrCommentForLabel.mockRejectedValue(new Error("Something went wrong"));

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("Something went wrong");
    expect(core.setOutput).not.toHaveBeenCalled();
  });
});
