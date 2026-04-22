import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { isFirebaseAvailable } from '@/services/firebase';
import { HouseholdMember, createHousehold, joinHousehold, leaveHousehold, getHouseholdMembers, updateMemberColor, subscribeToHouseholdMembers } from '@/services/household';
import { uploadLocalPlants, subscribeToPlants, syncPlantToFirestore, deletePlantFromFirestore, addWateringEntry, removeWateringEntry, clearWateringLog, snapshotPlantsFromFirestore, backfillPlantOwnership } from '@/services/plant-sync';
import { HouseholdNotification, subscribeToNotifications, markNotificationRead, sendWaterReminder } from '@/services/household-notifications';
import { ColorThemeName } from '@/constants/theme';
import { useAuth } from '@/app/context/AuthContext';

export type WateringEntry = {
  date: string; // ISO date string
  note?: string;
  wateredBy?: string; // display name of who watered (household mode)
};

export type Plant = {
  id: string;
  name: string;
  percent: number;
  photoUri?: string;
  location: string;
  checkInterval: string; // e.g., "3 days", "1 week", "2 weeks", "1 month"
  birthday: string; // ISO date string
  gender: 'Male' | 'Female' | 'Unknown';
  wateringLog: WateringEntry[];
  ownerId?: string;
  ownerName?: string;
  waterDay?: number; // 0=Sun, 1=Mon, ..., 6=Sat — preferred day of the week
  reminderTime?: string; // "HH:mm" format, e.g. "09:00"
};

export type AppAppearance = 'light' | 'dark' | 'system';

type PlantsContextType = {
  plants: Plant[];
  addPlant: (plant: Omit<Plant, 'id' | 'percent' | 'wateringLog'>) => Promise<void>;
  updatePlant: (id: string, plantData: Omit<Plant, 'id' | 'percent' | 'wateringLog'>) => Promise<void>;
  removePlant: (id: string) => Promise<void>;
  waterPlant: (id: string, note?: string) => Promise<void>;
  unwaterPlant: (id: string, entryDate: string) => Promise<void>;
  clearWateringHistory: (id: string) => Promise<void>;
  isLoading: boolean;
  userName: string | null;
  setUserName: (name: string) => Promise<void>;
  hasCompletedOnboarding: boolean;
  hasCompletedWalkthrough: boolean;
  setWalkthroughCompleted: () => Promise<void>;
  resetUserData: () => Promise<void>;
  appearance: AppAppearance;
  setAppearance: (value: AppAppearance) => Promise<void>;
  timezone: string;
  setTimezone: (value: string) => Promise<void>;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (value: boolean) => Promise<void>;
  defaultCheckInterval: string;
  setDefaultCheckInterval: (value: string) => Promise<void>;
  // Color theme
  colorTheme: ColorThemeName;
  setColorTheme: (value: ColorThemeName) => Promise<void>;
  // Household
  householdEnabled: boolean;
  setHouseholdEnabled: (value: boolean) => Promise<void>;
  householdId: string | null;
  householdCode: string | null;
  householdName: string | null;
  householdMembers: HouseholdMember[];
  createNewHousehold: (userId: string, displayName: string, name: string) => Promise<void>;
  joinExistingHousehold: (userId: string, displayName: string, code: string) => Promise<void>;
  leaveCurrentHousehold: (userId: string) => Promise<void>;
  refreshHouseholdMembers: () => Promise<void>;
  // Household member color
  householdMemberColor: string;
  setHouseholdMemberColor: (userId: string, color: string) => Promise<void>;
  // Household notifications
  householdNotifications: HouseholdNotification[];
  sendReminder: (fromUserId: string, fromName: string, toUserId: string, plantId: string, plantName: string) => Promise<void>;
  dismissNotification: (notificationId: string) => Promise<void>;
};

const PlantsContext = createContext<PlantsContextType | undefined>(undefined);

const PLANTS_KEY = 'plants_data';
const USER_NAME_KEY = 'user_name';
const ONBOARDING_KEY = 'onboarding_completed';
const WALKTHROUGH_KEY = 'walkthrough_completed';
const APPEARANCE_KEY = 'app_appearance';
const TIMEZONE_KEY = 'app_timezone';
const NOTIFICATIONS_KEY = 'notifications_enabled';
const DEFAULT_INTERVAL_KEY = 'default_check_interval';
const HOUSEHOLD_ENABLED_KEY = 'household_enabled';
const HOUSEHOLD_ID_KEY = 'household_id';
const HOUSEHOLD_CODE_KEY = 'household_code';
const HOUSEHOLD_NAME_KEY = 'household_name';
const COLOR_THEME_KEY = 'color_theme';
const MEMBER_COLOR_KEY = 'member_color';

const DEVICE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function PlantsProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserNameState] = useState<string | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [hasCompletedWalkthrough, setHasCompletedWalkthrough] = useState(false);
  const [appearance, setAppearanceState] = useState<AppAppearance>('system');
  const [timezone, setTimezoneState] = useState<string>(DEVICE_TIMEZONE);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [defaultCheckInterval, setDefaultCheckIntervalState] = useState('1 week');

  // Household state
  const [householdEnabled, setHouseholdEnabledState] = useState(false);
  const [householdId, setHouseholdIdState] = useState<string | null>(null);
  const [householdCode, setHouseholdCodeState] = useState<string | null>(null);
  const [householdName, setHouseholdNameState] = useState<string | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [householdMemberColor, setHouseholdMemberColorState] = useState('#FF3B30');
  const [householdNotifications, setHouseholdNotifications] = useState<HouseholdNotification[]>([]);
  const [colorTheme, setColorThemeState] = useState<ColorThemeName>('default');
  const firestoreUnsubscribeRef = useRef<(() => void) | null>(null);
  const notifUnsubscribeRef = useRef<(() => void) | null>(null);
  const membersUnsubscribeRef = useRef<(() => void) | null>(null);

  // Load plants and user data on mount
  useEffect(() => {
    loadPlants();
    loadUserData();
  }, []);

  const loadPlants = async () => {
    try {
      const stored = await SecureStore.getItemAsync(PLANTS_KEY);
      if (stored) {
        const parsedPlants = JSON.parse(stored);
        // Sort by newest first (assuming ID is timestamp-based)
        const sortedPlants = parsedPlants.sort((a: Plant, b: Plant) => 
          parseInt(b.id) - parseInt(a.id)
        );
        setPlants(sortedPlants);
      } else {
        // No stored data — start fresh with empty plants list
        setPlants([]);
      }
    } catch (error) {
      console.error('Error loading plants:', error);
    }
  };

  const loadUserData = async () => {
    try {
      const storedName = await SecureStore.getItemAsync(USER_NAME_KEY);
      const storedOnboarding = await SecureStore.getItemAsync(ONBOARDING_KEY);
      
      if (storedName) {
        setUserNameState(storedName);
      }
      if (storedOnboarding === 'true') {
        setHasCompletedOnboarding(true);
      }

      const storedWalkthrough = await SecureStore.getItemAsync(WALKTHROUGH_KEY);
      if (storedWalkthrough === 'true') {
        setHasCompletedWalkthrough(true);
      }

      const storedAppearance = await SecureStore.getItemAsync(APPEARANCE_KEY);
      if (storedAppearance) setAppearanceState(storedAppearance as AppAppearance);

      const storedTz = await SecureStore.getItemAsync(TIMEZONE_KEY);
      if (storedTz) setTimezoneState(storedTz);

      const storedNotif = await SecureStore.getItemAsync(NOTIFICATIONS_KEY);
      if (storedNotif !== null) setNotificationsEnabledState(storedNotif === 'true');

      const storedInterval = await SecureStore.getItemAsync(DEFAULT_INTERVAL_KEY);
      if (storedInterval) setDefaultCheckIntervalState(storedInterval);

      // Household settings
      const storedHouseholdEnabled = await SecureStore.getItemAsync(HOUSEHOLD_ENABLED_KEY);
      if (storedHouseholdEnabled === 'true') setHouseholdEnabledState(true);

      const storedHouseholdId = await SecureStore.getItemAsync(HOUSEHOLD_ID_KEY);
      if (storedHouseholdId) setHouseholdIdState(storedHouseholdId);

      const storedHouseholdCode = await SecureStore.getItemAsync(HOUSEHOLD_CODE_KEY);
      if (storedHouseholdCode) setHouseholdCodeState(storedHouseholdCode);

      const storedHouseholdName = await SecureStore.getItemAsync(HOUSEHOLD_NAME_KEY);
      if (storedHouseholdName) setHouseholdNameState(storedHouseholdName);

      const storedColorTheme = await SecureStore.getItemAsync(COLOR_THEME_KEY);
      if (storedColorTheme) setColorThemeState(storedColorTheme as ColorThemeName);

      const storedMemberColor = await SecureStore.getItemAsync(MEMBER_COLOR_KEY);
      if (storedMemberColor) setHouseholdMemberColorState(storedMemberColor);
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Firestore subscription: when household is enabled and has an ID, subscribe
  useEffect(() => {
    if (householdEnabled && householdId && isFirebaseAvailable()) {
      firestoreUnsubscribeRef.current = subscribeToPlants(householdId, (firestorePlants) => {
        setPlants(firestorePlants);

        // Backfill ownership for legacy plants that have no ownerId
        const userId = currentUserIdRef.current || authUser?.uid;
        if (userId && firestorePlants.some(p => !p.ownerId)) {
          backfillPlantOwnership(householdId!, userId, userName || 'Unknown').catch(console.error);
        }
      });

      // Real-time listener for household members (picks up color changes etc.)
      membersUnsubscribeRef.current = subscribeToHouseholdMembers(householdId, setHouseholdMembers);
    }

    return () => {
      if (firestoreUnsubscribeRef.current) {
        firestoreUnsubscribeRef.current();
        firestoreUnsubscribeRef.current = null;
      }
      if (membersUnsubscribeRef.current) {
        membersUnsubscribeRef.current();
        membersUnsubscribeRef.current = null;
      }
    };
  }, [householdEnabled, householdId]);

  // Household notifications subscription (needs userId from outside — use a separate effect)
  // We track the current user's uid via a ref set by household operations
  const currentUserIdRef = useRef<string | null>(null);

  // Keep currentUserIdRef in sync with the authenticated user
  useEffect(() => {
    if (authUser?.uid) {
      currentUserIdRef.current = authUser.uid;
    }
  }, [authUser?.uid]);

  useEffect(() => {
    const userId = currentUserIdRef.current || authUser?.uid;
    if (householdEnabled && householdId && userId) {
      currentUserIdRef.current = userId;
      notifUnsubscribeRef.current = subscribeToNotifications(
        userId,
        householdId,
        setHouseholdNotifications,
      );
    }

    return () => {
      if (notifUnsubscribeRef.current) {
        notifUnsubscribeRef.current();
        notifUnsubscribeRef.current = null;
      }
    };
  }, [householdEnabled, householdId, authUser?.uid]);

  const isFirestoreMode = householdEnabled && !!householdId;

  const addPlant = async (plantData: Omit<Plant, 'id' | 'percent' | 'wateringLog'>) => {
    try {
      const newPlant: Plant = {
        ...plantData,
        id: Date.now().toString(),
        percent: 80,
        wateringLog: [],
        ownerId: currentUserIdRef.current || undefined,
        ownerName: userName || undefined,
      };

      if (isFirestoreMode) {
        await syncPlantToFirestore(newPlant, householdId!);
      } else {
        const updatedPlants = [...plants, newPlant];
        setPlants(updatedPlants);
        await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(updatedPlants));
      }
    } catch (error) {
      console.error('Error adding plant:', error);
      throw error;
    }
  };

  const removePlant = async (id: string) => {
    try {
      if (isFirestoreMode) {
        await deletePlantFromFirestore(id, householdId!);
      } else {
        const updatedPlants = plants.filter((p) => p.id !== id);
        setPlants(updatedPlants);
        await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(updatedPlants));
      }
    } catch (error) {
      console.error('Error removing plant:', error);
      throw error;
    }
  };

  const updatePlant = async (id: string, plantData: Omit<Plant, 'id' | 'percent' | 'wateringLog'>) => {
    try {
      if (isFirestoreMode) {
        const existing = plants.find((p) => p.id === id);
        if (existing) {
          await syncPlantToFirestore({ ...existing, ...plantData }, householdId!);
        }
      } else {
        const updatedPlants = plants.map((p) =>
          p.id === id ? { ...p, ...plantData } : p
        );
        setPlants(updatedPlants);
        await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(updatedPlants));
      }
    } catch (error) {
      console.error('Error updating plant:', error);
      throw error;
    }
  };

  const waterPlant = async (id: string, note?: string) => {
    try {
      const entry: WateringEntry = {
        date: new Date().toISOString(),
      };
      if (note) entry.note = note;
      if (userName) entry.wateredBy = userName;

      if (isFirestoreMode) {
        await addWateringEntry(id, householdId!, entry);
      } else {
        const updatedPlants = plants.map((p) =>
          p.id === id ? { ...p, wateringLog: [...(p.wateringLog || []), entry] } : p
        );
        setPlants(updatedPlants);
        await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(updatedPlants));
      }
    } catch (error) {
      console.error('Error watering plant:', error);
      throw error;
    }
  };

  const unwaterPlant = async (id: string, entryDate: string) => {
    try {
      if (isFirestoreMode) {
        await removeWateringEntry(id, householdId!, entryDate);
      } else {
        const updatedPlants = plants.map((p) =>
          p.id === id
            ? { ...p, wateringLog: (p.wateringLog || []).filter((e) => e.date !== entryDate) }
            : p
        );
        setPlants(updatedPlants);
        await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(updatedPlants));
      }
    } catch (error) {
      console.error('Error unwatering plant:', error);
      throw error;
    }
  };

  const clearWateringHistory = async (id: string) => {
    try {
      if (isFirestoreMode) {
        await clearWateringLog(id, householdId!);
      } else {
        const updatedPlants = plants.map((p) =>
          p.id === id ? { ...p, wateringLog: [] } : p
        );
        setPlants(updatedPlants);
        await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(updatedPlants));
      }
    } catch (error) {
      console.error('Error clearing watering history:', error);
      throw error;
    }
  };

  const setUserName = async (name: string) => {
    try {
      setUserNameState(name);
      setHasCompletedOnboarding(true);
      setHasCompletedWalkthrough(true);
      await SecureStore.setItemAsync(USER_NAME_KEY, name);
      await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');
      await SecureStore.setItemAsync(WALKTHROUGH_KEY, 'true');
    } catch (error) {
      console.error('Error saving user name:', error);
      throw error;
    }
  };

  const setWalkthroughCompleted = async () => {
    setHasCompletedWalkthrough(true);
    await SecureStore.setItemAsync(WALKTHROUGH_KEY, 'true');
  };

  const resetUserData = async () => {
    try {
      // Unsubscribe from Firestore if active
      if (firestoreUnsubscribeRef.current) {
        firestoreUnsubscribeRef.current();
        firestoreUnsubscribeRef.current = null;
      }
      if (notifUnsubscribeRef.current) {
        notifUnsubscribeRef.current();
        notifUnsubscribeRef.current = null;
      }
      if (membersUnsubscribeRef.current) {
        membersUnsubscribeRef.current();
        membersUnsubscribeRef.current = null;
      }

      setUserNameState(null);
      setHasCompletedOnboarding(false);
      setHasCompletedWalkthrough(false);
      setAppearanceState('system');
      setTimezoneState(DEVICE_TIMEZONE);
      setNotificationsEnabledState(true);
      setDefaultCheckIntervalState('1 week');
      setColorThemeState('default');
      setHouseholdEnabledState(false);
      setHouseholdIdState(null);
      setHouseholdCodeState(null);
      setHouseholdNameState(null);
      setHouseholdMembers([]);
      setHouseholdMemberColorState('#FF3B30');
      setHouseholdNotifications([]);
      setPlants([]);
      currentUserIdRef.current = null;
      await SecureStore.deleteItemAsync(USER_NAME_KEY);
      await SecureStore.deleteItemAsync(ONBOARDING_KEY);
      await SecureStore.deleteItemAsync(WALKTHROUGH_KEY);
      await SecureStore.deleteItemAsync(PLANTS_KEY);
      await SecureStore.deleteItemAsync(APPEARANCE_KEY);
      await SecureStore.deleteItemAsync(TIMEZONE_KEY);
      await SecureStore.deleteItemAsync(NOTIFICATIONS_KEY);
      await SecureStore.deleteItemAsync(DEFAULT_INTERVAL_KEY);
      await SecureStore.deleteItemAsync(COLOR_THEME_KEY);
      await SecureStore.deleteItemAsync(MEMBER_COLOR_KEY);
      await SecureStore.deleteItemAsync(HOUSEHOLD_ENABLED_KEY);
      await SecureStore.deleteItemAsync(HOUSEHOLD_ID_KEY);
      await SecureStore.deleteItemAsync(HOUSEHOLD_CODE_KEY);
      await SecureStore.deleteItemAsync(HOUSEHOLD_NAME_KEY);
    } catch (error) {
      console.error('Error resetting user data:', error);
      throw error;
    }
  };

  const setAppearance = async (value: AppAppearance) => {
    setAppearanceState(value);
    await SecureStore.setItemAsync(APPEARANCE_KEY, value);
  };

  const setTimezone = async (value: string) => {
    setTimezoneState(value);
    await SecureStore.setItemAsync(TIMEZONE_KEY, value);
  };

  const setNotificationsEnabled = async (value: boolean) => {
    setNotificationsEnabledState(value);
    await SecureStore.setItemAsync(NOTIFICATIONS_KEY, value.toString());
  };

  const setDefaultCheckInterval = async (value: string) => {
    setDefaultCheckIntervalState(value);
    await SecureStore.setItemAsync(DEFAULT_INTERVAL_KEY, value);
  };

  const setColorTheme = async (value: ColorThemeName) => {
    setColorThemeState(value);
    await SecureStore.setItemAsync(COLOR_THEME_KEY, value);
  };

  // --- Household management ---

  const setHouseholdEnabled = async (value: boolean) => {
    setHouseholdEnabledState(value);
    await SecureStore.setItemAsync(HOUSEHOLD_ENABLED_KEY, value.toString());

    if (!value) {
      // Disabling: snapshot Firestore plants to local, unsubscribe
      if (firestoreUnsubscribeRef.current) {
        firestoreUnsubscribeRef.current();
        firestoreUnsubscribeRef.current = null;
      }
      // Save current plants to SecureStore so they persist locally
      await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(plants));

      if (!householdId) {
        setHouseholdCodeState(null);
        setHouseholdNameState(null);
        setHouseholdMembers([]);
        setHouseholdNotifications([]);
        await SecureStore.deleteItemAsync(HOUSEHOLD_CODE_KEY);
        await SecureStore.deleteItemAsync(HOUSEHOLD_NAME_KEY);
      }
    }
  };

  const createNewHousehold = async (userId: string, displayName: string, name: string) => {
    if (!isFirebaseAvailable()) throw new Error('Household sharing requires a development build with Firebase.');
    currentUserIdRef.current = userId;
    const { householdId: newId, code } = await createHousehold(userId, displayName, name);

    setHouseholdIdState(newId);
    setHouseholdCodeState(code);
    setHouseholdNameState(name);
    await SecureStore.setItemAsync(HOUSEHOLD_ID_KEY, newId);
    await SecureStore.setItemAsync(HOUSEHOLD_CODE_KEY, code);
    await SecureStore.setItemAsync(HOUSEHOLD_NAME_KEY, name);

    // Upload current local plants to Firestore
    await uploadLocalPlants(plants, newId);
  };

  const joinExistingHousehold = async (userId: string, displayName: string, code: string) => {
    if (!isFirebaseAvailable()) throw new Error('Household sharing requires a development build with Firebase.');
    currentUserIdRef.current = userId;
    const { householdId: joinedId, householdName: joinedName } = await joinHousehold(userId, displayName, code);

    setHouseholdIdState(joinedId);
    setHouseholdCodeState(code.toUpperCase());
    setHouseholdNameState(joinedName);
    await SecureStore.setItemAsync(HOUSEHOLD_ID_KEY, joinedId);
    await SecureStore.setItemAsync(HOUSEHOLD_CODE_KEY, code.toUpperCase());
    await SecureStore.setItemAsync(HOUSEHOLD_NAME_KEY, joinedName);
  };

  const leaveCurrentHousehold = async (userId: string) => {
    if (!householdId) return;

    // Snapshot plants before leaving so user keeps a local copy
    const snapshotPlants = await snapshotPlantsFromFirestore(householdId);
    await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(snapshotPlants));
    setPlants(snapshotPlants);

    await leaveHousehold(userId, householdId);

    if (firestoreUnsubscribeRef.current) {
      firestoreUnsubscribeRef.current();
      firestoreUnsubscribeRef.current = null;
    }
    if (notifUnsubscribeRef.current) {
      notifUnsubscribeRef.current();
      notifUnsubscribeRef.current = null;
    }
    if (membersUnsubscribeRef.current) {
      membersUnsubscribeRef.current();
      membersUnsubscribeRef.current = null;
    }

    setHouseholdIdState(null);
    setHouseholdCodeState(null);
    setHouseholdNameState(null);
    setHouseholdMembers([]);
    setHouseholdNotifications([]);
    await SecureStore.deleteItemAsync(HOUSEHOLD_ID_KEY);
    await SecureStore.deleteItemAsync(HOUSEHOLD_CODE_KEY);
    await SecureStore.deleteItemAsync(HOUSEHOLD_NAME_KEY);
  };

  const refreshHouseholdMembers = useCallback(async () => {
    if (!householdId) return;
    const members = await getHouseholdMembers(householdId);
    setHouseholdMembers(members);
  }, [householdId]);

  const setHouseholdMemberColor = async (userId: string, color: string) => {
    setHouseholdMemberColorState(color);
    await SecureStore.setItemAsync(MEMBER_COLOR_KEY, color);
    if (isFirebaseAvailable()) {
      await updateMemberColor(userId, color);
      // Also refresh local members list immediately so calendar/home picks up the change
      await refreshHouseholdMembers();
    }
  };

  const sendReminder = async (fromUserId: string, fromName: string, toUserId: string, plantId: string, plantName: string) => {
    if (!householdId) return;
    await sendWaterReminder(fromUserId, fromName, toUserId, plantId, plantName, householdId);
  };

  const dismissNotification = async (notificationId: string) => {
    if (!householdId) return;
    await markNotificationRead(notificationId, householdId);
  };

  const value: PlantsContextType = {
    plants,
    addPlant,
    updatePlant,
    removePlant,
    waterPlant,
    unwaterPlant,
    clearWateringHistory,
    isLoading,
    userName,
    setUserName,
    hasCompletedOnboarding,
    hasCompletedWalkthrough,
    setWalkthroughCompleted,
    resetUserData,
    appearance,
    setAppearance,
    timezone,
    setTimezone,
    notificationsEnabled,
    setNotificationsEnabled,
    defaultCheckInterval,
    setDefaultCheckInterval,
    colorTheme,
    setColorTheme,
    householdEnabled,
    setHouseholdEnabled,
    householdId,
    householdCode,
    householdName,
    householdMembers,
    createNewHousehold,
    joinExistingHousehold,
    leaveCurrentHousehold,
    refreshHouseholdMembers,
    householdMemberColor,
    setHouseholdMemberColor,
    householdNotifications,
    sendReminder,
    dismissNotification,
  };

  return <PlantsContext.Provider value={value}>{children}</PlantsContext.Provider>;
}

export function usePlants() {
  const context = useContext(PlantsContext);
  if (context === undefined) {
    throw new Error('usePlants must be used within PlantsProvider');
  }
  return context;
}
