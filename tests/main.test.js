jest.mock('@actions/core');
jest.mock('../src/new-issue-or-comment-for-label');

const core = require('@actions/core');
const newIssueOrCommentForLabel = require('../src/new-issue-or-comment-for-label');
const { run } = require('../src/main');
const { declaredInputs } = require('./action-metadata');

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

  it("logs the stack instead of an empty object for plain errors", async () => {
    newIssueOrCommentForLabel.mockRejectedValue(new Error("Something went wrong"));

    await run();

    expect(core.debug).toHaveBeenCalledWith(
      expect.stringContaining("Error:\nError: Something went wrong"),
    );
  });

  it("includes status and response data for Octokit RequestErrors", async () => {
    const octokitError = Object.assign(new Error("Request failed"), {
      status: 500,
      response: { data: { message: "boom" } },
    });
    newIssueOrCommentForLabel.mockRejectedValue(octokitError);

    await run();

    const debugCall = core.debug.mock.calls[0][0];
    expect(debugCall).toContain("status: 500");
    expect(debugCall).toContain('"message":"boom"');
  });

  it("reads exactly the inputs declared in action.yml", async () => {
    newIssueOrCommentForLabel.mockResolvedValue({
      issueNumber: 1,
      created: { html_url: testHtmlUrl },
    });

    await run();

    // Catches both directions of drift: main.js reading an undeclared input,
    // or action.yml declaring one that nothing reads.
    const requested = [
      ...core.getInput.mock.calls,
      ...core.getBooleanInput.mock.calls,
    ].map(([name]) => name);
    expect([...new Set(requested)].sort()).toEqual(declaredInputs);
  });
});
