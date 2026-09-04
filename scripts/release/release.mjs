import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const root = new URL('../..', import.meta.url);
const cliArgs = process.argv.slice(2);
const explicitVersion = cliArgs.find((arg) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(arg));
const skipChecks = cliArgs.includes('--skip-checks');

function run(command, commandArgs) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  return execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
}

function output(command, commandArgs) {
  return execFileSync(command, commandArgs, { cwd: root, encoding: 'utf8' }).trim();
}

const branch = output('git', ['branch', '--show-current']);
if (branch !== 'main') throw new Error(`Release must start from main; current branch is ${branch || '(detached)'}.`);

const remote = output('git', ['remote', 'get-url', 'origin']);
if (!/github\.com[/:]/.test(remote)) throw new Error(`origin is not a GitHub remote: ${remote}`);
run('gh', ['auth', 'status']);

const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const current = pkg.version.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!current && !explicitVersion) throw new Error(`Cannot infer the next patch version from ${pkg.version}; pass an explicit version.`);
const version = explicitVersion ?? `${current[1]}.${current[2]}.${Number(current[3]) + 1}`;
const tag = `v${version}`;

run('git', ['fetch', 'origin', 'main', '--tags']);
if (output('git', ['rev-list', '--left-right', '--count', 'HEAD...origin/main']) !== '0\t0') {
  throw new Error('Local main and origin/main differ. Pull/rebase or push outstanding commits first.');
}
try {
  output('git', ['rev-parse', '--verify', `refs/tags/${tag}`]);
  throw new Error(`Tag ${tag} already exists locally.`);
} catch (error) {
  if (error.message?.startsWith('Tag ')) throw error;
}

run('node', ['scripts/release/set-version.mjs', version]);
run('node', ['scripts/release/check-version.mjs']);
if (!skipChecks) {
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
run('git', ['push', 'origin', 'main', tag]);

console.log(`\n${tag} is pushed. GitHub Actions will build all three platforms, publish the Release, update the website, and deploy it to Vercel.`);
console.log('Track it with: gh run watch');
