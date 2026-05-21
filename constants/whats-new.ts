export type WhatsNewContent = {
  releaseLabel: string;
  title: string;
  subtitle: string;
  features: string[];
  bugFixes: string[];
  guideTip: string;
};

export const WHATS_NEW_CONTENT: WhatsNewContent = {
  releaseLabel: '1.0.1',
  title: 'What\'s New',
  subtitle: 'Highlights from version 1.0.1.',
  features: [
    'New color theme support in light mode, so theme choices now carry through more of the app.',
    'New Pink theme added.',
    'More flexible watering reminder intervals with years, months, and days.',
    'Default watering interval settings now apply when creating a new plant.',
    'Refreshed app icon and splash screen.',
  ],
  bugFixes: [
    'Improved household setup flow so turning sharing off resets the setup cleanly.',
    'Android UI polish for navigation, settings modals, and plant detail layout.',
  ],
  guideTip: 'Need a refresher later? Open Settings and tap App Guide for detailed usage tips.',
};
