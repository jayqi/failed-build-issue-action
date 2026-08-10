const core = require('@actions/core');
const github = require('@actions/github');
const nock = require('nock');
const newIssueOrCommentForLabel = require('../src/new-issue-or-comment-for-label');
const { actionYml } = require('./action-metadata');

const testOwner = "jayqi";
const testRepo = "not-a-real-repo";
const testLabel = "build failed";
const testWorkflow = "my-workflow";
const testRunNumber = 42;
const testRunId = 1234567890;
const testEventName = "push";
const testRefName = "some-ref";
const testServerUrl = "https://github.com";
const testSha = "1234567890123456789012345678901234567890";

const defaultTitleTemplate = actionYml.inputs['title-template'].default;
const defaultBodyTemplate = actionYml.inputs['body-template'].default;

// What the templates above must render to, given the context mocked in beforeAll
const expectedTitle = `Failed build: ${testWorkflow}`;
const expectedBody = `GitHub Actions workflow [${testWorkflow} #${testRunNumber}](${testServerUrl}/${testOwner}/${testRepo}/actions/runs/${testRunId}) failed.

Event: ${testEventName}
Branch: [${testRefName}](${testServerUrl}/${testOwner}/${testRepo}/tree/${testRefName})
Commit: [${testSha}](${testServerUrl}/${testOwner}/${testRepo}/commit/${testSha})

<sup><i>Created by [jayqi/failed-build-issue-action](https://github.com/jayqi/failed-build-issue-action)</i></sup>
`;

// Octokit sends every list parameter as a query string, so all values are strings
const expectedListQuery = {
  labels: testLabel,
  state: "open",
  sort: "created",
  direction: "desc",
  per_page: "10",
  page: "1",
};

// Assigning undefined to a process.env key stores the string "undefined".
const restoreEnv = (key, value) => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

// Snapshot before beforeAll overwrites it; Jest workers share process.env.
const originalEnvRefName = process.env.GITHUB_REF_NAME;

describe("Test newIssueOrCommentForLabel", () => {
  // Request bodies and query strings captured by the nock interceptors, so that
  // they can be asserted on after the call. Do not assert inside the interceptor
  // predicate -- a throwing expect() there just makes the interceptor not match,
  // and Jest reports "no match for request" instead of a useful diff.
  let captured;
  const capture = (key) => (body) => {
    captured[key] = body;
    return true;
  };

  beforeAll(() => {
    // Mock github context
    jest.spyOn(github.context, 'repo', 'get').mockImplementation(() => {
      return {
        owner: testOwner,
        repo: testRepo
      }
    })
    // An explicit empty payload, so the default case does not depend on whether
    // GITHUB_EVENT_PATH happens to be set in the running environment.
    github.context.payload = {}
    github.context.serverUrl = testServerUrl
    process.env.GITHUB_REF_NAME = testRefName
    github.context.sha = testSha
    github.context.workflow = testWorkflow
    github.context.runNumber = testRunNumber
    github.context.runId = testRunId
    github.context.eventName = testEventName

    // Mock error/warning/info/debug
    jest.spyOn(core, 'error').mockImplementation(() => { })
    jest.spyOn(core, 'warning').mockImplementation(() => { })
    jest.spyOn(core, 'info').mockImplementation(() => { })
    jest.spyOn(core, 'debug').mockImplementation(() => { })

    // Any request that isn't mocked should fail loudly rather than hit the network
    nock.disableNetConnect();
  });

  afterAll(() => {
    restoreEnv('GITHUB_REF_NAME', originalEnvRefName);
    nock.enableNetConnect();
  })

  // Restored unconditionally rather than in each test's finally: a throw during
  // nock setup would otherwise leak the value into later tests. Snapshotted rather
  // than hardcoded so the restore cannot go stale against the beforeAll defaults.
  let originalWorkflow;
  let originalPayload;
  let originalServerUrl;
  let originalRefName;

  beforeEach(() => {
    captured = {};
    originalWorkflow = github.context.workflow;
    originalPayload = github.context.payload;
    originalServerUrl = github.context.serverUrl;
    originalRefName = process.env.GITHUB_REF_NAME;
    // The deprecation tests and the pull-request test assert on call count, so history must
    // not leak in.
    core.warning.mockClear();
  });

  afterEach(() => {
    github.context.workflow = originalWorkflow;
    github.context.payload = originalPayload;
    github.context.serverUrl = originalServerUrl;
    restoreEnv('GITHUB_REF_NAME', originalRefName);
    // Every endpoint a test mocks should actually have been called. cleanAll has
    // to run even when that assertion fails, or the unconsumed interceptors leak
    // into the next test and one real failure takes the whole suite down with it.
    try {
      expect(nock.pendingMocks()).toEqual([]);
    } finally {
      nock.cleanAll();
    }
  });

  it('should create new issue if no issues exist for label', async () => {
    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(200, {
        owner: testOwner,
        repo: testRepo,
        name: testLabel,
      });
    // Mock search issues with label
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(capture('listIssues'))
      .reply(200, []);
    // Mock create new issue
    const newIssueNumber = 100;
    const testIssueHtmlUrl = `https://github.com/${testOwner}/${testRepo}/issues/${newIssueNumber}`;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`, capture('createIssue'))
      .reply(200, {
        number: newIssueNumber,
        html_url: testIssueHtmlUrl,
      });

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    expect(captured.listIssues).toEqual(expectedListQuery);
    expect(captured.createIssue).toEqual({
      title: expectedTitle,
      body: expectedBody,
      labels: [testLabel],
    });
    expect(issueNumber).toBe(newIssueNumber);
    expect(created).toEqual({
      number: newIssueNumber,
      html_url: testIssueHtmlUrl,
    });
  });

  it('should add comment to existing issue for label', async () => {
    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(200, {
        owner: testOwner,
        repo: testRepo,
        name: testLabel,
      });
    // Mock search issues with label
    const existingIssueNumber = 1;
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(capture('listIssues'))
      .reply(200, [
        {
          number: existingIssueNumber,
        }
      ]);
    // Mock create comment on existing issue
    const testCommentHtmlUrl =
      `https://github.com/${testOwner}/${testRepo}/issues/${existingIssueNumber}#issuecomment-1`;
    nock("https://api.github.com")
      .post(
        `/repos/${testOwner}/${testRepo}/issues/${existingIssueNumber}/comments`,
        capture('createComment'),
      )
      .reply(200,
        {
          id: 1,
          html_url: testCommentHtmlUrl,
        }
      );

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    expect(captured.listIssues).toEqual(expectedListQuery);
    // A comment carries only a body -- no title, no labels
    expect(captured.createComment).toEqual({ body: expectedBody });
    expect(issueNumber).toBe(existingIssueNumber);
    expect(created).toEqual({
      id: 1,
      html_url: testCommentHtmlUrl,
    });
  });

  // GitHub's REST API models every pull request as an issue, so listForRepo returns both.
  // A labeled pull request newer than the labeled issue must not become the comment target.
  it('should comment on the latest issue and ignore a newer labeled pull request', async () => {
    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(200, {
        owner: testOwner,
        repo: testRepo,
        name: testLabel,
      });
    // Mock search issues with label. Sorted created-desc, so both pull requests come first;
    // only their `pull_request` key distinguishes them from an issue.
    const existingIssueNumber = 1;
    const pullRequestNumber = 12;
    const secondPullRequestNumber = 13;
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(capture('listIssues'))
      .reply(200, [
        {
          number: pullRequestNumber,
          pull_request: {
            url:
              `https://api.github.com/repos/${testOwner}/${testRepo}/pulls/${pullRequestNumber}`,
          },
        },
        {
          number: secondPullRequestNumber,
          pull_request: {
            url:
              `https://api.github.com/repos/${testOwner}/${testRepo}/pulls/${secondPullRequestNumber}`,
          },
        },
        {
          number: existingIssueNumber,
        },
      ]);
    // Mock create comment on existing issue
    const testCommentHtmlUrl =
      `https://github.com/${testOwner}/${testRepo}/issues/${existingIssueNumber}#issuecomment-1`;
    nock("https://api.github.com")
      .post(
        `/repos/${testOwner}/${testRepo}/issues/${existingIssueNumber}/comments`,
        capture('createComment'),
      )
      .reply(200,
        {
          id: 1,
          html_url: testCommentHtmlUrl,
        }
      );

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    expect(captured.listIssues).toEqual(expectedListQuery);
    expect(captured.createComment).toEqual({ body: expectedBody });
    expect(issueNumber).toBe(existingIssueNumber);
    expect(created).toEqual({
      id: 1,
      html_url: testCommentHtmlUrl,
    });
    expect(core.warning).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        `Ignoring pull requests #${pullRequestNumber}, #${secondPullRequestNumber}`
      )
    );
  });

  it('should create a new issue when only pull requests carry the label', async () => {
    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(200, {
        owner: testOwner,
        repo: testRepo,
        name: testLabel,
      });
    // Mock search issues with label: every match is a pull request
    const pullRequestNumber = 12;
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(capture('listIssues'))
      .reply(200, [
        {
          number: pullRequestNumber,
          pull_request: {
            url:
              `https://api.github.com/repos/${testOwner}/${testRepo}/pulls/${pullRequestNumber}`,
          },
        },
      ]);
    // Mock create new issue
    const newIssueNumber = 100;
    const testIssueHtmlUrl = `https://github.com/${testOwner}/${testRepo}/issues/${newIssueNumber}`;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`, capture('createIssue'))
      .reply(200, {
        number: newIssueNumber,
        html_url: testIssueHtmlUrl,
      });

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    expect(captured.listIssues).toEqual(expectedListQuery);
    expect(captured.createIssue).toEqual({
      title: expectedTitle,
      body: expectedBody,
      labels: [testLabel],
    });
    expect(issueNumber).toBe(newIssueNumber);
    expect(created).toEqual({
      number: newIssueNumber,
      html_url: testIssueHtmlUrl,
    });
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining(`Ignoring pull request #${pullRequestNumber}`)
    );
  });

  // No list interceptor, deliberately: with always-create-new-issue set there is nothing to
  // search for. nock.disableNetConnect() turns an unwanted request into a loud failure, and
  // the captured.listIssues assertion states the intent for a reader.
  it('should create new issue without searching if alwaysCreateNewIssue=true', async () => {
    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(200, {
        owner: testOwner,
        repo: testRepo,
        name: testLabel,
      });
    // Mock create new issue
    const newIssueNumber = 100;
    const testIssueHtmlUrl = `https://github.com/${testOwner}/${testRepo}/issues/${newIssueNumber}`;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`, capture('createIssue'))
      .reply(200, {
        number: newIssueNumber,
        html_url: testIssueHtmlUrl,
      });

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      false,
      true,
    )
    expect(captured.listIssues).toBeUndefined();
    expect(captured.createIssue).toEqual({
      title: expectedTitle,
      body: expectedBody,
      labels: [testLabel],
    });
    expect(issueNumber).toBe(newIssueNumber);
    expect(created).toEqual({
      number: newIssueNumber,
      html_url: testIssueHtmlUrl,
    });
  });

  it("should error if label is not found and if createLabel=false", async () => {
    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(404, {
        message: "Not Found",
      });

    await expect(
      newIssueOrCommentForLabel(
        "github_token_here",
        testLabel,
        defaultTitleTemplate,
        defaultBodyTemplate,
        false,
        false,
      )
    )
      .rejects
      .toThrow(new Error(`Label "${testLabel}" not found and createLabel = false.`));
  });

  it("should create new label if it's not found and createLabel=true", async () => {
    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(404, {
        message: "Not Found",
      });
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/labels`, capture('createLabel'))
      .reply(201, {
        name: testLabel,
      });
    // Mock search issues with label
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(capture('listIssues'))
      .reply(200, []);
    // Mock create new issue
    const newIssueNumber = 100;
    const testIssueHtmlUrl = `https://github.com/${testOwner}/${testRepo}/issues/${newIssueNumber}`;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`, capture('createIssue'))
      .reply(200, {
        number: newIssueNumber,
        html_url: testIssueHtmlUrl,
      });

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    expect(captured.createLabel).toEqual({ name: testLabel });
    expect(captured.listIssues).toEqual(expectedListQuery);
    expect(captured.createIssue).toEqual({
      title: expectedTitle,
      body: expectedBody,
      labels: [testLabel],
    });
    expect(issueNumber).toBe(newIssueNumber);
    expect(created).toEqual({
      number: newIssueNumber,
      html_url: testIssueHtmlUrl,
    });
  });

  it("should link to the fork's branch for a pull request from a fork", async () => {
    const forkOwner = "contributor";
    const forkBranch = "feature/foo";
    github.context.payload = {
      pull_request: {
        head: {
          ref: forkBranch,
          repo: {
            full_name: `${forkOwner}/${testRepo}`,
            html_url: `${testServerUrl}/${forkOwner}/${testRepo}`,
            owner: { login: forkOwner },
          },
        },
      },
    };

    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(200, {
        owner: testOwner,
        repo: testRepo,
        name: testLabel,
      });
    // Mock search issues with label
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(capture('listIssues'))
      .reply(200, []);
    // Mock create new issue
    const newIssueNumber = 100;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`, capture('createIssue'))
      .reply(200, {
        number: newIssueNumber,
        html_url: `https://github.com/${testOwner}/${testRepo}/issues/${newIssueNumber}`,
      });

    await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    expect(captured.createIssue.body).toContain(
      `Branch: [${forkOwner}:${forkBranch}](${testServerUrl}/${forkOwner}/${testRepo}/tree/${forkBranch})`
    );
  });

  it("should use serverUrl for every link, not a hardcoded github.com", async () => {
    // Assigned directly, not via GITHUB_SERVER_URL: Context reads that in its
    // constructor, and this suite mutates the already-constructed singleton.
    const ghesUrl = "https://github.example.com";
    github.context.serverUrl = ghesUrl;

    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(200, {
        owner: testOwner,
        repo: testRepo,
        name: testLabel,
      });
    // Mock search issues with label
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(capture('listIssues'))
      .reply(200, []);
    // Mock create new issue
    const newIssueNumber = 100;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`, capture('createIssue'))
      .reply(200, {
        number: newIssueNumber,
        html_url: `https://github.com/${testOwner}/${testRepo}/issues/${newIssueNumber}`,
      });

    await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    const body = captured.createIssue.body;
    expect(body).toContain(`(${ghesUrl}/${testOwner}/${testRepo}/actions/runs/${testRunId})`);
    expect(body).toContain(`(${ghesUrl}/${testOwner}/${testRepo}/tree/${testRefName})`);
    expect(body).toContain(`(${ghesUrl}/${testOwner}/${testRepo}/commit/${testSha})`);
    // Scoped to the user's repo path -- the footer link to this action's own
    // repository is legitimately on github.com.
    expect(body).not.toContain(`https://github.com/${testOwner}/${testRepo}`);
  });

  it("should error if label existence check returns some other error", async () => {
    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(400, {
        message: "Bad Request",
      });

    await expect(
      newIssueOrCommentForLabel(
        "github_token_here",
        testLabel,
        defaultTitleTemplate,
        defaultBodyTemplate,
        false,
        false,
      )
    )
      .rejects
      .toThrow(new Error("Bad Request"));
  });

  it("should not HTML-escape special characters in the issue title", async () => {
    const specialWorkflow = `Build & Test's "Suite"`;
    github.context.workflow = specialWorkflow;

    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(200, {
        owner: testOwner,
        repo: testRepo,
        name: testLabel,
      });
    // Mock search issues with label
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(capture('listIssues'))
      .reply(200, []);
    // Mock create new issue
    const newIssueNumber = 100;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`, capture('createIssue'))
      .reply(200, {
        number: newIssueNumber,
        html_url: `https://github.com/${testOwner}/${testRepo}/issues/${newIssueNumber}`,
      });

    await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    expect(captured.createIssue.title).toBe(`Failed build: ${specialWorkflow}`);
  });

  it("should not HTML-escape special characters wrapped in backticks in the issue body", async () => {
    const specialWorkflow = `Build & Test's "Suite"`;
    const bodyTemplateWithCodeSpan = "Workflow `{{workflow}}` failed on `{{refName}}`.";
    github.context.workflow = specialWorkflow;

    // Mock check if label exists
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/labels/${encodeURI(testLabel)}`)
      .reply(200, {
        owner: testOwner,
        repo: testRepo,
        name: testLabel,
      });
    // Mock search issues with label
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(capture('listIssues'))
      .reply(200, []);
    // Mock create new issue
    const newIssueNumber = 100;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`, capture('createIssue'))
      .reply(200, {
        number: newIssueNumber,
        html_url: `https://github.com/${testOwner}/${testRepo}/issues/${newIssueNumber}`,
      });

    await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      bodyTemplateWithCodeSpan,
      true,
      false,
    )
    expect(captured.createIssue.body).toBe(`Workflow \`${specialWorkflow}\` failed on \`${testRefName}\`.`);
  });
});
