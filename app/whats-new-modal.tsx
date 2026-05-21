import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getThemeColors } from '@/constants/theme';
import { usePlants } from '@/contexts/PlantContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WHATS_NEW_CONTENT } from '@/constants/whats-new';

export default function WhatsNewModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { colorTheme } = usePlants();
  const isDark = colorScheme !== 'light';
  const theme = getThemeColors(colorTheme, isDark);
  const borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(17,24,28,0.10)';

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.screenBg }]}> 
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(20, insets.bottom + 12) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, { backgroundColor: theme.cardBg, borderColor }]}> 
          <ThemedText style={[styles.badge, { color: theme.primary }]}>Update Installed</ThemedText>
          <ThemedText style={[styles.title, { color: theme.text }]}>{WHATS_NEW_CONTENT.title}</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.secondaryText }]}>{WHATS_NEW_CONTENT.subtitle}</ThemedText>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.cardBg, borderColor }]}> 
          <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>New Features</ThemedText>
          {WHATS_NEW_CONTENT.features.map((item) => (
            <View key={item} style={styles.itemRow}>
              <View style={[styles.itemDot, { backgroundColor: theme.primary }]} />
              <ThemedText style={[styles.itemText, { color: theme.text }]}>{item}</ThemedText>
            </View>
          ))}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.cardBg, borderColor }]}> 
          <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Bug Fixes</ThemedText>
          {WHATS_NEW_CONTENT.bugFixes.map((item) => (
            <View key={item} style={styles.itemRow}>
              <View style={[styles.itemDot, { backgroundColor: '#34C759' }]} />
              <ThemedText style={[styles.itemText, { color: theme.text }]}>{item}</ThemedText>
            </View>
          ))}
        </View>

        <View style={[styles.tipCard, { backgroundColor: theme.primaryLight, borderColor }]}> 
          <ThemedText style={[styles.tipText, { color: theme.text }]}>{WHATS_NEW_CONTENT.guideTip}</ThemedText>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <ThemedText style={styles.buttonText}>Continue</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 14,
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
    paddingTop: 7,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  tipCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  tipText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
