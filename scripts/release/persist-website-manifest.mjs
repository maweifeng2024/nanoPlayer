import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const repository = process.env.GITHUB_REPOSITORY;
const version = process.env.RELEASE_TAG?.slice(1);
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Missing release identity');
const api = endpoint => JSON.parse(execFileSync('gh', ['api', `repos/${repository}/contents/${endpoint}?ref=main`], { encoding: 'utf8' }));
const decode = file => Buffer.from(file.content, 'base64').toString('utf8');
if (JSON.parse(decode(api('package.json'))).version !== version) {
  console.log('Main has moved to another version; preserving its download metadata.');
} else {
  const pathname = 'website/public/downloads/latest.json';
  const current = api(pathname);
  const content = fs.readFileSync(pathname, 'utf8');
  if (decode(current) !== content) {
    execFileSync('gh', ['api', '--method', 'PUT', `repos/${repository}/contents/${pathname}`, '--input', '-'], {
      input: JSON.stringify({ message: `chore(website): publish v${version} downloads`, branch: 'main', sha: current.sha, content: Buffer.from(content).toString('base64') }),
      stdio: ['pipe', 'ignore', 'inherit'],
    });
  }
  console.log(`Verified v${version} download metadata is saved on main.`);
}
