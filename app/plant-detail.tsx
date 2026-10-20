import React, { useMemo, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  Platform,
  TextInput,
  findNodeHandle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePlants } from '@/contexts/PlantContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getThemeColors } from '@/constants/theme';
import { getDaysUntilNextWater, getNextWaterDate } from '@/services/plant-schedule';
import { getMostRecentWateringEntryForDay, getMostRecentWateringEntryOnOrBefore, getSortedWateringLog, getWateringEntries } from '@/services/watering-log';

/** Show a plant's details and expose editing, care history, and date-specific watering actions. */
export default function PlantDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plants, waterPlant, addPlantHistoryEntry, unwaterPlant, clearWateringHistory, removePlant, colorTheme } = usePlants();
  const [newHistoryAction, setNewHistoryAction] = useState('');
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [wateringPickerMode, setWateringPickerMode] = useState<'date' | 'time' | null>(null);
  const [wateringDate, setWateringDate] = useState(new Date());
  const [isSavingWatering, setIsSavingWatering] = useState(false);
  const suppressWaterPressRef = useRef(false);
  const suppressWaterPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HISTORY_COLORS = ['#4CD964', '#0A84FF', '#FF9F0A', '#AF52DE', '#FF375F', '#30B0C7'];
  const [selectedHistoryColor, setSelectedHistoryColor] = useState(HISTORY_COLORS[0]);
  const detailScrollRef = useRef<ScrollView>(null);
  const historyInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const theme = getThemeColors(colorTheme, isDark);
  const surfaceBorderColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,28,0.08)';
  const surfaceMutedColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)';
  const placeholderColor = isDark ? 'rgba(255,255,255,0.08)' : theme.primaryLight;
  const destructiveBackground = isDark ? 'rgba(255,59,48,0.16)' : 'rgba(255,59,48,0.10)';

  const plant = plants.find((p) => p.id === id);

  const stats = useMemo(() => {
    if (!plant) return null;
    const allHistory = plant.wateringLog || [];
    const wateringOnlyLog = getWateringEntries(allHistory);
    const totalHistoryEntries = allHistory.length;
    const latestWatering = getMostRecentWateringEntryOnOrBefore(wateringOnlyLog, new Date());
    const lastWatered = latestWatering ? new Date(latestWatering.date) : null;
    const daysSinceWatered = lastWatered
      ? Math.floor((Date.now() - lastWatered.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const nextWaterDate = getNextWaterDate(plant, new Date());
    const daysUntilNext = getDaysUntilNextWater(plant, new Date());

    const birthdayDate = new Date(plant.birthday);
    const ageMs = Date.now() - birthdayDate.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const ageYears = Math.floor(ageDays / 365);
    const ageMonths = Math.floor((ageDays % 365) / 30);

    return { totalHistoryEntries, lastWatered, nextWaterDate, daysSinceWatered, daysUntilNext, ageYears, ageMonths, ageDays };
  }, [plant]);

  if (!plant || !stats) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: theme.screenBg }]}>
        <ThemedText style={[styles.errorText, { color: theme.text }]}>Plant not found</ThemedText>
      </ThemedView>
    );
  }

  const todaysEntry = getMostRecentWateringEntryForDay(getWateringEntries(plant.wateringLog || []), new Date());
  const wateredToday = !!todaysEntry;

  const handleWater = async () => {
    if (suppressWaterPressRef.current) {
      suppressWaterPressRef.current = false;
      if (suppressWaterPressTimeoutRef.current) {
        clearTimeout(suppressWaterPressTimeoutRef.current);
        suppressWaterPressTimeoutRef.current = null;
      }
      return;
    }

    try {
      if (wateredToday && todaysEntry) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await unwaterPlant(plant.id, todaysEntry.date, true);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await waterPlant(plant.id);
      }
    } catch {
      Alert.alert('Error', 'Failed to update watering');
    }
  };

  const openPastWateringPicker = () => {
    setWateringDate(new Date());
    setWateringPickerMode('date');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleWaterLongPress = () => {
    suppressWaterPressRef.current = true;
    if (suppressWaterPressTimeoutRef.current) {
      clearTimeout(suppressWaterPressTimeoutRef.current);
    }
    openPastWateringPicker();
  };

  const handleWaterPressOut = () => {
    if (!suppressWaterPressRef.current) {
      return;
    }

    suppressWaterPressTimeoutRef.current = setTimeout(() => {
      suppressWaterPressRef.current = false;
      suppressWaterPressTimeoutRef.current = null;
    }, 300);
  };

  const handleWateringPickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed' || !selectedDate) {
      setWateringPickerMode(null);
      return;
    }

    setWateringDate(selectedDate);
    if (Platform.OS === 'ios') {
      return;
    }

    if (wateringPickerMode === 'date') {
      setWateringPickerMode('time');
      return;
    }

    void saveWateringAt(selectedDate);
  };

  const saveWateringAt = async (date: Date) => {
    if (date.getTime() > Date.now()) {
      Alert.alert('Invalid date', 'A watering time cannot be in the future.');
      return;
    }

    try {
      setIsSavingWatering(true);
      await waterPlant(plant.id, undefined, date.toISOString());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWateringPickerMode(null);
    } catch {
      Alert.alert('Error', 'Failed to save watering');
    } finally {
      setIsSavingWatering(false);
    }
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/add-plant-modal', params: { editId: plant.id } });
  };

  const handleAddHistory = async () => {
    const action = newHistoryAction.trim();
    if (!action || isSavingHistory) {
      return;
    }

    try {
      setIsSavingHistory(true);
      await addPlantHistoryEntry(plant.id, action, undefined, selectedHistoryColor);
      setNewHistoryAction('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Failed to add history entry');
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handleDelete = () => {
    const entryCount = (plant.wateringLog || []).length;
    const sharedNote = plant.ownerId
      ? ' If this plant is shared with a household, it is removed for everyone.'
      : '';
    Alert.alert(
      `Delete ${plant.name}?`,
      `This permanently removes the plant, its photo, its ${entryCount} history ${entryCount === 1 ? 'entry' : 'entries'}, and its watering reminders.${sharedNote} This cannot be undone.`,
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removePlant(plant.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch {
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

  const handleHistoryFocus = () => {
    const inputNode = historyInputRef.current ? findNodeHandle(historyInputRef.current) : null;
    if (!inputNode || !detailScrollRef.current) {
      return;
    }

    detailScrollRef.current.scrollResponderScrollNativeHandleToKeyboard(inputNode, 64, true);
  };

  const historyLog = getSortedWateringLog(plant.wateringLog || []).reverse();

  const confirmDeleteEntry = (entry: (typeof historyLog)[number]) => {
    const entryDate = new Date(entry.date);
    const actionLabel = entry.action?.trim() || 'Watered';
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Delete this entry?',
      `"${actionLabel}" on ${formatDate(entryDate)} at ${formatTime(entryDate)} will be removed from ${plant.name}'s history and the calendar. This cannot be undone.`,
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
  };

  const confirmClearHistory = () => {
    const count = historyLog.length;
    Alert.alert(
      'Clear all history?',
      `This deletes all ${count} ${count === 1 ? 'entry' : 'entries'} (waterings and notes) for ${plant.name} and removes them from the calendar. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Delete ${count === 1 ? '1 entry' : `all ${count}`}`,
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
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.screenBg }]}>
      <ScrollView
        ref={detailScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Photo */}
        <View style={styles.heroMediaFrame}>
          {plant.photoUri ? (
            <Image
              source={{ uri: plant.photoUri }}
              style={[
                styles.heroImage,
                styles.heroMedia,
                {
                  backgroundColor: surfaceMutedColor,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: surfaceBorderColor,
                },
              ]}
            />
          ) : (
            <View
              style={[
                styles.heroPlaceholder,
                styles.heroMedia,
                {
                  backgroundColor: placeholderColor,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: surfaceBorderColor,
                },
                Platform.OS === 'android' && [styles.heroPlaceholderAndroid, { borderColor: surfaceBorderColor }],
              ]}
            >
              <ThemedText style={styles.heroEmoji}>🌱</ThemedText>
            </View>
          )}
        </View>

        {/* Plant Name & Location */}
        <View style={styles.headerSection}>
          <ThemedText style={[styles.plantName, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{plant.name}</ThemedText>
          <ThemedText style={[styles.plantLocation, { color: theme.secondaryText }]}>{plant.location}</ThemedText>
        </View>

        {/* Water Now Button */}
        <View style={styles.waterRow}>
          <TouchableOpacity
            style={[styles.waterButton, styles.waterButtonFlex, { backgroundColor: wateredToday ? theme.accent : theme.primary }]}
            onPress={handleWater}
            onLongPress={handleWaterLongPress}
            onPressOut={handleWaterPressOut}
            delayLongPress={450}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={wateredToday ? 'Watered today. Tap to undo' : 'Water now. Press and hold to choose a different date'}
          >
            <ThemedText style={styles.waterButtonText}>
              {wateredToday ? '✓' : 'Water'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.otherDateButton, { borderColor: theme.primary }]}
            onPress={openPastWateringPicker}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Log watering for a different date"
          >
            <Ionicons name="calendar-outline" size={20} color={theme.primary} />
            <ThemedText style={[styles.otherDateText, { color: theme.primary }]}>Other date</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText style={[styles.waterTip, { color: theme.secondaryText }]}>
          Tip: press and hold Water to pick a different date and time.
        </ThemedText>

        {Platform.OS === 'ios' && (
          <Modal
            visible={wateringPickerMode !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setWateringPickerMode(null)}
          >
            <View style={styles.pickerBackdrop}>
              <View style={[styles.pickerCard, { backgroundColor: theme.cardBg }]}>
                <ThemedText style={[styles.pickerTitle, { color: theme.text }]}>
                  {wateringPickerMode === 'date' ? 'When did you water it?' : 'What time?'}
                </ThemedText>
                {wateringPickerMode && (
                  <DateTimePicker
                    key={wateringPickerMode}
                    value={wateringDate}
                    mode={wateringPickerMode}
                    display="spinner"
                    maximumDate={new Date()}
                    onChange={handleWateringPickerChange}
                    themeVariant={isDark ? 'dark' : 'light'}
                  />
                )}
                <View style={styles.pickerActions}>
                  <TouchableOpacity
                    style={styles.pickerAction}
                    onPress={() => setWateringPickerMode(null)}
                    disabled={isSavingWatering}
                  >
                    <ThemedText style={{ color: theme.secondaryText }}>Cancel</ThemedText>
                  </TouchableOpacity>
                  {wateringPickerMode === 'date' ? (
                    <TouchableOpacity
                      style={styles.pickerAction}
                      onPress={() => setWateringPickerMode('time')}
                    >
                      <ThemedText style={{ color: theme.primary, fontWeight: '700' }}>Next</ThemedText>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.pickerAction}
                      onPress={() => saveWateringAt(wateringDate)}
                      disabled={isSavingWatering}
                    >
                      <ThemedText style={{ color: theme.primary, fontWeight: '700' }}>
                        {isSavingWatering ? 'Saving…' : 'Save'}
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </Modal>
        )}

        {Platform.OS === 'android' && wateringPickerMode && (
          <DateTimePicker
            key={wateringPickerMode}
            value={wateringDate}
            mode={wateringPickerMode}
            display="default"
            maximumDate={new Date()}
            onChange={handleWateringPickerChange}
          />
        )}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.cardBg, borderWidth: StyleSheet.hairlineWidth, borderColor: surfaceBorderColor }]}>
            <ThemedText style={[styles.statValue, { color: theme.text }]}>{stats.totalHistoryEntries}</ThemedText>
            <ThemedText style={[styles.statLabel, { color: theme.secondaryText }]}>History</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.cardBg, borderWidth: StyleSheet.hairlineWidth, borderColor: surfaceBorderColor }]}>
            <ThemedText style={[styles.statValue, { color: theme.text }]}>
              {stats.daysSinceWatered !== null ? `${stats.daysSinceWatered}d` : '—'}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: theme.secondaryText }]}>Since Last</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.cardBg, borderWidth: StyleSheet.hairlineWidth, borderColor: surfaceBorderColor }]}>
            <ThemedText style={[styles.statValue, { color: stats.daysUntilNext === 0 ? '#FF3B30' : theme.text }]}>
              {stats.daysUntilNext === null ? '—' : stats.daysUntilNext === 0 ? 'Today' : `${stats.daysUntilNext}d`}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: theme.secondaryText }]}>Next Water</ThemedText>
          </View>
        </View>

        {/* Details Section */}
        <View style={[styles.detailsCard, { backgroundColor: theme.cardBg, borderWidth: StyleSheet.hairlineWidth, borderColor: surfaceBorderColor }]}>
          <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Details</ThemedText>
          <View style={[styles.detailRow, { borderBottomColor: surfaceBorderColor }]}>
            <ThemedText style={[styles.detailLabel, { color: theme.secondaryText }]}>Watering Interval</ThemedText>
            <ThemedText style={[styles.detailValue, { color: theme.text }]}>Every {plant.checkInterval}</ThemedText>
          </View>
          <View style={[styles.detailRow, { borderBottomColor: surfaceBorderColor }]}>
            <ThemedText style={[styles.detailLabel, { color: theme.secondaryText }]}>Birthday</ThemedText>
            <ThemedText style={[styles.detailValue, { color: theme.text }]}>{formatDate(new Date(plant.birthday))}</ThemedText>
          </View>
          <View style={[styles.detailRow, { borderBottomColor: surfaceBorderColor }]}>
            <ThemedText style={[styles.detailLabel, { color: theme.secondaryText }]}>Age</ThemedText>
            <ThemedText style={[styles.detailValue, { color: theme.text }]}>
              {stats.ageYears > 0
                ? `${stats.ageYears}y ${stats.ageMonths}m`
                : stats.ageMonths > 0
                ? `${stats.ageMonths} months`
                : `${stats.ageDays} days`}
            </ThemedText>
          </View>
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <ThemedText style={[styles.detailLabel, { color: theme.secondaryText }]}>Gender</ThemedText>
            <ThemedText style={[styles.detailValue, { color: theme.text }]}>
              {plant.gender === 'Unknown' ? 'They/them' : plant.gender}
            </ThemedText>
          </View>
        </View>

        {/* Plant History */}
        <View style={[styles.historyCard, { backgroundColor: theme.cardBg, borderWidth: StyleSheet.hairlineWidth, borderColor: surfaceBorderColor }]}>
          <View style={styles.historyHeader}>
            <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>History</ThemedText>
            {historyLog.length > 0 && (
              <TouchableOpacity
                style={[styles.clearAllButton, { backgroundColor: destructiveBackground }]}
                onPress={confirmClearHistory}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Clear all ${historyLog.length} history entries`}
              >
                <ThemedText style={[styles.clearAllX, { color: '#FF3B30' }]}>Clear all ({historyLog.length})</ThemedText>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.historyAddRow}>
            <TextInput
              ref={historyInputRef}
              style={[
                styles.historyInput,
                {
                  backgroundColor: surfaceMutedColor,
                  color: theme.text,
                  borderColor: surfaceBorderColor,
                },
              ]}
              placeholder="Add action (trim, moved, fertilized...)"
              placeholderTextColor={theme.secondaryText}
              value={newHistoryAction}
              onChangeText={setNewHistoryAction}
              onFocus={handleHistoryFocus}
              returnKeyType="done"
              onSubmitEditing={handleAddHistory}
              editable={!isSavingHistory}
            />
            <TouchableOpacity
              style={[
                styles.historyAddButton,
                {
                  backgroundColor: newHistoryAction.trim() ? theme.primary : surfaceMutedColor,
                  borderColor: surfaceBorderColor,
                },
              ]}
              onPress={handleAddHistory}
              disabled={!newHistoryAction.trim() || isSavingHistory}
              activeOpacity={0.8}
            >
              <ThemedText style={[styles.historyAddButtonText, { color: newHistoryAction.trim() ? '#FFFFFF' : theme.secondaryText }]}>Add</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.historyColorRow}>
            {HISTORY_COLORS.map((color) => {
              const isSelected = color === selectedHistoryColor;
              return (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.historyColorSwatch,
                    {
                      backgroundColor: color,
                      borderColor: isSelected ? theme.text : surfaceBorderColor,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => setSelectedHistoryColor(color)}
                  activeOpacity={0.85}
                />
              );
            })}
          </View>

          {historyLog.length === 0 ? (
            <ThemedText style={[styles.emptyHistory, { color: theme.secondaryText }]}>No history recorded yet</ThemedText>
          ) : (
            historyLog.slice(0, 20).map((entry, index) => {
              const entryDate = new Date(entry.date);
              const actionLabel = entry.action?.trim() || 'Watered';
              return (
                <TouchableOpacity
                  key={`${entry.date}-${index}`}
                  style={[
                    styles.historyRow,
                    index > 0 && [styles.historyRowBorder, { borderTopColor: surfaceBorderColor }],
                  ]}
                  onLongPress={() => confirmDeleteEntry(entry)}
                  activeOpacity={0.8}
                  delayLongPress={400}
                >
                  <View style={[styles.historyDot, { backgroundColor: entry.dotColor || theme.primary }]} />
                  <View style={styles.historyInfo}>
                    <ThemedText style={[styles.historyAction, { color: theme.text }]}>{actionLabel}</ThemedText>
                    <ThemedText style={[styles.historyDate, { color: theme.text }]}>{formatDate(entryDate)}</ThemedText>
                    <ThemedText style={[styles.historyTime, { color: theme.secondaryText }]}>{formatTime(entryDate)}</ThemedText>
                    {entry.note && <ThemedText style={[styles.historyNote, { color: theme.secondaryText }]}>{entry.note}</ThemedText>}
                  </View>
                  <TouchableOpacity
                    style={styles.historyDeleteButton}
                    onPress={() => confirmDeleteEntry(entry)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${actionLabel} entry from ${formatDate(entryDate)}`}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
          {historyLog.length > 20 && (
            <ThemedText style={[styles.moreHistory, { color: theme.secondaryText }]}>
              +{historyLog.length - 20} more entries
            </ThemedText>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.editButton, { backgroundColor: theme.primaryLight, borderWidth: StyleSheet.hairlineWidth, borderColor: surfaceBorderColor }]} onPress={handleEdit} activeOpacity={0.7}>
            <ThemedText style={[styles.editButtonText, { color: theme.primary }]}>Edit</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.deleteButton, { backgroundColor: destructiveBackground, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,59,48,0.18)' }]} onPress={handleDelete} activeOpacity={0.7}>
            <ThemedText style={styles.deleteButtonText}>Delete</ThemedText>
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
  heroMediaFrame: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  heroMedia: {
    width: undefined,
    alignSelf: 'stretch',
    borderRadius: 24,
    overflow: 'hidden',
  },
  heroPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 220,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlaceholderAndroid: {
    maxHeight: 240,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroEmoji: {
    fontSize: Platform.OS === 'android' ? 72 : 84,
    lineHeight: Platform.OS === 'android' ? 84 : 96,
    textAlign: 'center',
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
    paddingTop: 50,
    lineHeight: 40,
  },
  plantLocation: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  waterRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 16,
  },
  waterButtonFlex: {
    flex: 1,
    marginHorizontal: 0,
    marginTop: 0,
  },
  otherDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  otherDateText: {
    fontSize: 15,
    fontWeight: '600',
  },
  waterTip: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 20,
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
  historyDeleteButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyHint: {
    fontSize: 12,
    marginBottom: 8,
  },
  pickerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pickerCard: {
    borderRadius: 18,
    padding: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
    paddingTop: 8,
  },
  pickerAction: {
    paddingVertical: 10,
    paddingHorizontal: 8,
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
    lineHeight: 28,
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
  historyAddRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  historyColorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  historyColorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  historyInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  historyAddButton: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyAddButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  clearAllButton: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearAllX: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
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
  historyAction: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: '600',
  },
  historyDate: {
    fontSize: 13,
    color: '#FFF',
    marginTop: 2,
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
