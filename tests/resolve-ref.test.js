const resolveRef = require('../src/resolve-ref');

const testOwner = "jayqi";
const testRepo = "not-a-real-repo";
const testServerUrl = "https://github.com";
const baseRepoUrl = `${testServerUrl}/${testOwner}/${testRepo}`;

// Only the fields resolveRef reads.
const makeContext = (overrides = {}) => ({
  serverUrl: testServerUrl,
  repo: { owner: testOwner, repo: testRepo },
  payload: {},
  ...overrides,
});

const forkOwner = "contributor";
const forkRepoUrl = `${testServerUrl}/${forkOwner}/${testRepo}`;

// Shapes match the head objects GitHub sends on pull_request and workflow_run.
const forkHeadRepo = {
  full_name: `${forkOwner}/${testRepo}`,
  html_url: forkRepoUrl,
  owner: { login: forkOwner },
};
const sameHeadRepo = {
  full_name: `${testOwner}/${testRepo}`,
  html_url: baseRepoUrl,
  owner: { login: testOwner },
};

// What GITHUB_REF_NAME actually holds during a pull request, and it 404s. Passed
// to every test below so the payload has to win.
const prEnv = { GITHUB_REF_NAME: "123/merge" };

describe("resolveRef", () => {
  describe("without a pull request or workflow_run payload", () => {
    it("resolves a branch from GITHUB_REF_NAME", () => {
      expect(resolveRef(makeContext(), { GITHUB_REF_NAME: "main" })).toEqual({
        refName: "main",
        refUrl: `${baseRepoUrl}/tree/main`,
      });
    });

    // Issue #125: taking the last path segment yielded "foo" and a 404 link.
    it("keeps every segment of a branch name containing slashes", () => {
      expect(resolveRef(makeContext(), { GITHUB_REF_NAME: "feature/foo" })).toEqual({
        refName: "feature/foo",
        refUrl: `${baseRepoUrl}/tree/feature/foo`,
      });
    });

    it("keeps every segment of a tag name containing slashes", () => {
      expect(resolveRef(makeContext(), { GITHUB_REF_NAME: "release/2024" })).toEqual({
        refName: "release/2024",
        refUrl: `${baseRepoUrl}/tree/release/2024`,
      });
    });

    // Git permits parens in ref names, and a raw ")" would close the link early.
    it("percent-encodes parentheses in refUrl but leaves refName raw", () => {
      expect(resolveRef(makeContext(), { GITHUB_REF_NAME: "feature/foo(bar)" })).toEqual({
        refName: "feature/foo(bar)",
        refUrl: `${baseRepoUrl}/tree/feature/foo%28bar%29`,
      });
    });

    it("percent-encodes other reserved characters in a ref name", () => {
      expect(resolveRef(makeContext(), { GITHUB_REF_NAME: "feature/50%" })).toEqual({
        refName: "feature/50%",
        refUrl: `${baseRepoUrl}/tree/feature/50%25`,
      });
    });

    it("yields empty strings when GITHUB_REF_NAME is unset", () => {
      expect(resolveRef(makeContext(), {})).toEqual({ refName: "", refUrl: "" });
    });

    it("honors a GitHub Enterprise Server serverUrl", () => {
      const ghesUrl = "https://github.example.com";
      expect(
        resolveRef(makeContext({ serverUrl: ghesUrl }), { GITHUB_REF_NAME: "main" })
      ).toEqual({
        refName: "main",
        refUrl: `${ghesUrl}/${testOwner}/${testRepo}/tree/main`,
      });
    });
  });

  describe("with a pull request payload", () => {
    const pullRequestContext = (head) =>
      makeContext({ eventName: "pull_request", payload: { pull_request: { head } } });

    it("resolves a same-repo pull request from its head ref", () => {
      const context = pullRequestContext({ ref: "feature/foo", repo: sameHeadRepo });
      expect(resolveRef(context, prEnv)).toEqual({
        refName: "feature/foo",
        refUrl: `${baseRepoUrl}/tree/feature/foo`,
      });
    });

    it("bases a fork pull request on the fork and prefixes refName with its owner", () => {
      const context = pullRequestContext({ ref: "feature/foo", repo: forkHeadRepo });
      expect(resolveRef(context, prEnv)).toEqual({
        refName: `${forkOwner}:feature/foo`,
        refUrl: `${forkRepoUrl}/tree/feature/foo`,
      });
    });

    // Why the fork check compares full_name and not just the owner.
    it("treats a same-owner different-repo head as a fork", () => {
      const siblingRepo = {
        full_name: `${testOwner}/some-other-repo`,
        html_url: `${testServerUrl}/${testOwner}/some-other-repo`,
        owner: { login: testOwner },
      };
      const context = pullRequestContext({ ref: "feature/foo", repo: siblingRepo });
      expect(resolveRef(context, prEnv)).toEqual({
        refName: `${testOwner}:feature/foo`,
        refUrl: `${testServerUrl}/${testOwner}/some-other-repo/tree/feature/foo`,
      });
    });

    // GitHub treats owner and repo names case-insensitively.
    it("does not treat a case-different head full_name as a fork", () => {
      const context = pullRequestContext({
        ref: "feature/foo",
        repo: { ...sameHeadRepo, full_name: `JayQi/${testRepo}` },
      });
      expect(resolveRef(context, prEnv)).toEqual({
        refName: "feature/foo",
        refUrl: `${baseRepoUrl}/tree/feature/foo`,
      });
    });

    // head.repo is null once a fork is deleted.
    it("falls back to the base repo when the head repo is absent", () => {
      const context = pullRequestContext({ ref: "feature/foo" });
      expect(resolveRef(context, prEnv)).toEqual({
        refName: "feature/foo",
        refUrl: `${baseRepoUrl}/tree/feature/foo`,
      });
    });

    it("never falls back to GITHUB_REF_NAME when a pull request payload is present", () => {
      const context = pullRequestContext({ ref: "feature/foo", repo: sameHeadRepo });
      const { refName, refUrl } = resolveRef(context, prEnv);
      expect(refName).not.toContain("merge");
      expect(refUrl).not.toContain("merge");
    });

    // This is what makes pull_request_target work without naming it.
    it("resolves from the payload regardless of eventName", () => {
      const head = { ref: "feature/foo", repo: sameHeadRepo };
      const payload = { pull_request: { head } };
      const asTarget = resolveRef(
        makeContext({ eventName: "pull_request_target", payload }), prEnv
      );
      const asPlain = resolveRef(
        makeContext({ eventName: "pull_request", payload }), prEnv
      );
      expect(asTarget).toEqual(asPlain);
      expect(asTarget.refName).toBe("feature/foo");
    });
  });

  describe("with a workflow_run payload", () => {
    // The default branch, not the branch that failed -- the bug being fixed.
    const runEnv = { GITHUB_REF_NAME: "main" };
    const workflowRunContext = (head_branch, head_repository) =>
      makeContext({
        eventName: "workflow_run",
        payload: { workflow_run: { head_branch, head_repository } },
      });

    it("resolves a same-repo workflow_run from head_branch", () => {
      const context = workflowRunContext("feature/foo", sameHeadRepo);
      expect(resolveRef(context, runEnv)).toEqual({
        refName: "feature/foo",
        refUrl: `${baseRepoUrl}/tree/feature/foo`,
      });
    });

    it("bases a fork workflow_run on the fork", () => {
      const context = workflowRunContext("feature/foo", forkHeadRepo);
      expect(resolveRef(context, runEnv)).toEqual({
        refName: `${forkOwner}:feature/foo`,
        refUrl: `${forkRepoUrl}/tree/feature/foo`,
      });
    });
  });
});
