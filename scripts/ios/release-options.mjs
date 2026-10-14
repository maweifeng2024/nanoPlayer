export function parseIOSReleaseArgs(input) {
  const args = input.filter((a) => a !== '--');
  const result = { simulator: false, device: false, debug: false, dryRun: false, exportMethod: 'debugging' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) throw new Error(`Duplicate ${arg}.`);
    seen.add(arg);
    if (arg === '--simulator') result.simulator = true;
    else if (arg === '--device') result.device = true;
    else if (arg === '--debug') result.debug = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--export-method') {
      result.exportMethod = args[++i];
      if (!['debugging', 'release-testing', 'app-store-connect'].includes(result.exportMethod))
        throw new Error('Invalid iOS export method.');
    } else throw new Error(`Unsupported iOS release option: ${arg}. Upload/publication is not supported.`);
  }
  if (result.simulator === result.device) throw new Error('Choose exactly one of --simulator or --device.');
  if (result.simulator && (!result.debug || seen.has('--export-method')))
    throw new Error('Simulator packaging requires --debug and has no export method.');
  return result;
}
