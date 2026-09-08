// Resolve local-tag recovery before the remote-workflow recovery guard.
// Read failures must propagate: an unreachable remote is not a missing tag.
export function recoverPush(tag, { output, succeeds, network, watch }) {
  const ref = `refs/tags/${tag}`;
  if (!succeeds('git', ['show-ref', '--verify', '--quiet', ref])) return false;
  const localCommit = output('git', ['rev-parse', `${ref}^{commit}`]);
  const remoteRefs = network(['ls-remote', 'origin', ref, `${ref}^{}`], true).trim();
  if (remoteRefs) {
    const entries = new Map(remoteRefs.split('\n').map(line => {
      const [sha, name] = line.split(/\s+/);
      return [name, sha];
    }));
    if ((entries.get(`${ref}^{}`) ?? entries.get(ref)) !== localCommit) {
      throw new Error(`${tag} differs from GitHub. Refusing to overwrite an existing release tag.`);
    }
    return false;
  }
  if (output('git', ['status', '--porcelain'])) throw new Error(`Commit pending changes before resuming the push for ${tag}.`);
  if (!succeeds('git', ['merge-base', '--is-ancestor', localCommit, 'HEAD'])) {
    throw new Error(`${tag} is not on main. Refusing to push an unrelated release.`);
  }
  if (!succeeds('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])) {
    throw new Error(`main has diverged. Merge origin/main while preserving ${tag}, then resume; do not rebase or move the release tag.`);
  }
  console.log(`\n${tag} exists locally but has not reached GitHub. Resuming its atomic push...`);
  network(['push', '--atomic', 'origin', 'main', ref]);
  watch(tag);
  return true;
}
