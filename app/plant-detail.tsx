import React, { useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePlants } from '@/app/context/PlantContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function parseIntervalDays(interval: string): number {
  const parts = interval.split(' ');
  const num = parseInt(parts[0], 10);
  const unit = parts[1];
  if (unit.startsWith('day')) return num;
  if (unit.startsWith('week')) return num * 7;
  if (unit.startsWith('month')) return num * 30;
  return 7;
}

export default function PlantDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plants, waterPlant, unwaterPlant, clearWateringHistory, removePlant } = usePlants();
  const insets = useSafeAreaInsets();

  const plant = plants.find((p) => p.id === id);

  const stats = useMemo(() => {
    if (!plant) return null;
    const log = plant.wateringLog || [];
    const totalWaterings = log.length;
    const lastWatered = log.length > 0 ? new Date(log[log.length - 1].date) : null;
    const daysSinceWatered = lastWatered
      ? Math.floor((Date.now() - lastWatered.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const intervalDays = parseIntervalDays(plant.checkInterval);
    let nextWaterDate: Date;
    if (lastWatered) {
      nextWaterDate = new Date(lastWatered);
      nextWaterDate.setDate(nextWaterDate.getDate() + intervalDays);
    } else {
      const start = new Date(plant.birthday);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const nextMultiple = diffDays <= 0 ? 0 : Math.ceil(diffDays / intervalDays);
      nextWaterDate = new Date(start);
      nextWaterDate.setDate(nextWaterDate.getDate() + nextMultiple * intervalDays);
    }
    const daysUntilNext = Math.max(0, Math.ceil((nextWaterDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    const birthdayDate = new Date(plant.birthday);
    const ageMs = Date.now() - birthdayDate.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const ageYears = Math.floor(ageDays / 365);
    const ageMonths = Math.floor((ageDays % 365) / 30);

    return { totalWaterings, lastWatered, daysSinceWatered, daysUntilNext, ageYears, ageMonths, ageDays };
  }, [plant]);

  if (!plant || !stats) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>Plant not found</ThemedText>
      </ThemedView>
    );
  }

  // Check if the plant was watered today (for toggle behavior)
  const todayStr = new Date().toISOString().split('T')[0];
  const lastEntry = plant.wateringLog?.length ? plant.wateringLog[plant.wateringLog.length - 1] : null;
  const wateredToday = lastEntry ? lastEntry.date.startsWith(todayStr) : false;

  const handleWater = async () => {
    try {
      if (wateredToday && lastEntry) {
        // Unwater — remove today's entry
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await unwaterPlant(plant.id, lastEntry.date);
      } else {
        // Water
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await waterPlant(plant.id);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update watering');
    }
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/add-plant-modal', params: { editId: plant.id } });
  };

  const handleDelete = () => {
    Alert.alert('Delete Plant', `Are you sure you want to delete ${plant.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removePlant(plant.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete plant');
          }
        },
      },
    ]);
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const wateringLog = [...(plant.wateringLog || [])].reverse();

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Photo */}
        {plant.photoUri ? (
          <Image source={{ uri: plant.photoUri }} style={styles.heroImage} />
        ) : (
          <View style={styles.heroPlaceholder}>
            <ThemedText style={styles.heroEmoji}>🌱</ThemedText>
          </View>
        )}

        {/* Plant Name & Location */}
        <View style={styles.headerSection}>
          <ThemedText style={styles.plantName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{plant.name}</ThemedText>
          <ThemedText style={styles.plantLocation}>📍 {plant.location}</ThemedText>
        </View>

        {/* Water Now Button */}
        <TouchableOpacity
          style={[styles.waterButton, wateredToday && styles.waterButtonDone]}
          onPress={handleWater}
          activeOpacity={0.8}
        >
          <ThemedText style={styles.waterButtonText}>
            {wateredToday ? '✅ Watered Today' : '💧 Water Now'}
          </ThemedText>
        </TouchableOpacity>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{stats.totalWaterings}</ThemedText>
            <ThemedText style={styles.statLabel}>Waterings</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>
              {stats.daysSinceWatered !== null ? `${stats.daysSinceWatered}d` : '—'}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Since Last</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={[styles.statValue, stats.daysUntilNext === 0 && { color: '#FF3B30' }]}>
              {stats.daysUntilNext === 0 ? 'Today' : `${stats.daysUntilNext}d`}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Next Water</ThemedText>
          </View>
        </View>

        {/* Details Section */}
        <View style={styles.detailsCard}>
          <ThemedText style={styles.sectionTitle}>Details</ThemedText>
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Watering Interval</ThemedText>
            <ThemedText style={styles.detailValue}>Every {plant.checkInterval}</ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Birthday</ThemedText>
            <ThemedText style={styles.detailValue}>{formatDate(new Date(plant.birthday))}</ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Age</ThemedText>
            <ThemedText style={styles.detailValue}>
              {stats.ageYears > 0
                ? `${stats.ageYears}y ${stats.ageMonths}m`
                : stats.ageMonths > 0
                ? `${stats.ageMonths} months`
                : `${stats.ageDays} days`}
            </ThemedText>
          </View>
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <ThemedText style={styles.detailLabel}>Gender</ThemedText>
            <ThemedText style={styles.detailValue}>{plant.gender}</ThemedText>
          </View>
        </View>

        {/* Watering History */}
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <ThemedText style={styles.sectionTitle}>Watering History</ThemedText>
            {wateringLog.length > 0 && (
              <TouchableOpacity
                style={styles.clearAllButton}
                onPress={() => {
                  Alert.alert(
                    'Clear All History',
                    `Are you sure you want to delete all ${wateringLog.length} watering entries for ${plant.name}? This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete All',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await clearWateringHistory(plant.id);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          } catch {
                            Alert.alert('Error', 'Failed to clear history');
                          }
                        },
                      },
                    ],
                  );
                }}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.clearAllX}>✕</ThemedText>
              </TouchableOpacity>
            )}
          </View>
          {wateringLog.length === 0 ? (
            <ThemedText style={styles.emptyHistory}>No watering recorded yet</ThemedText>
          ) : (
            wateringLog.slice(0, 20).map((entry, index) => {
              const entryDate = new Date(entry.date);
              return (
                <TouchableOpacity
                  key={`${entry.date}-${index}`}
                  style={[styles.historyRow, index > 0 && styles.historyRowBorder]}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    Alert.alert(
                      'Delete Entry',
                      `Remove watering on ${formatDate(entryDate)} at ${formatTime(entryDate)}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await unwaterPlant(plant.id, entry.date);
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            } catch {
                              Alert.alert('Error', 'Failed to delete entry');
                            }
                          },
                        },
                      ],
                    );
                  }}
                  activeOpacity={0.8}
                  delayLongPress={400}
                >
                  <View style={styles.historyDot} />
                  <View style={styles.historyInfo}>
                    <ThemedText style={styles.historyDate}>{formatDate(entryDate)}</ThemedText>
                    <ThemedText style={styles.historyTime}>{formatTime(entryDate)}</ThemedText>
                    {entry.note && <ThemedText style={styles.historyNote}>{entry.note}</ThemedText>}
                  </View>
                  <ThemedText style={styles.historyIcon}>💧</ThemedText>
                </TouchableOpacity>
              );
            })
          )}
          {wateringLog.length > 20 && (
            <ThemedText style={styles.moreHistory}>
              +{wateringLog.length - 20} more entries
            </ThemedText>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.editButton} onPress={handleEdit} activeOpacity={0.7}>
            <ThemedText style={styles.editButtonText}>✏️ Edit</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
            <ThemedText style={styles.deleteButtonText}>🗑️ Delete</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={{ height: Math.max(insets.bottom, 20) }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#535353',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  errorText: {
    color: '#FFF',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 300,
    backgroundColor: '#444',
  },
  heroPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 220,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroEmoji: {
    
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  plantName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFF',
  },
  plantLocation: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  waterButton: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  waterButtonDone: {
    backgroundColor: '#34C759',
  },
  waterButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  detailsCard: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  detailLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  detailValue: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: '500',
  },
  historyCard: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearAllButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearAllX: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  emptyHistory: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    paddingVertical: 16,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  historyRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginRight: 12,
  },
  historyInfo: {
    flex: 1,
  },
  historyDate: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: '500',
  },
  historyTime: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  historyNote: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontStyle: 'italic',
    marginTop: 3,
  },
  historyIcon: {
    fontSize: 16,
  },
  moreHistory: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    paddingTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 12,
  },
  editButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
