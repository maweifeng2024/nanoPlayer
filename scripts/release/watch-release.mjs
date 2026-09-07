import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const tag = process.argv[2];
if (!tag) throw new Error('Usage: watch-release.mjs <tag>');
let run;
for (let attempt = 0; attempt < 24; attempt++) {
  const runs = JSON.parse(execFileSync('gh', ['run', 'list', '--workflow', 'release.yml', '--branch', tag, '--limit', '1', '--json', 'databaseId,url'], { encoding: 'utf8' }));
  if (runs.length) { run = runs[0]; break; }
  await setTimeout(5000);
}
if (!run) throw new Error(`No workflow appeared for ${tag}. Check Actions; the release is not complete.`);
console.log(`Waiting for builds, Release assets and website deployment: ${run.url}`);
try {
  execFileSync('gh', ['run', 'watch', String(run.databaseId), '--exit-status'], { stdio: 'inherit' });
} catch {
  console.error(`Release incomplete. Inspect ${run.url}. Retry failed jobs: gh run rerun ${run.databaseId} --failed`);
  process.exit(1);
}
console.log(`Release workflow completed successfully for ${tag}.`);
