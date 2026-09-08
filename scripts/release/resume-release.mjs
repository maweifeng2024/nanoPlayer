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
// Once Release publication succeeded, recover only its website job using the
// already-published artifact. Do not upload the same installers again.
let publishedRun;
const previous = json(['run', 'list', '--workflow', 'publish-release.yml', '--branch', 'main', '--limit', '100', '--json', 'databaseId,displayTitle,status,conclusion,url']);
const matching = previous.filter(run => run.displayTitle.startsWith(`Publish ${tag} from run `));
const latest = matching[0];
if (latest && latest.status !== 'completed') {
  execFileSync('node', ['scripts/release/watch-release.mjs', tag, '--run-id', String(latest.databaseId)], { stdio: 'inherit' });
  process.exit(0);
}
if (latest?.conclusion === 'success') {
  console.log(`${tag} recovery already completed successfully: ${latest.url}`);
  process.exit(0);
}
for (const candidate of matching) {
  const { jobs } = json(['run', 'view', String(candidate.databaseId), '--json', 'jobs']);
  if (jobs.some(job => job.name === 'publish' && job.conclusion === 'success')) { publishedRun = candidate.databaseId; break; }
}
const started = new Date().toISOString();
execFileSync('gh', ['workflow', 'run', 'publish-release.yml', '--ref', 'main', '-f', `tag=${tag}`, '-f', `source_run_id=${source.databaseId}`, ...(publishedRun ? ['-f', `published_run_id=${publishedRun}`] : [])], { stdio: 'inherit' });
execFileSync('node', ['scripts/release/watch-release.mjs', tag, '--workflow', 'publish-release.yml', '--after', started], { stdio: 'inherit' });
