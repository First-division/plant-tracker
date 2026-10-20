import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

/** View props extended with light and dark background color overrides. */
export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

/** Render a view using the active theme's background unless explicitly overridden. */
export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
