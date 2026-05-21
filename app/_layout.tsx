import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { PlantsProvider, usePlants } from '@/contexts/PlantContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { useWateringNotifications } from '@/hooks/use-notifications';
import { getThemeColors } from '@/constants/theme';

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
            navigationBarColor: '#535353',
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
            navigationBarColor: isDark ? '#000000' : '#F2F2F7',
          }}
        />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <PlantsProvider>
        <RootLayoutNav />
      </PlantsProvider>
    </AuthProvider>
  );
}
