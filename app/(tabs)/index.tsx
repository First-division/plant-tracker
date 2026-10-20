import * as Haptics from "expo-haptics";
import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StyleSheet, TouchableOpacity, ActivityIndicator, Alert, View, ScrollView, Image, TextInput, InteractionManager, RefreshControl, Platform, KeyboardAvoidingView, useWindowDimensions, Keyboard, findNodeHandle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from "expo-linear-gradient";
import { usePlants } from '@/contexts/PlantContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo, useRef, useState } from "react";
import OnboardingWalkthrough from "@/components/onboarding-walkthrough";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getThemeColors } from "@/constants/theme";
import { getNextWaterDate, isPlantOverdue } from '@/services/plant-schedule';

/** Show the user's plants, search/filter controls, and upcoming care reminders. */
export default function HomeScreen() {
  const router = useRouter();
  const {
    plants, isLoading, removePlant, userName, hasCompletedOnboarding,
    hasCompletedWalkthrough, setWalkthroughCompleted, resetUserData, waterPlant,
    householdEnabled, householdId, householdMembers, householdNotifications,
    sendReminder, dismissNotification, colorTheme, householdMemberColor,
    refreshHouseholdMembers,
  } = usePlants();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState<string | null>(null); // null = All, 'mine' = just me, or a uid
  const [refreshing, setRefreshing] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const { height } = useWindowDimensions();
  const hasNavigatedToWelcome = useRef(false);
  const hasShownWhatsNew = useRef(false);
  const homeScrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const theme = getThemeColors(colorTheme, isDark);

  // Refs for walkthrough spotlight targets
  const addButtonRef = useRef<View>(null);
  const remindersRef = useRef<View>(null);
  const plantsGridRef = useRef<View>(null);

  const showWalkthrough = hasCompletedOnboarding && !hasCompletedWalkthrough;
  const appVersionTag = useMemo(() => {
    const version = Application.nativeApplicationVersion || Constants.expoConfig?.version || 'dev';
    const build =
      Application.nativeBuildVersion ||
      (typeof Constants.expoConfig?.ios?.buildNumber === 'string' ? Constants.expoConfig.ios.buildNumber : undefined) ||
      (typeof Constants.expoConfig?.android?.versionCode === 'number'
        ? String(Constants.expoConfig.android.versionCode)
        : undefined) ||
      '0';

    return `${version}+${build}`;
  }, []);

  const walkthroughSteps = useMemo(() => [
    {
      title: 'Add Your First Plant',
      description: 'Tap the + button to add a new plant. You can set its name, location, watering schedule, and even snap a photo.',
      icon: '🌱',
      targetRef: addButtonRef,
    },
    {
      title: 'Watering Reminders',
      description: 'This section shows your upcoming watering schedule so you never forget to care for your plants.',
      icon: '💧',
      targetRef: remindersRef,
    },
    {
      title: 'Your Plant Cards',
      description: 'All your plants appear here as cards. Tap a card to see details. There, tap Water to log it, or press and hold Water to pick a past date and time.',
      icon: '🪴',
      targetRef: plantsGridRef,
    },
    {
      title: 'Calendar View',
      description: 'Switch to the Calendar tab to see all your watering dates at a glance — green for completed, blue for upcoming.',
      icon: '📅',
      centered: true,
    },
    {
      title: "You're All Set!",
      description: "You're ready to start caring for your plants. Need help later? Open Settings and tap App Guide for detailed feature tips.",
      icon: '🎉',
      centered: true,
    },
  ], []);

  const locations = useMemo(() => {
    const locs = [...new Set(plants.map((p) => p.location))];
    return locs.sort();
  }, [plants]);

  const filteredPlants = useMemo(() => {
    return plants.filter((p) => {
      const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLocation = !locationFilter || p.location === locationFilter;
      return matchesSearch && matchesLocation;
    });
  }, [plants, searchQuery, locationFilter]);

  // Group plants by owner for household mode
  const isHouseholdActive = householdEnabled && !!householdId;
  const currentUserId = user?.uid;

  const upcomingReminders = useMemo(() => {
    const referenceDate = new Date();
    const todayStart = new Date(referenceDate);
    todayStart.setHours(0, 0, 0, 0);
    const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const results: { plant: typeof plants[0]; date: Date; dateLabel: string; dayOfMonth: string; monthShort: string; ownerId: string; ownerName: string; ownerColor: string }[] = [];

    for (const plant of plants) {
      const nextWaterDate = getNextWaterDate(plant, referenceDate);
      if (!nextWaterDate) continue;

      const diff = Math.round((nextWaterDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
      const isOwn = !plant.ownerId || plant.ownerId === currentUserId;
      const member = householdMembers.find(m => m.uid === plant.ownerId);
      results.push({
        plant,
        date: nextWaterDate,
        dateLabel: diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff} days`,
        dayOfMonth: nextWaterDate.getDate().toString(),
        monthShort: MONTHS_SHORT[nextWaterDate.getMonth()],
        ownerId: plant.ownerId || currentUserId || 'me',
        ownerName: isOwn ? (userName || 'You') : (plant.ownerName || member?.displayName || 'Family Member'),
        ownerColor: isOwn ? (householdMemberColor || theme.primary) : (member?.color || '#007AFF'),
      });
    }
    return results.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [plants, currentUserId, householdMembers, userName, householdMemberColor, theme.primary]);

  const myPlants = useMemo(() => {
    if (!isHouseholdActive || !currentUserId) return filteredPlants;
    // If filtering to a specific family member, hide "Your Plants" section
    if (memberFilter && memberFilter !== 'mine') return [];
    return filteredPlants.filter(p => !p.ownerId || p.ownerId === currentUserId);
  }, [filteredPlants, isHouseholdActive, currentUserId, memberFilter]);

  const familyPlantGroups = useMemo(() => {
    if (!isHouseholdActive || !currentUserId) return [];
    if (memberFilter === 'mine') return [];
    const groups: Record<string, { ownerName: string; ownerId: string; color: string; plants: typeof plants }> = {};
    for (const p of filteredPlants) {
      if (p.ownerId && p.ownerId !== currentUserId) {
        if (memberFilter && memberFilter !== p.ownerId) continue;
        if (!groups[p.ownerId]) {
          // Look up member's chosen color
          const member = householdMembers.find(m => m.uid === p.ownerId);
          groups[p.ownerId] = {
            ownerName: p.ownerName || 'Family Member',
            ownerId: p.ownerId,
            color: member?.color || '#007AFF',
            plants: [],
          };
        }
        groups[p.ownerId].plants.push(p);
      }
    }
    return Object.values(groups);
  }, [filteredPlants, isHouseholdActive, currentUserId, memberFilter, householdMembers]);

  const unreadNotifications = useMemo(() => {
    return householdNotifications.filter(n => !n.read);
  }, [householdNotifications]);

  useEffect(() => {
    // Only push welcome on cold launch (not after reset — settings handles that)
    if (!isLoading && !hasCompletedOnboarding && !hasNavigatedToWelcome.current) {
      hasNavigatedToWelcome.current = true;
      const handle = InteractionManager.runAfterInteractions(() => {
        router.push("/welcome-modal");
      });
      return () => handle.cancel();
    }
  }, [isLoading, hasCompletedOnboarding]);

  useEffect(() => {
    if (isLoading || !hasCompletedOnboarding || showWalkthrough || hasShownWhatsNew.current) {
      return;
    }

    hasShownWhatsNew.current = true;

    void (async () => {
      try {
        const key = 'whats_new_seen_version';
        const lastSeen = await SecureStore.getItemAsync(key);
        if (lastSeen === appVersionTag) {
          return;
        }

        await SecureStore.setItemAsync(key, appVersionTag);
        InteractionManager.runAfterInteractions(() => {
          router.push('/whats-new-modal');
        });
      } catch (error) {
        console.error('Failed to resolve whats new visibility:', error);
      }
    })();
  }, [appVersionTag, hasCompletedOnboarding, isLoading, router, showWalkthrough]);

  const scrollSearchAboveKeyboard = () => {
    const inputNode = searchInputRef.current ? findNodeHandle(searchInputRef.current) : null;
    if (!inputNode || !homeScrollRef.current) {
      return;
    }

    homeScrollRef.current.scrollResponderScrollNativeHandleToKeyboard(inputNode, 64, true);
  };

  useEffect(() => {
    const keyboardShowSub = Keyboard.addListener('keyboardDidShow', () => {
      if (isSearchFocused) {
        InteractionManager.runAfterInteractions(() => {
          scrollSearchAboveKeyboard();
        });
      }
    });

    return () => {
      keyboardShowSub.remove();
    };
  }, [isSearchFocused]);

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const handleAddPlant = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push("/add-plant-modal");
  };

  const handlePlantTap = (plantId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/plant-detail', params: { id: plantId } });
  };

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: theme.screenBg }]}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.screenBg }]} edges={['top']}>
    <ThemedView style={[styles.container, { backgroundColor: theme.screenBg }]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
      <TouchableOpacity
        ref={addButtonRef}
        style={[styles.addButton, { backgroundColor: theme.accent }]}
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Add plant"
        onPress={handleAddPlant}>
        <ThemedText style={styles.addButtonText}>+</ThemedText>
      </TouchableOpacity>
      
      <ScrollView
        ref={homeScrollRef}
        style={styles.scrollContent}
        contentContainerStyle={[
          styles.scrollContentContainer,
          {
            minHeight: Platform.OS === 'android' ? height + 1 : undefined,
            paddingBottom: Math.max(insets.bottom + 96, 120),
          },
        ]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              const min = new Promise(r => setTimeout(r, 800));
              try { await Promise.all([refreshHouseholdMembers(), min]); } catch {}
              setRefreshing(false);
            }}
            tintColor={theme.primary}
          />
        }
      >
        {/* {/* TEMP: Welcome modal trigger */}
        {/* <TouchableOpacity
          onPress={() => router.push("/welcome-modal")}
          style={{ backgroundColor: 'red', padding: 10, borderRadius: 8, margin: 16, alignItems: 'center' }}
        >
          <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>DEV: Open Welcome Modal</ThemedText>
        </TouchableOpacity> */}

        {/* Greeting */}
        <View style={styles.greetingContainer}>
          <ThemedText style={styles.greeting}>{getTimeBasedGreeting()},</ThemedText>
          <ThemedText style={styles.userName} numberOfLines={2} adjustsFontSizeToFit>
            {userName}
          </ThemedText>
        </View>

        {/* Household Notifications */}
        {isHouseholdActive && unreadNotifications.length > 0 && (
          <View style={[styles.notifBanner, { backgroundColor: theme.cardBg }]}>
            <ThemedText style={styles.notifBannerTitle}>🔔 Reminders</ThemedText>
            {unreadNotifications.map((n) => (
              <View key={n.id} style={styles.notifCard}>
                <View style={styles.notifCardInfo}>
                  <ThemedText style={[styles.notifCardText, { color: theme.secondaryText }]}>
                    {n.fromName} reminded you to water <ThemedText style={styles.notifCardPlant}>{n.plantName}</ThemedText>
                  </ThemedText>
                </View>
                <View style={styles.notifCardActions}>
                  <TouchableOpacity
                    style={[styles.notifBtn, { backgroundColor: theme.accent }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Water ${n.plantName} now`}
                    onPress={() => {
                      const plant = plants.find(p => p.id === n.plantId);
                      if (plant) waterPlant(plant.id);
                      dismissNotification(n.id);
                    }}
                  >
                    <ThemedText style={styles.notifBtnText}>Water Now</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.notifDismissBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Dismiss reminder for ${n.plantName}`}
                    onPress={() => dismissNotification(n.id)}
                  >
                    <ThemedText style={styles.notifDismissText}>✕</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchRow}>
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, styles.searchInputFlex, { backgroundColor: theme.cardBg, color: theme.text }]}
            placeholder="Search plants..."
            placeholderTextColor={theme.secondaryText}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => {
              setIsSearchFocused(true);
              InteractionManager.runAfterInteractions(() => {
                scrollSearchAboveKeyboard();
              });
            }}
            onBlur={() => setIsSearchFocused(false)}
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={() => Keyboard.dismiss()}
            accessibilityLabel="Search plants"
          />
          {isSearchFocused && (
            <TouchableOpacity
              style={styles.searchDoneButton}
              onPress={() => Keyboard.dismiss()}
              accessibilityRole="button"
              accessibilityLabel="Hide keyboard"
            >
              <ThemedText style={{ color: theme.accent, fontWeight: '600', fontSize: 16 }}>Done</ThemedText>
            </TouchableOpacity>
          )}
          </View>
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={[styles.searchClearButton, isSearchFocused && { right: 58 }]}
              onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <ThemedText style={{ color: theme.secondaryText, fontSize: 16 }}>✕</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* Location Filter */}
        {locations.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent} nestedScrollEnabled>
            <TouchableOpacity
              style={[styles.filterChip, { backgroundColor: theme.cardBg }, !locationFilter && { backgroundColor: theme.accent }]}
              onPress={() => setLocationFilter(null)}
              accessibilityRole="button"
              accessibilityState={{ selected: !locationFilter }}
              accessibilityLabel="All locations"
            >
              <ThemedText style={[styles.filterChipText, { color: theme.secondaryText }, !locationFilter && styles.filterChipTextActive]}>All</ThemedText>
            </TouchableOpacity>
            {locations.map((loc) => (
              <TouchableOpacity
                key={loc}
                style={[styles.filterChip, { backgroundColor: theme.cardBg }, locationFilter === loc && { backgroundColor: theme.accent }]}
                onPress={() => setLocationFilter(locationFilter === loc ? null : loc)}
                accessibilityRole="button"
                accessibilityState={{ selected: locationFilter === loc }}
                accessibilityLabel={`Location ${loc}`}
              >
                <ThemedText numberOfLines={1} style={[styles.filterChipText, { color: theme.secondaryText }, locationFilter === loc && styles.filterChipTextActive]}>{loc}</ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {/* Member Filter (household mode only) */}
        {isHouseholdActive && householdMembers.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent} nestedScrollEnabled>
            <TouchableOpacity
              style={[styles.filterChip, { backgroundColor: theme.cardBg }, !memberFilter && { backgroundColor: theme.accent }]}
              onPress={() => setMemberFilter(null)}
              accessibilityRole="button"
              accessibilityState={{ selected: !memberFilter }}
              accessibilityLabel="All members"
            >
              <ThemedText style={[styles.filterChipText, { color: theme.secondaryText }, !memberFilter && styles.filterChipTextActive]}>All</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, { backgroundColor: theme.cardBg }, memberFilter === 'mine' && { backgroundColor: theme.accent }]}
              onPress={() => setMemberFilter(memberFilter === 'mine' ? null : 'mine')}
              accessibilityRole="button"
              accessibilityState={{ selected: memberFilter === 'mine' }}
              accessibilityLabel="My plants"
            >
              <ThemedText style={[styles.filterChipText, { color: theme.secondaryText }, memberFilter === 'mine' && styles.filterChipTextActive]}>Mine</ThemedText>
            </TouchableOpacity>
            {householdMembers.filter(m => m.uid !== currentUserId).map((m) => (
              <TouchableOpacity
                key={m.uid}
                style={[styles.filterChip, { backgroundColor: theme.cardBg }, memberFilter === m.uid && { backgroundColor: m.color || theme.accent }]}
                onPress={() => setMemberFilter(memberFilter === m.uid ? null : m.uid)}
                accessibilityRole="button"
                accessibilityState={{ selected: memberFilter === m.uid }}
                accessibilityLabel={`${m.displayName}'s plants`}
              >
                <View style={styles.memberChipRow}>
                  <View style={[styles.memberChipDot, { backgroundColor: m.color || '#007AFF' }]} />
                  <ThemedText numberOfLines={1} style={[styles.filterChipText, { color: theme.secondaryText }, memberFilter === m.uid && styles.filterChipTextActive]}>{m.displayName}</ThemedText>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Upcoming Reminders */}
        <View ref={remindersRef} style={[styles.remindersContainer, { backgroundColor: theme.cardBg }]}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionAccent, { backgroundColor: theme.primary }]} />
            <ThemedText style={styles.sectionTitle}>Upcoming Watering</ThemedText>
          </View>
          {upcomingReminders.length === 0 ? (
            <View style={styles.remindersContent}>
              <ThemedText style={[styles.noRemindersText, { color: theme.secondaryText }]}>No upcoming reminders</ThemedText>
              <ThemedText style={[styles.remindersSubtext, { color: theme.secondaryText }]}>Add plants to see watering schedules</ThemedText>
            </View>
          ) : (
            upcomingReminders.slice(0, 3).map((reminder, index) => (
              <View key={`${reminder.plant.id}-${reminder.dateLabel}`} style={[styles.reminderRow, index > 0 && styles.reminderRowBorder]}>
                <View style={styles.reminderDateBadge}>
                  <ThemedText style={styles.reminderDateDay}>{reminder.dayOfMonth}</ThemedText>
                  <ThemedText style={[styles.reminderDateMonth, { color: theme.secondaryText }]}>{reminder.monthShort}</ThemedText>
                </View>
                <View style={styles.reminderInfo}>
                  <View style={styles.reminderNameRow}>
                    {isHouseholdActive && <View style={[styles.reminderColorBar, { backgroundColor: reminder.ownerColor }]} />}
                    <ThemedText style={styles.reminderPlantName}>{reminder.plant.name}</ThemedText>
                  </View>
                  <ThemedText style={[styles.reminderDateLabel, { color: theme.secondaryText }]}>
                    {reminder.dateLabel}{isHouseholdActive ? ` · ${reminder.ownerId === currentUserId || reminder.ownerId === 'me' ? 'You' : reminder.ownerName}` : ''}
                  </ThemedText>
                </View>
                <ThemedText style={styles.reminderDrop}>💧</ThemedText>
              </View>
            ))
          )}
        </View>

        {/* Your Plants — hidden when filtering to a specific family member */}
        {(!memberFilter || memberFilter === 'mine') && (
        <View ref={plantsGridRef}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionAccent, { backgroundColor: isHouseholdActive ? householdMemberColor || theme.primary : theme.primary }]} />
          <ThemedText style={styles.sectionTitle}>
            Your Plants{myPlants.length !== plants.length ? ` (${myPlants.length})` : ''}
          </ThemedText>
        </View>
        {myPlants.length === 0 && (searchQuery || locationFilter) && (
          <View style={styles.emptyFilter}>
            <ThemedText style={[styles.emptyFilterText, { color: theme.secondaryText }]}>No plants match your search</ThemedText>
            <TouchableOpacity
              style={[styles.clearFiltersButton, { backgroundColor: theme.accent }]}
              onPress={() => { setSearchQuery(''); setLocationFilter(null); }}
              accessibilityRole="button"
              accessibilityLabel="Clear search and filters"
            >
              <ThemedText style={styles.clearFiltersText}>Clear {searchQuery && locationFilter ? 'search & filter' : searchQuery ? 'search' : 'filter'}</ThemedText>
            </TouchableOpacity>
          </View>
        )}
        {myPlants.map((item) => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.85}
            onPress={() => handlePlantTap(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.location}. Water every ${item.checkInterval}`}
          >
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.6)', 'rgba(0, 132, 255, 0.2)', 'rgba(255, 182, 222, 0.2)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardBorder}
            >
              <ThemedView style={[styles.card, { backgroundColor: theme.cardBg }]}>
                <View style={styles.plantInfo}>
                  <ThemedText style={styles.plantName}>{item.name}</ThemedText>
                  <ThemedText style={[styles.plantLocation, { color: theme.secondaryText }]}>{item.location}</ThemedText>
                  <ThemedText style={[styles.percent, { color: theme.accent }]}>
                    Water Every {item.checkInterval}
                  </ThemedText>
                </View>
                
                {/* Plant Image */}
                {item.photoUri ? (
                  <Image
                    source={{ uri: item.photoUri }}
                    style={styles.plantImage}
                  />
                ) : (
                  <View style={styles.plantImagePlaceholder}>
                    <ThemedText style={styles.imagePlaceholderText}>🌱</ThemedText>
                  </View>
                )}
              </ThemedView>
            </LinearGradient>
          </TouchableOpacity>
        ))}
        </View>
        )}

        {/* Family Members' Plants */}
        {familyPlantGroups.map((group) => (
          <View key={group.ownerId} style={styles.familySection}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionAccent, { backgroundColor: group.color }]} />
              <ThemedText style={styles.sectionTitle}>{group.ownerName}&apos;s Plants</ThemedText>
            </View>
            {group.plants.map((item) => {
              const overdue = isPlantOverdue(item);
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => handlePlantTap(item.id)}
                >
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.4)', 'rgba(0, 132, 255, 0.15)', 'rgba(255, 182, 222, 0.15)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardBorder}
                  >
                    <ThemedView style={[styles.card, { backgroundColor: theme.cardBg }]}>
                      <View style={styles.plantInfo}>
                        <ThemedText style={styles.plantName}>{item.name}</ThemedText>
                        <ThemedText style={[styles.plantLocation, { color: theme.secondaryText }]}>{item.location}</ThemedText>
                        <View style={styles.familyCardRow}>
                          <ThemedText style={[styles.percent, { color: theme.accent }]}>
                            Water Every {item.checkInterval}
                          </ThemedText>
                          {overdue && (
                            <TouchableOpacity
                              style={[styles.remindBtn, { backgroundColor: theme.primary }]}
                              accessibilityRole="button"
                              accessibilityLabel={`Remind ${group.ownerName} to water ${item.name}`}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                sendReminder(currentUserId || '', userName || '', group.ownerId, item.id, item.name);
                                Alert.alert('Reminder Sent', `${group.ownerName} will be notified to water ${item.name}.`);
                              }}
                            >
                              <ThemedText style={styles.remindBtnText}>Remind 💧</ThemedText>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      {item.photoUri ? (
                        <Image source={{ uri: item.photoUri }} style={styles.plantImage} />
                      ) : (
                        <View style={styles.plantImagePlaceholder}>
                          <ThemedText style={styles.imagePlaceholderText}>🌱</ThemedText>
                        </View>
                      )}
                    </ThemedView>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {showWalkthrough && (
        <OnboardingWalkthrough
          steps={walkthroughSteps}
          onComplete={setWalkthroughCompleted}
        />
      )}
      </KeyboardAvoidingView>
    </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },

  keyboardAvoidingContainer: {
    flex: 1,
  },

  scrollContent: {
    flex: 1,
  },

  searchContainer: {
    marginBottom: 12,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  searchInputFlex: {
    flex: 1,
  },

  searchDoneButton: {
    minHeight: 44,
    minWidth: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },

  searchClearButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  clearFiltersButton: {
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    justifyContent: 'center',
  },

  clearFiltersText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },

  searchInput: {
    paddingRight: 44,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
  },

  filterRow: {
    marginBottom: 12,
    flexGrow: 0,
  },

  filterRowContent: {
    gap: 8,
    paddingRight: 20,
  },

  filterChip: {
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 22,
    maxWidth: 220,
  },

  filterChipActive: {
    backgroundColor: '#00C853',
  },

  filterChipText: {
    fontSize: 14,
  },

  filterChipTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },

  emptyFilter: {
    alignItems: 'center',
    paddingVertical: 30,
  },

  emptyFilterText: {
    fontSize: 16,
  },

  scrollContentContainer: {
    paddingTop: 56,
    paddingBottom: 40,
    maxWidth: 600,
    alignSelf: 'center' as const,
    width: '100%' as const,
  },

  greetingContainer: {
    marginBottom: 40,
    paddingTop: 20,
  },

  greeting: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 5,

    lineHeight: 30,

  },

  userName: {
    fontSize: 32,
    fontWeight: "700",
    marginTop: 5,
    paddingTop: 10,

    lineHeight: 40,

  },

  remindersContainer: {
    borderRadius: 15,
    padding: 20,
    marginBottom: 30,
  },
     
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 10,
  },

  sectionAccent: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },

   sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },

  remindersContent: {
    alignItems: "center",
  },

  noRemindersText: {
    fontSize: 16,
    marginBottom: 5,
  },

  remindersSubtext: {
    fontSize: 14,
  },

  cardBorder: {
    borderRadius: 25,
    marginBottom: 15,
    padding: 2,
  },

  card: {
    paddingVertical: 18,
    paddingLeft: 18,
    paddingRight: 10,
    borderRadius: 23,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,

    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },

  plantImage: {
    marginRight: 40,
    width: 90,
    height: 90,
    borderRadius: 15,
    backgroundColor: "rgba(128, 128, 128, 0.15)",
  },

  plantImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 15,
    backgroundColor: "rgba(128, 128, 128, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },

  imagePlaceholderText: {
    fontSize: 25,

    lineHeight: 31,

  },

  plantInfo: {
    flex: 1,
  },

  plantName: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 5,
  },

  plantLocation: {
    fontSize: 14,
    marginBottom: 8,
  },

  percent: {
    color: "#00C853",
    fontWeight: "500",
  },

  safeArea: {
    flex: 1,
  },

  addButton: {
    position: "absolute",
    top: 4,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#00C853",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    zIndex: 10,
  },

  addButtonText: {
    color: "#FFFFFF",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "700",
  },

  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },

  reminderRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128, 128, 128, 0.2)",
  },

  reminderDateBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(128, 128, 128, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },

  reminderDateDay: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },

  reminderDateMonth: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    lineHeight: 12,
  },

  reminderInfo: {
    flex: 1,
    marginLeft: 12,
  },

  reminderPlantName: {
    fontSize: 16,
    fontWeight: "500",
  },

  reminderDateLabel: {
    fontSize: 13,
    marginTop: 2,
  },

  reminderDrop: {
    fontSize: 20,
  },

  reminderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  reminderColorBar: {
    width: 3,
    height: 14,
    borderRadius: 1.5,
  },

  // Household notification banner
  notifBanner: {
    borderRadius: 15,
    padding: 16,
    marginBottom: 16,
  },

  notifBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },

  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },

  notifCardInfo: {
    flex: 1,
    marginRight: 10,
  },

  notifCardText: {
    fontSize: 14,
  },

  notifCardPlant: {
    fontWeight: '600',
  },

  notifCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  notifBtn: {
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 22,
  },

  notifBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },

  notifDismissBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(128,128,128,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  notifDismissText: {
    fontSize: 14,
  },

  // Family plant sections
  familySection: {
    marginTop: 20,
  },

  familyCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  remindBtn: {
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 22,
  },

  remindBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },

  memberChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  memberChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});