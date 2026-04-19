/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

// --- Color Theme Presets ---

export type ColorThemeName = 'default' | 'forest' | 'ocean' | 'sunset' | 'lavender' | 'rose';

export type ColorTheme = {
  name: ColorThemeName;
  label: string;
  primary: string;       // main accent (buttons, FAB, tint)
  primaryLight: string;  // lighter variant for backgrounds/badges
  accent: string;        // secondary accent (green action color)
  cardBg: string;        // dark-mode card/container background
  screenBg: string;      // main screen background
};

export const COLOR_THEMES: Record<ColorThemeName, ColorTheme> = {
  default: {
    name: 'default',
    label: 'Default',
    primary: '#007AFF',
    primaryLight: 'rgba(0,122,255,0.15)',
    accent: '#00C853',
    cardBg: '#1C1C1E',
    screenBg: '#000000',
  },
  forest: {
    name: 'forest',
    label: 'Forest',
    primary: '#34C759',
    primaryLight: 'rgba(52,199,89,0.15)',
    accent: '#30D158',
    cardBg: '#1A2A1A',
    screenBg: '#0F1A0F',
  },
  ocean: {
    name: 'ocean',
    label: 'Ocean',
    primary: '#0A84FF',
    primaryLight: 'rgba(10,132,255,0.15)',
    accent: '#64D2FF',
    cardBg: '#122535',
    screenBg: '#0A1A28',
  },
  sunset: {
    name: 'sunset',
    label: 'Sunset',
    primary: '#FF9500',
    primaryLight: 'rgba(255,149,0,0.15)',
    accent: '#FF6B35',
    cardBg: '#2A1E18',
    screenBg: '#1A1210',
  },
  lavender: {
    name: 'lavender',
    label: 'Lavender',
    primary: '#AF52DE',
    primaryLight: 'rgba(175,82,222,0.15)',
    accent: '#BF5AF2',
    cardBg: '#241A32',
    screenBg: '#16101F',
  },
  rose: {
    name: 'rose',
    label: 'Rose',
    primary: '#FF2D55',
    primaryLight: 'rgba(255,45,85,0.15)',
    accent: '#FF375F',
    cardBg: '#2A1A20',
    screenBg: '#1A1015',
  },
};

export function getThemeColors(themeName: ColorThemeName, isDark: boolean): ColorTheme & { text: string; secondaryText: string; background: string } {
  const theme = COLOR_THEMES[themeName] || COLOR_THEMES.default;
  if (isDark) {
    return {
      ...theme,
      text: '#FFFFFF',
      secondaryText: 'rgba(255,255,255,0.6)',
      background: theme.screenBg,
    };
  }
  return {
    ...theme,
    text: '#000000',
    secondaryText: '#6C6C70',
    background: '#F2F2F7',
    cardBg: '#FFFFFF',
    screenBg: '#F2F2F7',
  };
}

// Preset member colors for household calendar
export const MEMBER_COLORS = [
  '#FF3B30', '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5856D6', '#00C7BE',
];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
