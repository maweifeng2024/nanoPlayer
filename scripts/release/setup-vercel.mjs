import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../..', import.meta.url);
const link = JSON.parse(fs.readFileSync(new URL('../../website/.vercel/project.json', import.meta.url), 'utf8'));
if (!link.orgId || !link.projectId) throw new Error('Link website to Vercel first.');
for (const [key, value] of Object.entries({ VERCEL_ORG_ID: link.orgId, VERCEL_PROJECT_ID: link.projectId })) {
  execFileSync('gh', ['secret', 'set', key], { cwd: root, input: value, stdio: ['pipe', 'inherit', 'inherit'] });
}
console.log('Paste a Vercel token scoped to this project/team at the hidden prompt.');
execFileSync('gh', ['secret', 'set', 'VERCEL_TOKEN'], { cwd: root, stdio: 'inherit' });
