export function parseReleaseArgs(args) {
  const resume = args.includes('--resume');
  const skipChecks = args.includes('--skip-checks');
  const versions = args.filter(arg => !arg.startsWith('--'));
  const unknown = args.filter(arg => arg.startsWith('--') && !['--resume', '--skip-checks'].includes(arg));
  if (unknown.length || versions.length > 1 || (versions[0] && !/^(?:v)?\d+\.\d+\.\d+$/.test(versions[0])) || (resume && skipChecks)) {
    throw new Error('Usage: pnpm release [0.1.7] [--skip-checks] or pnpm release --resume [v0.1.6]. Only stable versions are supported.');
  }
  const version = versions[0]?.replace(/^v/, '');
  return { resume, skipChecks, explicitVersion: resume ? undefined : version, resumeTag: resume && version ? `v${version}` : undefined };
}

export function releaseIsComplete(tag, original, recoveries) {
  return original?.status === 'completed' && original.conclusion === 'success'
    || recoveries.some(run => run.displayTitle.startsWith(`Publish ${tag} from run `) && run.status === 'completed' && run.conclusion === 'success');
}
