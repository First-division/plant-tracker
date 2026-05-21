export type WhatsNewContent = {
  releaseLabel: string;
  title: string;
  subtitle: string;
  features: string[];
  bugFixes: string[];
  guideTip: string;
};

export const WHATS_NEW_CONTENT: WhatsNewContent = {
  releaseLabel: '1.0.5',
  title: 'What\'s New',
  subtitle: 'Highlights from version 1.0.5.',
  features: [
    'Plant history now supports custom actions like Trimmed, Moved, and Fertilized instead of watering-only logs.',
    'History entries can use preset color dots so plant care timelines are easier to scan.',
    'Calendar day dots now reflect saved history colors and show richer day details for history, completed watering, and scheduled care.',
    'The App Guide has been expanded with more detailed screen-by-screen help, including a dedicated Calendar guide.',
    'First-time walkthrough now points users to Settings > App Guide for more help.',
    'Added a polished What\'s New update screen that appears after app updates and can be reopened from Settings.',
  ],
  bugFixes: [
    'Improved iOS/TestFlight local photo recovery so managed plant images are less likely to disappear after app updates.',
    'Added safer media-library handling so missing native support does not crash Add Plant.',
    'Improved App Guide tab navigation with fading scroll arrows when more guide sections are available off-screen.',
  ],
  guideTip: 'Need a refresher later? Open Settings and tap App Guide for detailed usage tips.',
};
