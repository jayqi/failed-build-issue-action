const core = require('@actions/core');
const Mustache = require('mustache');
const { templateView } = require('../src/new-issue-or-comment-for-label');

// A stand-in for @actions/github's Context: repo/issue are inherited getters, not
// stored values, which is exactly what the view has to preserve.
class FakeContext {
  constructor() { this.workflow = "wf"; this.payload = {}; }
  get repo() { return { owner: "o", repo: "r" }; }
  get issue() { return { ...this.repo, number: 7 }; }
}

beforeEach(() => { jest.spyOn(core, 'warning').mockImplementation(() => { }); });
afterEach(() => { jest.restoreAllMocks(); });

const ref = { refName: "main", refUrl: "https://x/tree/main" };

it("exposes inherited getters as plain data", () => {
  const view = templateView(new FakeContext(), ref);
  expect(Mustache.render("{{repo.owner}}/{{repo.repo}} {{issue.number}} {{workflow}}", view))
    .toBe("o/r 7 wf");
});

it("warns once no matter how many times a template reads the alias", () => {
  const view = templateView(new FakeContext(), ref);
  expect(Mustache.render("{{refname}} {{refname}}", view)).toBe("main main");
  expect(Mustache.render("{{refname}}", view)).toBe("main");
  expect(core.warning).toHaveBeenCalledTimes(1);
});

it("does not warn when the view is serialized for the debug log", () => {
  JSON.stringify(templateView(new FakeContext(), ref));
  expect(core.warning).not.toHaveBeenCalled();
});
