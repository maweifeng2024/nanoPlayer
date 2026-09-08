import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const tag = process.argv[2] ?? `v${JSON.parse(fs.readFileSync('package.json')).version}`;
if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Usage: pnpm release --resume [v0.1.6]');
const json = args => JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
const builds = json(['run', 'list', '--workflow', 'release.yml', '--branch', tag, '--limit', '20', '--json', 'databaseId,status']);
if (!builds.length) throw new Error(`No original build found for ${tag}`);
const source = builds[0];
if (source.status !== 'completed') {
  execFileSync('node', ['scripts/release/watch-release.mjs', tag, '--run-id', String(source.databaseId)], { stdio: 'inherit' });
  process.exit(0);
}
const started = new Date().toISOString();
execFileSync('gh', ['workflow', 'run', 'publish-release.yml', '--ref', 'main', '-f', `tag=${tag}`, '-f', `source_run_id=${source.databaseId}`], { stdio: 'inherit' });
execFileSync('node', ['scripts/release/watch-release.mjs', tag, '--workflow', 'publish-release.yml', '--after', started], { stdio: 'inherit' });
