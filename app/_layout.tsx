import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { PlantsProvider } from '@/app/context/PlantContext';
import { AuthProvider } from '@/app/context/AuthContext';
import { useWateringNotifications } from '@/hooks/use-notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  useWateringNotifications();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="add-plant-modal" options={{ 
          presentation: 'modal', 
          title: "Add New Plant",
          gestureEnabled: false,
        }} />
        <Stack.Screen name="welcome-modal" options={{ 
          presentation: 'modal', 
          gestureEnabled: false,
          headerShown: false,
        }} />
        <Stack.Screen name="plant-detail" options={{ 
          presentation: 'modal',
          title: 'Plant Details',
        }} />
        <Stack.Screen name="auth-modal" options={{ 
          presentation: 'modal',
          headerShown: false,
        }} />
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
