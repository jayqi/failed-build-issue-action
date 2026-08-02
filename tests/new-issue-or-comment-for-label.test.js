const core = require('@actions/core');
const github = require('@actions/github');
const nock = require('nock');
const newIssueOrCommentForLabel = require('../src/new-issue-or-comment-for-label');

// Shallow clone original @actions/github context
let originalContext = { ...github.context }

const testOwner = "jayqi";
const testRepo = "not-a-real-repo";
const testLabel = "build failed";
const testWorkflow = "my-workflow";
const testRunNumber = 42;
const testRunId = 1234567890;
const testEventName = "push";
const testRefName = "some-ref";
const testSha = "1234567890123456789012345678901234567890";

// Keep these in sync with the defaults in action.yml
const defaultTitleTemplate = "Failed build: {{workflow}}";
const defaultBodyTemplate = `GitHub Actions workflow [{{workflow}} #{{runNumber}}](https://github.com/{{repo.owner}}/{{repo.repo}}/actions/runs/{{runId}}) failed.

Event: {{eventName}}
Branch: [{{refname}}](https://github.com/{{repo.owner}}/{{repo.repo}}/tree/{{refname}})
Commit: [{{sha}}](https://github.com/{{repo.owner}}/{{repo.repo}}/commit/{{sha}})

<sup><i>Created by [jayqi/failed-build-issue-action](https://github.com/jayqi/failed-build-issue-action)</i></sup>
`;

// What the templates above must render to, given the context mocked in beforeAll
const expectedTitle = `Failed build: ${testWorkflow}`;
const expectedBody = `GitHub Actions workflow [${testWorkflow} #${testRunNumber}](https://github.com/${testOwner}/${testRepo}/actions/runs/${testRunId}) failed.

Event: ${testEventName}
Branch: [${testRefName}](https://github.com/${testOwner}/${testRepo}/tree/${testRefName})
Commit: [${testSha}](https://github.com/${testOwner}/${testRepo}/commit/${testSha})

<sup><i>Created by [jayqi/failed-build-issue-action](https://github.com/jayqi/failed-build-issue-action)</i></sup>
`;

// Octokit sends every list parameter as a query string, so all values are strings
const expectedListQuery = {
  labels: testLabel,
  state: "open",
  sort: "created",
  direction: "desc",
  per_page: "1",
  page: "1",
};

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
    github.context.ref = `refs/heads/${testRefName}`
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
    nock.enableNetConnect();
    // Restore original @actions/github context
    Object.defineProperty(github, 'context', {
      value: originalContext,
    });
  })

  beforeEach(() => {
    captured = {};
  });

  afterEach(() => {
    // Every endpoint a test mocks should actually have been called
    expect(nock.pendingMocks()).toEqual([]);
    nock.cleanAll();
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

  it('should create new issue if alwaysCreateNewIssue=true with existing issue', async () => {
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

  it('should create new issue if alwaysCreateNewIssue=true and no existing issue', async () => {
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
      false,
      true,
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
      .toThrow(`"${testLabel}" not found and createLabel = false`);
    return
  });

  it("should create new label it's not found and if createLabel=true", async () => {
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

  it("should error label existence check is some other error", async () => {
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
      .toThrow("Bad Request");
    return
  });
});
