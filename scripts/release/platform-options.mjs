export function parsePlatformArgs(input) {
  const args = [];
  let platform;
  for (let i = 0; i < input.length; i++) {
    const arg = input[i];
    if (arg === '--') continue;
    if (arg === '--platform' || arg.startsWith('--platform=')) {
      if (platform !== undefined) throw new Error('Duplicate --platform.');
      platform = arg === '--platform' ? input[++i] : arg.slice('--platform='.length);
      if (!['desktop', 'android'].includes(platform)) throw new Error('Use --platform desktop or --platform android.');
    } else args.push(arg);
  }
  return { platform: platform ?? 'desktop', args };
}
