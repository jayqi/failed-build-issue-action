const core = require('@actions/core');
const github = require('@actions/github');
const nock = require('nock');
const newIssueOrCommentForLabel = require('../src/new-issue-or-comment-for-label');

// Shallow clone original @actions/github context
let originalContext = { ...github.context }

const defaultTitleTemplate = "Failed build: {{workflow}}";
const defaultBodyTemplate = `
GitHub Actions workflow [{{workflow}} #{{runNumber}}](https://github.com/{{repo.owner}}/{{repo.repo}}/actions/runs/{{runNumber}}) failed.

Event: {{eventName}}
Branch: [{{refname}}](https://github.com/{{repo.owner}}/{{repo.repo}}/tree/{{refname}})
Commit: [{{sha}}](https://github.com/{{repo.owner}}/{{repo.repo}}/commit/{{sha}})

<sup><i>Created by [jayqi/failed-build-issue-action](https://github.com/jayqi/failed-build-issue-action)</i></sup>
`;

describe("Test newIssueOrCommentForLabel", () => {
  const testOwner = "jayqi"
  const testRepo = "not-a-real-repo"
  const testLabel = "build failed";

  beforeAll(() => {
    // Mock github context
    jest.spyOn(github.context, 'repo', 'get').mockImplementation(() => {
      return {
        owner: testOwner,
        repo: testRepo
      }
    })
    github.context.ref = 'refs/heads/some-ref'
    github.context.sha = '1234567890123456789012345678901234567890'

    // Mock error/warning/info/debug
    jest.spyOn(core, 'error').mockImplementation(() => { })
    jest.spyOn(core, 'warning').mockImplementation(() => { })
    jest.spyOn(core, 'info').mockImplementation(() => { })
    jest.spyOn(core, 'debug').mockImplementation(() => { })

  });

  afterAll(() => {
    // Restore original @actions/github context
    Object.defineProperty(github, 'context', {
      value: originalContext,
    });
  })

  afterEach(() => {
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
      .query(true)
      .reply(200, []);
    // Mock create new issue
    const newIssueNumber = 100;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`)
      .reply(200, {
        number: newIssueNumber,
      });

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    expect(issueNumber).toBe(newIssueNumber);
    expect(created).toBeTruthy();
    return
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
      .query(true)
      .reply(200, [
        {
          number: existingIssueNumber,
        }
      ]);
    // Mock create comment on existing issue
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues/${existingIssueNumber}/comments`)
      .reply(200,
        {
          id: 1,
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
    expect(issueNumber).toBe(existingIssueNumber);
    expect(created).toBeTruthy();
    return
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
      .query(true)
      .reply(200, [
        {
          number: existingIssueNumber,
        }
      ]);
    // Mock create new issue
    const newIssueNumber = 100;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`)
      .reply(200, {
        number: newIssueNumber,
      });

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      false,
      true,
    )
    expect(issueNumber).toBe(newIssueNumber);
    expect(created).toBeTruthy();
    return
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
      .query(true)
      .reply(200, []);
    // Mock create new issue
    const newIssueNumber = 100;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`)
      .reply(200, {
        number: newIssueNumber,
      });

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      false,
      true,
    )
    expect(issueNumber).toBe(newIssueNumber);
    expect(created).toBeTruthy();
    return
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
      .post(`/repos/${testOwner}/${testRepo}/labels`)
      .reply(201, {
        name: testLabel,
      });
    // Mock search issues with label
    nock("https://api.github.com")
      .get(`/repos/${testOwner}/${testRepo}/issues`)
      .query(true)
      .reply(200, []);
    // Mock create new issue
    const newIssueNumber = 100;
    nock("https://api.github.com")
      .post(`/repos/${testOwner}/${testRepo}/issues`)
      .reply(200, {
        number: newIssueNumber,
      });

    const { issueNumber, created } = await newIssueOrCommentForLabel(
      "github_token_here",
      testLabel,
      defaultTitleTemplate,
      defaultBodyTemplate,
      true,
      false,
    )
    expect(issueNumber).toBe(newIssueNumber);
    expect(created).toBeTruthy();
    return
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
