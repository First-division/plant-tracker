import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemedText } from '@/components/themed-text';
import { PlantsProvider } from '@/app/context/PlantContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PlantsProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="add-plant-modal" options={{ 
            presentation: 'modal', 
            title: "Add New Plant",
            gestureEnabled: false,
            // headerRight: () => (
            //   <TouchableOpacity 
            //     onPress={() => router.back()} 
            //     style={{ padding: 11,  paddingTop: -15, paddingBottom: -15, marginRight: -10 }}
            //   >
            //     <ThemedText style={{ fontSize: 18}}>✕</ThemedText>
            //   </TouchableOpacity>
            // ),
          }} />
          <Stack.Screen name="welcome-modal" options={{ 
            presentation: 'modal', 
            gestureEnabled: false,
            headerShown: false,
          }} />
        </Stack>
        <StatusBar style="auto" />
      </PlantsProvider>
    </ThemeProvider>
  );
}
