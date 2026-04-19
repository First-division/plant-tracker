import React, { useState, useMemo, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView, Image, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePlants, Plant } from '@/app/context/PlantContext';
import { useAuth } from '@/app/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getThemeColors } from '@/constants/theme';

type CalendarEvent = {
  plant: Plant;
  type: 'completed' | 'scheduled';
  time?: string;
  entryDate?: string;
  ownerName?: string;
  ownerId?: string;
};

type DayEvents = {
  completed: CalendarEvent[];
  scheduled: CalendarEvent[];
};

function parseInterval(interval: string): number {
  const parts = interval.split(' ');
  const num = parseInt(parts[0], 10);
  const unit = parts[1];
  if (unit.startsWith('day')) return num;
  if (unit.startsWith('week')) return num * 7;
  if (unit.startsWith('month')) return num * 30;
  return 7;
}

function snapToWaterDay(date: Date, waterDay: number | undefined): Date {
  if (waterDay === undefined) return date;
  const current = date.getDay();
  const diff = (waterDay - current + 7) % 7;
  if (diff === 0) return date;
  const snapped = new Date(date);
  snapped.setDate(snapped.getDate() + diff);
  return snapped;
}

function buildDayEventsMap(plants: Plant[], year: number, month: number): Record<number, DayEvents> {
  const map: Record<number, DayEvents> = {};
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const ensure = (day: number) => {
    if (!map[day]) map[day] = { completed: [], scheduled: [] };
  };

  for (const plant of plants) {
    const log = plant.wateringLog || [];
    const completedDaysForPlant = new Set<number>();

    // 1. Completed events from watering log
    for (const entry of log) {
      const d = new Date(entry.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!completedDaysForPlant.has(day)) {
          completedDaysForPlant.add(day);
          ensure(day);
          map[day].completed.push({
            plant,
            type: 'completed',
            time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            entryDate: entry.date,
            ownerName: plant.ownerName,
            ownerId: plant.ownerId,
          });
        }
      }
    }

    // 2. Scheduled (projected) events — only today or future, not already completed
    const intervalDays = parseInterval(plant.checkInterval);
    const anchor = log.length > 0 ? new Date(log[log.length - 1].date) : new Date(plant.birthday);
    if (isNaN(anchor.getTime())) continue;

    const diffMs = monthStart.getTime() - anchor.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let startMultiple = diffDays <= 0 ? 0 : Math.floor(diffDays / intervalDays);

    for (let i = startMultiple; i < startMultiple + 60; i++) {
      let waterDate = new Date(anchor);
      waterDate.setDate(waterDate.getDate() + i * intervalDays);
      // Snap to preferred day of the week (only for intervals >= 7 days)
      if (intervalDays >= 7) {
        waterDate = snapToWaterDay(waterDate, plant.waterDay);
      }
      if (waterDate > monthEnd) break;
      if (waterDate >= monthStart && waterDate <= monthEnd) {
        const day = waterDate.getDate();
        if (!completedDaysForPlant.has(day) && waterDate >= todayStart) {
          ensure(day);
          if (!map[day].scheduled.some(e => e.plant.id === plant.id)) {
            map[day].scheduled.push({ plant, type: 'scheduled', ownerName: plant.ownerName, ownerId: plant.ownerId });
          }
        }
      }
    }
  }
  return map;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarScreen() {
  const { plants, waterPlant, unwaterPlant, householdEnabled, householdId, householdMembers, colorTheme, sendReminder, userName, refreshHouseholdMembers } = usePlants();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const theme = getThemeColors(colorTheme, isDark);
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const min = new Promise(r => setTimeout(r, 800));
    try { await Promise.all([refreshHouseholdMembers(), min]); } catch {}
    setRefreshing(false);
  }, [refreshHouseholdMembers]);

  const isHouseholdActive = householdEnabled && !!householdId;
  const currentUserId = user?.uid;

  // Map ownerId -> member color
  const memberColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of householdMembers) {
      map[m.uid] = m.color || '#007AFF';
    }
    return map;
  }, [householdMembers]);

  const getMemberColor = (ownerId?: string): string | undefined => {
    if (!isHouseholdActive || !ownerId) return undefined;
    return memberColorMap[ownerId];
  };

  const dayEventsMap = useMemo(
    () => buildDayEventsMap(plants, currentYear, currentMonth),
    [plants, currentYear, currentMonth],
  );

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  const isToday = (day: number) =>
    day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

  const goToPrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
    setSelectedDay(null);
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
    setSelectedDay(null);
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDay(today.getDate());
  };

  const handleQuickWater = async (plantId: string, plantName: string) => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await waterPlant(plantId);
    } catch {
      Alert.alert('Error', `Failed to water ${plantName}`);
    }
  };

  const handleUnwater = async (plantId: string, plantName: string, entryDate: string) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await unwaterPlant(plantId, entryDate);
    } catch {
      Alert.alert('Error', `Failed to undo watering for ${plantName}`);
    }
  };

  const selectedEvents: DayEvents = selectedDay ? dayEventsMap[selectedDay] || { completed: [], scheduled: [] } : { completed: [], scheduled: [] };
  const hasAnyEvents = selectedEvents.completed.length > 0 || selectedEvents.scheduled.length > 0;

  const rows: (number | null)[][] = [];
  let currentRow: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) currentRow.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    currentRow.push(day);
    if (currentRow.length === 7) { rows.push(currentRow); currentRow = []; }
  }
  if (currentRow.length > 0) {
    while (currentRow.length < 7) currentRow.push(null);
    rows.push(currentRow);
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.screenBg }]} edges={['top']}>
    <ThemedView style={[styles.container, { backgroundColor: theme.screenBg }]}>
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        <View style={styles.header}>
          <ThemedText style={styles.monthTitle}>{MONTH_NAMES[currentMonth]} {currentYear}</ThemedText>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={goToToday} style={[styles.todayButton, { backgroundColor: theme.cardBg }]}>
              <ThemedText style={styles.todayButtonText}>Today</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToPrevMonth} style={[styles.navButton, { backgroundColor: theme.cardBg }]}>
              <ThemedText style={styles.navButtonText}>‹</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToNextMonth} style={[styles.navButton, { backgroundColor: theme.cardBg }]}>
              <ThemedText style={styles.navButtonText}>›</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Legend Card */}
        <View style={[styles.legendCard, { backgroundColor: theme.cardBg }]}>
          <ThemedText style={styles.legendTitle}>Legend</ThemedText>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4CD964' }]} />
              <ThemedText style={[styles.legendLabel, { color: theme.secondaryText }]}>Watered</ThemedText>
            </View>
            {/* Gray dot for scheduled? */}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.secondaryText, opacity: 0.6 }]} />
              <ThemedText style={[styles.legendLabel, { color: theme.secondaryText }]}>Scheduled</ThemedText>
            </View>
          </View>
          {isHouseholdActive && householdMembers.length > 1 && (
            <>
              <View style={[styles.legendDivider, { backgroundColor: 'rgba(128,128,128,0.15)' }]} />
              <ThemedText style={[styles.legendSubtitle, { color: theme.secondaryText }]}>Members</ThemedText>
              <View style={styles.legendRow}>
                {householdMembers.map((m) => (
                  <View key={m.uid} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: m.color || '#007AFF' }]} />
                    <ThemedText style={[styles.legendLabel, { color: theme.secondaryText }]}>
                      {m.uid === currentUserId ? 'You' : m.displayName}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.weekRow}>
          {DAY_LABELS.map((label, i) => (
            <View key={i} style={styles.weekCell}>
              <ThemedText style={[styles.weekLabel, { color: theme.secondaryText }, (i === 0 || i === 6) && styles.weekendLabel]}>{label}</ThemedText>
            </View>
          ))}
        </View>

        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.weekRow}>
            {row.map((day, colIndex) => {
              if (day === null) return <View key={colIndex} style={styles.dayCell} />;
              const events = dayEventsMap[day];
              const selected = day === selectedDay;
              const todayDay = isToday(day);
              return (
                <TouchableOpacity key={colIndex} style={styles.dayCell} onPress={() => setSelectedDay(day)} activeOpacity={0.6}>
                  <View style={[styles.dayCircle, selected && [styles.selectedDayCircle, { backgroundColor: theme.primary }], todayDay && !selected && [styles.todayDayCircle, { borderColor: theme.primary }]]}>
                    <ThemedText style={[styles.dayText, selected && styles.selectedDayText, todayDay && !selected && [styles.todayDayText, { color: theme.primary }]]}>{day}</ThemedText>
                  </View>
                  {events && (
                    <View style={styles.dotRow}>
                      {events.completed.slice(0, 3).map((e, idx) => (
                        <View key={`c-${idx}`} style={[styles.dot, { backgroundColor: getMemberColor(e.ownerId) || '#4CD964' }]} />
                      ))}
                      {events.scheduled.slice(0, 3).map((e, idx) => (
                        <View key={`s-${idx}`} style={[styles.dot, { backgroundColor: getMemberColor(e.ownerId) || '#007AFF', opacity: 0.6 }]} />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Detail Panel */}
        <View style={[styles.detailSection, { backgroundColor: theme.cardBg }]}>
          <ThemedText style={styles.detailTitle}>
            {selectedDay ? `${MONTH_NAMES[currentMonth]} ${selectedDay}, ${currentYear}` : 'Select a date'}
          </ThemedText>

          {selectedDay && !hasAnyEvents && (
            <ThemedText style={[styles.noPlants, { color: theme.secondaryText }]}>No watering events</ThemedText>
          )}

          {/* Completed Section */}
          {selectedEvents.completed.length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <View style={[styles.sectionDot, { backgroundColor: '#4CD964' }]} />
                <ThemedText style={[styles.sectionLabel, { color: theme.secondaryText }]}>Completed</ThemedText>
              </View>
              {selectedEvents.completed.map((event) => (
                <View key={`c-${event.plant.id}`} style={styles.plantRow}>
                  {isHouseholdActive && event.ownerId && (
                    <View style={[styles.memberColorBar, { backgroundColor: getMemberColor(event.ownerId) || '#4CD964' }]} />
                  )}
                  {event.plant.photoUri ? (
                    <Image source={{ uri: event.plant.photoUri }} style={styles.plantThumb} />
                  ) : (
                    <View style={styles.plantThumbPlaceholder}>
                      <ThemedText style={styles.plantEmoji}>🌱</ThemedText>
                    </View>
                  )}
                  <View style={styles.plantDetails}>
                    <View style={styles.plantNameRow}>
                      <ThemedText style={styles.plantName}>{event.plant.name}</ThemedText>
                      {isHouseholdActive && event.ownerId && event.ownerId !== currentUserId && (
                        <View style={[styles.ownerBadge, { backgroundColor: getMemberColor(event.ownerId) || '#4CD964' }]}>
                          <ThemedText style={styles.ownerBadgeText}>{event.ownerName || 'Family'}</ThemedText>
                        </View>
                      )}
                    </View>
                    <ThemedText style={[styles.plantLocation, { color: theme.secondaryText }]}>
                      {event.plant.location}{event.time ? ` · ${event.time}` : ''}
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    style={styles.checkBadge}
                    onPress={() => event.entryDate && handleUnwater(event.plant.id, event.plant.name, event.entryDate)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ThemedText style={styles.checkText}>✓</ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* Scheduled Section */}
          {selectedEvents.scheduled.length > 0 && (
            <>
              <View style={[styles.sectionRow, selectedEvents.completed.length > 0 && { marginTop: 12 }]}>
                <View style={[styles.sectionDot, { backgroundColor: theme.secondaryText, opacity: 0.6 }]} />
                <ThemedText style={[styles.sectionLabel, { color: theme.secondaryText }]}>Scheduled</ThemedText>
              </View>
              {selectedEvents.scheduled.map((event) => {
                const isFamilyPlant = isHouseholdActive && event.ownerId && event.ownerId !== currentUserId;
                return (
                <View key={`s-${event.plant.id}`} style={styles.plantRow}>
                  {isHouseholdActive && event.ownerId && (
                    <View style={[styles.memberColorBar, { backgroundColor: getMemberColor(event.ownerId) || '#007AFF' }]} />
                  )}
                  {event.plant.photoUri ? (
                    <Image source={{ uri: event.plant.photoUri }} style={styles.plantThumb} />
                  ) : (
                    <View style={styles.plantThumbPlaceholder}>
                      <ThemedText style={styles.plantEmoji}>🌱</ThemedText>
                    </View>
                  )}
                  <View style={styles.plantDetails}>
                    <View style={styles.plantNameRow}>
                      <ThemedText style={styles.plantName}>{event.plant.name}</ThemedText>
                      {isFamilyPlant && (
                        <View style={[styles.ownerBadge, { backgroundColor: getMemberColor(event.ownerId!) || '#007AFF' }]}>
                          <ThemedText style={styles.ownerBadgeText}>{event.ownerName || 'Family'}</ThemedText>
                        </View>
                      )}
                    </View>
                    <ThemedText style={[styles.plantLocation, { color: theme.secondaryText }]}>
                      {event.plant.location}
                    </ThemedText>
                  </View>
                  <View style={styles.scheduledActions}>
                    {isFamilyPlant && (
                      <TouchableOpacity
                        style={[styles.remindButton, { backgroundColor: theme.primary }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          sendReminder(currentUserId || '', userName || '', event.ownerId!, event.plant.id, event.plant.name);
                          Alert.alert('Reminder Sent', `${event.ownerName} will be notified to water ${event.plant.name}.`);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <ThemedText style={styles.remindButtonText}>Remind</ThemedText>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.waterButton}
                      onPress={() => handleQuickWater(event.plant.id, event.plant.name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <ThemedText style={styles.waterButtonText}>Water</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { flex: 1 },
  scrollContainer: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 40, maxWidth: 600, alignSelf: 'center' as const, width: '100%' as const },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingBottom: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthTitle: { fontSize: 28, fontWeight: '700', paddingTop: 10 },
  todayButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  todayButtonText: { fontSize: 14, fontWeight: '600' },
  navButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  navButtonText: { fontSize: 22, fontWeight: '300', marginTop: -2 },
  legendCard: { borderRadius: 12, padding: 14, marginBottom: 12 },
  legendTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  legendSubtitle: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendDivider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, fontWeight: '500' },
  weekRow: { flexDirection: 'row' },
  weekCell: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  weekLabel: { fontSize: 13, fontWeight: '600' },
  weekendLabel: { opacity: 0.5 },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: 52 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  selectedDayCircle: { },
  todayDayCircle: { borderWidth: 1.5 },
  dayText: { fontSize: 16, fontWeight: '400' },
  selectedDayText: { color: '#FFF', fontWeight: '600' },
  todayDayText: { fontWeight: '600' },
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  detailSection: { marginTop: 20, borderRadius: 16, padding: 16 },
  detailTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  noPlants: { fontSize: 15, textAlign: 'center', paddingVertical: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  plantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.2)' },
  plantThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(128,128,128,0.15)' },
  plantThumbPlaceholder: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(128,128,128,0.15)', justifyContent: 'center', alignItems: 'center' },
  plantEmoji: { fontSize: 22 },
  plantDetails: { flex: 1, marginLeft: 12 },
  plantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  plantName: { fontSize: 16, fontWeight: '500' },
  ownerBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  ownerBadgeText: { fontSize: 10, fontWeight: '600', color: '#FFF' },
  plantLocation: { fontSize: 13, marginTop: 2 },
  checkBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(76,217,100,0.2)', justifyContent: 'center', alignItems: 'center' },
  checkText: { fontSize: 16, color: '#4CD964', fontWeight: '700' },
  scheduledActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  remindButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  remindButtonText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  waterButton: { backgroundColor: '#007AFF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  waterButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  memberColorBar: { width: 4, height: 36, borderRadius: 2, marginRight: 8 },
});
