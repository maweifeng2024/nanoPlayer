import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const tag = process.env.GITHUB_REF_NAME;
if (!/^v\d+\.\d+\.\d+/.test(tag ?? '')) throw new Error('Expected release tag.');
const run = args => execFileSync('gh', args, { stdio: 'inherit' });
// Query the list first: authentication/network errors must not be mistaken for absence.
const releases = JSON.parse(execFileSync('gh', ['api', `repos/${process.env.GITHUB_REPOSITORY}/releases`, '--paginate', '--slurp'], { encoding: 'utf8' })).flat();
const existing = releases.find(release => release.tag_name === tag);
if (!existing) run(['release', 'create', tag, '--draft', '--verify-tag', '--generate-notes', '--title', `nanoPlayer ${tag}`]);
const files = fs.readdirSync('release-artifacts', { withFileTypes: true }).filter(e => e.isFile()).map(e => `release-artifacts/${e.name}`);
if (!files.length) throw new Error('No files to publish');
run(['release', 'upload', tag, ...files, '--clobber']);
run(['release', 'edit', tag, '--draft=false']);
