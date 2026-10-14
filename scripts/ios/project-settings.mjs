import fs from 'node:fs';
import path from 'node:path';

export function projectTeam(text) {
  const teams = new Set([...text.matchAll(/\bDEVELOPMENT_TEAM\s*=\s*"?([A-Z0-9]{10})"?\s*;/g)].map((m) => m[1]));
  if (teams.size > 1) throw new Error('Multiple Xcode signing teams found. Set APPLE_DEVELOPMENT_TEAM explicitly.');
  return [...teams][0];
}

/** Only a team identifier is retained; never read certificates or credentials. */
export function localSigning(root, environment = process.env) {
  const directory = path.join(root, '.ios-local');
  const file = path.join(directory, 'signing.json');
  const project = path.join(root, 'src-tauri/gen/apple/nanoplayer.xcodeproj/project.pbxproj');
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const explicit = environment.APPLE_DEVELOPMENT_TEAM;
  if (explicit && !/^[A-Z0-9]{10}$/.test(explicit)) throw new Error('Invalid APPLE_DEVELOPMENT_TEAM identifier.');
  const developmentTeam = explicit || (fs.existsSync(project) ? projectTeam(fs.readFileSync(project, 'utf8')) : undefined) || saved.developmentTeam;
  if (developmentTeam && !/^[A-Z0-9]{10}$/.test(developmentTeam)) throw new Error('Invalid locally saved signing team.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify({ developmentTeam }, null, 2) + '\n', { mode: 0o600 });
  fs.writeFileSync(path.join(directory, 'Signing.xcconfig'),
    '// Local signing configuration; deliberately excluded from Git.\n' +
    (developmentTeam ? `DEVELOPMENT_TEAM = ${developmentTeam}\n` : ''), { mode: 0o600 });
  return developmentTeam;
}

export function synchronizeProject(text, { version, buildNumber }) {
  text = text.replace(/CFBundleShortVersionString: .*/, `CFBundleShortVersionString: ${version}`)
    .replace(/CFBundleVersion: .*/, `CFBundleVersion: "${buildNumber}"`);
  if (!text.includes('configFiles:')) text = text.replace('settingGroups:',
    'configFiles:\n  debug: ../../../.ios-local/Signing.xcconfig\n  release: ../../../.ios-local/Signing.xcconfig\nsettingGroups:');
  if (!text.includes('UIApplicationSceneManifest:')) text = text.replace('        LSRequiresIPhoneOS: true',
    '        LSRequiresIPhoneOS: true\n        UIApplicationSceneManifest:\n          UIApplicationSupportsMultipleScenes: false');
  if (!text.includes('CFBundleDocumentTypes:')) text = text.replace('        LSRequiresIPhoneOS: true',
    '        LSRequiresIPhoneOS: true\n        UIFileSharingEnabled: true\n        LSSupportsOpeningDocumentsInPlace: true\n        CFBundleDocumentTypes:\n          - CFBundleTypeName: Audio\n            CFBundleTypeRole: Viewer\n            LSHandlerRank: Alternate\n            LSItemContentTypes: [public.audio]');
  // A stable script replaces user edits made only to the generated pbxproj.
  text = text.replace(/^      - script: .*ios xcode-script.*$/m,
    '      - script: bash ../../../scripts/ios/xcode-build.sh --platform ${PLATFORM_DISPLAY_NAME:?} --sdk-root ${SDKROOT:?} --framework-search-paths "${FRAMEWORK_SEARCH_PATHS:?}" --header-search-paths "${HEADER_SEARCH_PATHS:?}" --gcc-preprocessor-definitions "${GCC_PREPROCESSOR_DEFINITIONS:-}" --configuration ${CONFIGURATION:?} ${FORCE_COLOR:-} ${ARCHS:?}');
  return text;
}
