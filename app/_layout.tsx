import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { PlantsProvider, usePlants } from '@/contexts/PlantContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { useWateringNotifications } from '@/hooks/use-notifications';
import { getThemeColors } from '@/constants/theme';
import { initCrashReporting } from '@/services/crash-reporting';

initCrashReporting();

/** Keep the tab navigator as the initial route when Expo Router restores navigation state. */
export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { colorTheme } = usePlants();
  useWateringNotifications();

  const isDark = colorScheme === 'dark';
  const theme = getThemeColors(colorTheme, isDark);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
            navigationBarColor: theme.screenBg,
            navigationBarHidden: false,
          }}
        />
        <Stack.Screen
          name="add-plant-modal"
          options={{
            presentation: 'modal',
            title: 'Add New Plant',
            gestureEnabled: false,
            navigationBarColor: theme.screenBg,
            contentStyle: { backgroundColor: theme.screenBg },
            headerStyle: { backgroundColor: theme.cardBg },
            headerTintColor: theme.text,
            headerTitleStyle: { color: theme.text },
          }}
        />
        <Stack.Screen
          name="whats-new-modal"
          options={{
            presentation: 'modal',
            title: "What's New",
            navigationBarColor: theme.screenBg,
            contentStyle: { backgroundColor: theme.screenBg },
            headerStyle: { backgroundColor: theme.cardBg },
            headerTintColor: theme.text,
            headerTitleStyle: { color: theme.text },
          }}
        />
        <Stack.Screen
          name="welcome-modal"
          options={{
            presentation: 'modal',
            gestureEnabled: false,
            headerShown: false,
            navigationBarColor: theme.screenBg,
            contentStyle: { backgroundColor: theme.screenBg },
          }}
        />
        <Stack.Screen
          name="plant-detail"
          options={{
            presentation: 'modal',
            title: 'Plant Details',
            navigationBarColor: theme.screenBg,
            contentStyle: { backgroundColor: theme.screenBg },
            headerStyle: { backgroundColor: theme.cardBg },
            headerTintColor: theme.text,
            headerTitleStyle: { color: theme.text },
          }}
        />
        <Stack.Screen
          name="auth-modal"
          options={{
            presentation: 'modal',
            headerShown: false,
            navigationBarColor: theme.screenBg,
            contentStyle: { backgroundColor: theme.screenBg },
          }}
        />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

/** Mount global providers once around the app's authenticated routing and screen tree. */
export default function RootLayout() {
  return (
    <AuthProvider>
      <PlantsProvider>
        <RootLayoutNav />
      </PlantsProvider>
    </AuthProvider>
  );
}
