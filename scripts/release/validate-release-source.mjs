import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function validateReleaseSource({ tag, tagCommit, run, jobs, artifacts, repository }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Expected a stable release tag');
  if (run.head_repository?.full_name !== repository || run.head_branch !== tag || run.head_sha !== tagCommit || run.event !== 'push' || run.path !== '.github/workflows/release.yml') throw new Error('Artifact source must be this repository’s tag build at the exact tag commit');
  for (const name of ['verify', 'Build macOS universal', 'Build Windows x64', 'Build Linux x64']) {
    if (!jobs.some(job => job.name === name && job.conclusion === 'success')) throw new Error(`Source job did not succeed: ${name}`);
  }
  for (const name of ['macos', 'windows', 'linux']) {
    const matches = artifacts.filter(artifact => artifact.name === name && !artifact.expired);
    if (matches.length !== 1) throw new Error(`Expected one unexpired ${name} artifact`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, runId] = process.argv.slice(2);
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^\d+$/.test(runId ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^v\d+\.\d+\.\d+$/.test(tag ?? '')) throw new Error('Expected repository, stable tag and run ID');
  const api = endpoint => JSON.parse(execFileSync('gh', ['api', `repos/${repository}/${endpoint}`], { encoding: 'utf8' }));
  const tagCommit = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim();
  validateReleaseSource({ tag, tagCommit, repository, run: api(`actions/runs/${runId}`), jobs: api(`actions/runs/${runId}/jobs?per_page=100`).jobs, artifacts: api(`actions/runs/${runId}/artifacts?per_page=100`).artifacts });
  console.log(`Verified ${tag} artifacts from tag commit ${tagCommit} in run ${runId}`);
}
