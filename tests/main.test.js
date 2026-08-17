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
  const stringInputs = {
    'label-color': 'B60205',
    'label-description': 'Build failed in CI',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    core.getInput.mockImplementation((name) => inputs[name] ?? stringInputs[name]);
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
      "B60205",
      "Build failed in CI",
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

  // setFailed only surfaces error.message; the debug line carries the stack.
  it("should debug log the message and stack of a failure", async () => {
    newIssueOrCommentForLabel.mockRejectedValue(new Error("Something went wrong"));

    await run();

    const logged = core.debug.mock.calls[0][0];
    expect(logged).toContain("Something went wrong");
    expect(logged).toMatch(/\n\s+at /);
  });

  // The label-not-found path wraps the Octokit error via `cause`.
  it("should debug log the underlying cause of a wrapped failure", async () => {
    const cause = Object.assign(new Error("Not Found"), {
      status: 404,
      response: { data: { message: "Not Found" } },
    });
    newIssueOrCommentForLabel.mockRejectedValue(
      new Error('Label "build failed" not found and createLabel = false.', { cause }),
    );

    await run();

    const logged = core.debug.mock.calls[0][0];
    expect(logged).toContain("[cause]");
    expect(logged).toContain("status: 404");
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
