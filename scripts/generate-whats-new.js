/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const releaseNotesDir = path.join(projectRoot, 'release-notes');
const outputPath = path.join(projectRoot, 'constants', 'whats-new.ts');

function escapeForTsSingleQuoted(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ')
    .trim();
}

function parseReleaseLabelFromFileName(fileName) {
  const match = fileName.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : fileName.replace(/\.md$/i, '');
}

function parseBulletLines(sectionText) {
  return sectionText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function extractExplicitSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const features = [];
  const bugFixes = [];
  let activeSection = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const headingMatch = line.match(/^#{2,6}\s+(.*)$/);
    if (headingMatch) {
      const heading = headingMatch[1].toLowerCase();

      if (heading.includes('new feature') || heading === 'features' || heading === 'new') {
        activeSection = 'features';
      } else if (heading.includes('bug fix') || heading.includes('fixes') || heading === 'fixes') {
        activeSection = 'bugFixes';
      } else {
        activeSection = null;
      }

      continue;
    }

    if (!activeSection || !line.startsWith('- ')) {
      continue;
    }

    const bullet = line.slice(2).trim();
    if (!bullet) {
      continue;
    }

    if (activeSection === 'features') {
      features.push(bullet);
    } else if (activeSection === 'bugFixes') {
      bugFixes.push(bullet);
    }
  }

  return { features, bugFixes };
}

function splitFeaturesAndFixes(items) {
  const fixSignals = [
    'fix',
    'fixed',
    'bug',
    'improve',
    'improved',
    'stability',
    'reliability',
    'crash',
    'error',
    'polish',
  ];

  const features = [];
  const bugFixes = [];

  for (const item of items) {
    const normalized = item.toLowerCase();
    const isFix = fixSignals.some((signal) => normalized.includes(signal));
    if (isFix) {
      bugFixes.push(item);
    } else {
      features.push(item);
    }
  }

  if (features.length === 0 && bugFixes.length > 0) {
    features.push(...bugFixes.splice(0, Math.min(3, bugFixes.length)));
  }

  return { features, bugFixes };
}

function findLatestReleaseNoteFile() {
  const ignoredNames = new Set(['template.md', 'readme.md']);
  const files = fs
    .readdirSync(releaseNotesDir)
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .filter((name) => !ignoredNames.has(name.toLowerCase()))
    .filter((name) => !name.toLowerCase().includes('template'))
    .filter((name) => !name.toLowerCase().includes('draft'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (files.length === 0) {
    throw new Error('No release note markdown files found in release-notes/.');
  }

  return files[files.length - 1];
}

function extractReleaseSections(markdown) {
  const fullReleaseStart = markdown.search(/##\s+full release notes/i);
  const fromIndex = fullReleaseStart >= 0 ? fullReleaseStart : 0;
  const relevantText = markdown.slice(fromIndex);
  const bulletItems = parseBulletLines(relevantText);

  if (bulletItems.length === 0) {
    throw new Error('No bullet items found in the latest release note. Add bullet lines under Full release notes.');
  }

  return bulletItems;
}

function buildTsFile({ releaseLabel, features, bugFixes }) {
  const safeRelease = escapeForTsSingleQuoted(releaseLabel);

  const featureLines = features
    .map((item) => `    '${escapeForTsSingleQuoted(item)}',`)
    .join('\n');

  const fixLines = bugFixes
    .map((item) => `    '${escapeForTsSingleQuoted(item)}',`)
    .join('\n');

  const subtitle = `Highlights from version ${safeRelease}.`;

  return `export type WhatsNewContent = {
  releaseLabel: string;
  title: string;
  subtitle: string;
  features: string[];
  bugFixes: string[];
  guideTip: string;
};

export const WHATS_NEW_CONTENT: WhatsNewContent = {
  releaseLabel: '${safeRelease}',
  title: 'What\\'s New',
  subtitle: '${subtitle}',
  features: [
${featureLines}
  ],
  bugFixes: [
${fixLines}
  ],
  guideTip: 'Need a refresher later? Open Settings and tap App Guide for detailed usage tips.',
};
`;
}

function run() {
  const latestFile = findLatestReleaseNoteFile();
  const markdownPath = path.join(releaseNotesDir, latestFile);
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  const releaseLabel = parseReleaseLabelFromFileName(latestFile);

  const explicit = extractExplicitSections(markdown);
  const hasExplicitSections = explicit.features.length > 0 || explicit.bugFixes.length > 0;
  const { features, bugFixes } = hasExplicitSections
    ? explicit
    : splitFeaturesAndFixes(extractReleaseSections(markdown));

  const generated = buildTsFile({
    releaseLabel,
    features,
    bugFixes,
  });

  fs.writeFileSync(outputPath, generated, 'utf8');

  console.log(`Generated constants/whats-new.ts from release-notes/${latestFile}`);
  console.log(`Mode: ${hasExplicitSections ? 'explicit-sections' : 'heuristic-fallback'}`);
  console.log(`Features: ${features.length}, Bug Fixes: ${bugFixes.length}`);
}

run();
