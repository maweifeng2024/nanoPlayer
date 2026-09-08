import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const tag = process.argv[2];
if (!tag) throw new Error('Usage: watch-release.mjs <tag>');
const args = process.argv.slice(3);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const workflow = option('--workflow') ?? 'release.yml';
const after = option('--after');
const runId = option('--run-id');
let run = runId ? JSON.parse(execFileSync('gh', ['run', 'view', runId, '--json', 'databaseId,url'], { encoding: 'utf8' })) : undefined;
for (let attempt = 0; !run && attempt < 24; attempt++) {
  const runs = JSON.parse(execFileSync('gh', ['run', 'list', '--workflow', workflow, '--branch', workflow === 'release.yml' ? tag : 'main', '--limit', '20', '--json', 'databaseId,url,displayTitle,createdAt'], { encoding: 'utf8' }));
  run = runs.find(candidate => (!after || Date.parse(candidate.createdAt) >= Date.parse(after) - 1000) && (workflow === 'release.yml' || candidate.displayTitle.startsWith(`Publish ${tag} from run `)));
  if (!run) await setTimeout(5000);
}
if (!run) throw new Error(`No workflow appeared for ${tag}. Check Actions; the release is not complete.`);
console.log(`Waiting for builds, Release assets and website deployment: ${run.url}`);
try {
  execFileSync('gh', ['run', 'watch', String(run.databaseId), '--exit-status'], { stdio: 'inherit' });
} catch {
  console.error(`Release incomplete. Inspect ${run.url}. Resume with the latest publishing scripts: pnpm release --resume ${tag}`);
  process.exit(1);
}
console.log(`Release workflow completed successfully for ${tag}.`);
