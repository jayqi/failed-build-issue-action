// Two values rather than one because no single string works as both: a URL needs
// percent-encoding, and for a fork the branch is not in this repository at all. #143

// Per segment, not the whole ref: encodeURIComponent would turn feature/foo's slash
// into %2F, which does not resolve (#125). Parens need the explicit pass because
// encodeURIComponent leaves them and a raw ")" ends the markdown link early.
const encodeRefPath = (ref) =>
  ref
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29")
    )
    .join("/");

const treeUrl = (repoUrl, ref) => `${repoUrl}/tree/${encodeRefPath(ref)}`;

// full_name rather than owner, because a fork can live under the same owner. An
// absent headRepo means the fork was deleted; nothing correct is left to link to.
const fromHead = (ref, headRepo, baseRepoUrl, baseFullName) => {
  const isFork =
    headRepo?.full_name &&
    headRepo.full_name.toLowerCase() !== baseFullName.toLowerCase();
  if (isFork) {
    return {
      refName: `${headRepo.owner.login}:${ref}`,
      refUrl: treeUrl(headRepo.html_url, ref),
    };
  }
  return { refName: ref, refUrl: treeUrl(baseRepoUrl, ref) };
};

const resolveRef = (context, env) => {
  const baseFullName = `${context.repo.owner}/${context.repo.repo}`;
  const baseRepoUrl = `${context.serverUrl}/${baseFullName}`;

  // Keyed on payload, not eventName, so pull_request_target resolves the same way.
  // GITHUB_REF is refs/pull/<n>/merge here and 404s.
  const pull = context.payload?.pull_request;
  if (pull?.head?.ref) {
    return fromHead(pull.head.ref, pull.head.repo, baseRepoUrl, baseFullName);
  }

  // GITHUB_REF is the default branch here, not the branch that failed
  const run = context.payload?.workflow_run;
  if (run?.head_branch) {
    return fromHead(run.head_branch, run.head_repository, baseRepoUrl, baseFullName);
  }

  // Deliberately no fallback to context.ref: GITHUB_REF_NAME is unset under Jest, so
  // a hybrid would leave the tests and production on different paths.
  const refName = env.GITHUB_REF_NAME || "";
  return { refName, refUrl: refName ? treeUrl(baseRepoUrl, refName) : "" };
};

module.exports = resolveRef;
