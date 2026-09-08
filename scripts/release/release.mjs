import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { parseReleaseArgs, releaseIsComplete } from './release-options.mjs';
import { recoverPush } from './recover-push.mjs';

const root = new URL('../..', import.meta.url);
const cliArgs = process.argv.slice(2);

function run(command, commandArgs) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  return execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
}

function output(command, commandArgs) {
  return execFileSync(command, commandArgs, { cwd: root, encoding: 'utf8' }).trim();
}

function succeeds(command, commandArgs) {
  try {
    execFileSync(command, commandArgs, { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runGitNetwork(commandArgs, capture = false) {
  const options = { cwd: root, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', timeout: 120000 };
  try {
    return execFileSync('git', ['-c', 'http.lowSpeedLimit=1', '-c', 'http.lowSpeedTime=30', ...commandArgs], options);
  } catch {
    console.warn('\nGitHub operation failed or timed out. Retrying this command with HTTP/1.1...');
    return execFileSync('git', [
      '-c',
      'http.version=HTTP/1.1',
      '-c',
      'http.lowSpeedLimit=1',
      '-c',
      'http.lowSpeedTime=30',
      ...commandArgs,
    ], options);
  }
}

function main() {
  const { explicitVersion, resume, skipChecks, resumeTag } = parseReleaseArgs(cliArgs);
  const branch = output('git', ['branch', '--show-current']);
  if (branch !== 'main') throw new Error(`Release must start from main; current branch is ${branch || '(detached)'}.`);

  const remote = output('git', ['remote', 'get-url', 'origin']);
  if (!/github\.com[/:]/.test(remote)) throw new Error(`origin is not a GitHub remote: ${remote}`);
  run('gh', ['auth', 'status']);

  runGitNetwork(['fetch', 'origin', 'main', '--tags']);
  const requestedTag = resumeTag ?? `v${explicitVersion ?? JSON.parse(output('git', ['show', 'HEAD:package.json'])).version}`;
  if (recoverPush(requestedTag, {
    output, succeeds, network: runGitNetwork,
    watch: tag => run('node', ['scripts/release/watch-release.mjs', tag]),
  })) return;
  let [ahead, behind] = output('git', ['rev-list', '--left-right', '--count', 'HEAD...origin/main'])
    .split(/\s+/)
    .map(Number);
  if (behind > 0) {
    console.log(`\nLocal main is ${behind} commit(s) behind origin/main. Rebasing while preserving current changes...`);
    runGitNetwork(['pull', '--rebase', '--autostash', 'origin', 'main']);
    [ahead, behind] = output('git', ['rev-list', '--left-right', '--count', 'HEAD...origin/main'])
      .split(/\s+/)
      .map(Number);
  }

  if (resume) {
    if (ahead > 0 || output('git', ['status', '--porcelain'])) throw new Error('Commit and push release-script fixes before resuming; recovery runs the scripts on origin/main.');
    run('node', ['scripts/release/resume-release.mjs', ...(resumeTag ? [resumeTag.startsWith('v') ? resumeTag : `v${resumeTag}`] : [])]);
    process.exit(0);
  }

  const headPackage = JSON.parse(output('git', ['show', 'HEAD:package.json']));
  const pendingTag = `v${headPackage.version}`;
  const pendingTagCommit = `${pendingTag}^{}`;
  const pendingTagIsHead = succeeds('git', ['merge-base', '--is-ancestor', pendingTagCommit, 'HEAD'])
    && output('git', ['rev-parse', pendingTagCommit]) === output('git', ['rev-parse', 'HEAD']);
  const worktreeIsClean = output('git', ['status', '--porcelain']) === '';
  if (ahead > 0 && behind === 0 && pendingTagIsHead && worktreeIsClean) {
    console.log(`\nResuming interrupted push for ${pendingTag}...`);
    runGitNetwork(['push', '--atomic', 'origin', 'main', pendingTag]);
    console.log(`\n${pendingTag} is pushed. GitHub Actions will continue the release.`);
    run('node', ['scripts/release/watch-release.mjs', pendingTag]);
    process.exit(0);
  }

  // Re-running an incomplete release must not silently advance the patch version.
  if (!explicitVersion) {
    const runs = JSON.parse(output('gh', ['run', 'list', '--workflow', 'release.yml', '--branch', pendingTag, '--limit', '1', '--json', 'conclusion,status']));
    const recoveries = runs[0] && runs[0].conclusion !== 'success'
      ? JSON.parse(output('gh', ['run', 'list', '--workflow', 'publish-release.yml', '--branch', 'main', '--limit', '100', '--json', 'displayTitle,conclusion,status']))
      : [];
    if (runs[0] && !releaseIsComplete(pendingTag, runs[0], recoveries)) {
      throw new Error(`${pendingTag} is incomplete. Resume without changing versions: pnpm release --resume ${pendingTag}`);
    }
  }

  const current = headPackage.version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!current && !explicitVersion) throw new Error(`Cannot infer the next patch version from HEAD version ${headPackage.version}; pass an explicit version.`);
  const version = explicitVersion ?? `${current[1]}.${current[2]}.${Number(current[3]) + 1}`;
  const tag = `v${version}`;

  if (ahead > 0 && behind === 0) console.log(`\nIncluding ${ahead} existing local commit(s) in this release.`);
  if (succeeds('git', ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`])) {
    throw new Error(`Tag ${tag} already exists locally.`);
  }

  run('node', ['scripts/release/set-version.mjs', version]);
  run('node', ['scripts/release/check-version.mjs']);
  if (!skipChecks) {
    run('node', ['--test', ...fs.readdirSync(new URL('scripts/release/', root)).filter(name => name.endsWith('.test.mjs')).map(name => `scripts/release/${name}`)]);
    run('pnpm', ['check']);
    run('pnpm', ['test:e2e']);
    run('cargo', ['fmt', '--check', '--manifest-path', 'src-tauri/Cargo.toml']);
    run('cargo', ['clippy', '--manifest-path', 'src-tauri/Cargo.toml', '--', '-D', 'warnings']);
    run('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml']);
    run('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml', 'database::tests::search_benchmark_10000_tracks', '--', '--ignored', '--exact']);
    run('npm', ['run', 'build', '--prefix', 'website']);
  }

  run('git', ['add', '--all']);
  if (!output('git', ['status', '--porcelain'])) throw new Error('There are no changes to commit.');
  run('git', ['commit', '-m', `release: ${tag}`]);
  run('git', ['tag', '-a', tag, '-m', `nanoPlayer ${tag}`]);
  runGitNetwork(['push', '--atomic', 'origin', 'main', tag]);

  console.log(`\n${tag} is pushed. GitHub Actions will build all three platforms, publish the Release, update the website, and deploy it to Vercel.`);
  console.log('Track it with: gh run watch');
  run('node', ['scripts/release/watch-release.mjs', tag]);

}
try { main(); } catch (error) {
  console.error(`\nRelease failed: ${error.message.split('\n')[0]}`);
  console.error('Retry the same version (including an interrupted push): pnpm release --resume [tag]. GitHub connectivity is required.');
  process.exitCode = 1;
}
