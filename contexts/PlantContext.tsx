import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { isFirebaseAvailable } from '@/services/firebase';
import { HouseholdMember, createHousehold, joinHousehold, leaveHousehold, getHouseholdMembers, updateMemberColor, subscribeToHouseholdMembers } from '@/services/household';
import { uploadLocalPlants, subscribeToPlants, syncPlantToFirestore, deletePlantFromFirestore, addWateringEntry, removeWateringEntry, clearWateringLog, snapshotPlantsFromFirestore, backfillPlantOwnership } from '@/services/plant-sync';
import { HouseholdNotification, subscribeToNotifications, markNotificationRead, sendWaterReminder } from '@/services/household-notifications';
import { DeletedPlantTombstone, deletePlantFromPersonalBackup, markPersonalBackupDisabled, PersonalBackupSnapshot, snapshotPersonalBackup, subscribeToPersonalBackup, syncPlantToPersonalBackup } from '@/services/personal-backup';
import { ColorThemeName } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { clearStoredPlantPhotos, deleteStoredPlantPhoto, reconcilePlantPhotoUris } from '@/services/plant-photos';
import { removeWateringEntriesForDay, upsertWateringEntryForDay } from '@/services/watering-log';

export type WateringEntry = {
  date: string;
  action?: string;
  dotColor?: string;
  note?: string;
  wateredBy?: string;
};

export type Plant = {
  id: string;
  name: string;
  percent: number;
  photoUri?: string;
  photoStoragePath?: string;
  location: string;
  checkInterval: string;
  birthday: string;
  gender: 'Male' | 'Female' | 'Unknown';
  wateringLog: WateringEntry[];
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  ownerName?: string;
  waterDay?: number;
  reminderTime?: string;
};

export type PlantInput = Pick<
  Plant,
  | 'name'
  | 'photoUri'
  | 'location'
  | 'checkInterval'
  | 'birthday'
  | 'gender'
  | 'ownerId'
  | 'ownerName'
  | 'waterDay'
  | 'reminderTime'
>;

export type AppAppearance = 'light' | 'dark' | 'system';

type SetHouseholdEnabledOptions = {
  preserveLocalPlants?: boolean;
};

type PlantsContextType = {
  plants: Plant[];
  addPlant: (plant: PlantInput) => Promise<void>;
  updatePlant: (id: string, plantData: PlantInput) => Promise<void>;
  removePlant: (id: string) => Promise<void>;
  waterPlant: (id: string, note?: string, wateredAt?: string) => Promise<void>;
  addPlantHistoryEntry: (id: string, action: string, entryAt?: string, dotColor?: string) => Promise<void>;
  unwaterPlant: (id: string, entryDate: string, removeAllForDay?: boolean) => Promise<void>;
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
  colorTheme: ColorThemeName;
  setColorTheme: (value: ColorThemeName) => Promise<void>;
  personalBackupEnabled: boolean;
  personalBackupAuthPending: boolean;
  setPersonalBackupEnabled: (value: boolean) => Promise<void>;
  setPersonalBackupAuthPending: (value: boolean) => void;
  syncPersonalBackupNow: () => Promise<void>;
  householdEnabled: boolean;
  householdAuthPending: boolean;
  setHouseholdAuthPending: (value: boolean) => void;
  setHouseholdEnabled: (value: boolean, options?: SetHouseholdEnabledOptions) => Promise<void>;
  householdId: string | null;
  householdCode: string | null;
  householdName: string | null;
  householdMembers: HouseholdMember[];
  createNewHousehold: (userId: string, displayName: string, name: string) => Promise<void>;
  joinExistingHousehold: (userId: string, displayName: string, code: string) => Promise<void>;
  leaveCurrentHousehold: (userId: string) => Promise<void>;
  refreshHouseholdMembers: () => Promise<void>;
  householdMemberColor: string;
  setHouseholdMemberColor: (userId: string, color: string) => Promise<void>;
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
const PERSONAL_BACKUP_ENABLED_KEY = 'personal_backup_enabled';
const HOUSEHOLD_ENABLED_KEY = 'household_enabled';
const HOUSEHOLD_ID_KEY = 'household_id';
const HOUSEHOLD_CODE_KEY = 'household_code';
const HOUSEHOLD_NAME_KEY = 'household_name';
const COLOR_THEME_KEY = 'color_theme';
const MEMBER_COLOR_KEY = 'member_color';

const DEVICE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function isRemotePhotoUri(photoUri?: string): boolean {
  return !!photoUri && (/^https?:\/\//i.test(photoUri) || photoUri.startsWith('data:'));
}

function getLegacyPlantTimestamp(plantId: string): string {
  const numericId = Number.parseInt(plantId, 10);
  if (Number.isFinite(numericId) && numericId > 0) {
    return new Date(numericId).toISOString();
  }

  return new Date().toISOString();
}

function normalizePlantRecord(plant: Plant): { plant: Plant; changed: boolean } {
  const normalizedPhotoUri = plant.photoUri?.trim() || undefined;
  const createdAt = plant.createdAt || getLegacyPlantTimestamp(plant.id);
  const updatedAt = plant.updatedAt || createdAt;
  const photoStoragePath = normalizedPhotoUri ? plant.photoStoragePath : undefined;

  const nextPlant: Plant = {
    ...plant,
    photoUri: normalizedPhotoUri,
    photoStoragePath,
    createdAt,
    updatedAt,
  };

  const changed =
    nextPlant.photoUri !== plant.photoUri ||
    nextPlant.photoStoragePath !== plant.photoStoragePath ||
    nextPlant.createdAt !== plant.createdAt ||
    nextPlant.updatedAt !== plant.updatedAt;

  return { plant: nextPlant, changed };
}

function applyPlantInput(existing: Plant, plantData: PlantInput): Plant {
  const nextPhotoUri = plantData.photoUri?.trim() || undefined;
  const photoChanged = existing.photoUri !== nextPhotoUri;

  return {
    ...existing,
    ...plantData,
    photoUri: nextPhotoUri,
    photoStoragePath:
      photoChanged && (!nextPhotoUri || !isRemotePhotoUri(nextPhotoUri))
        ? undefined
        : existing.photoStoragePath,
    updatedAt: new Date().toISOString(),
  };
}

function getPlantUpdatedAtValue(plant: Plant): number {
  const parsed = Date.parse(plant.updatedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getDeletedPlantTombstoneValue(tombstone: DeletedPlantTombstone): number {
  const parsed = Date.parse(tombstone.deletedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortPlantsByNewestId(plants: Plant[]): Plant[] {
  return [...plants].sort((a, b) => Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10));
}

function mergePlantsForPersonalBackup(
  localPlants: Plant[],
  remotePlants: Plant[],
  deletedPlantTombstones: DeletedPlantTombstone[],
): {
  mergedPlants: Plant[];
  plantsToUpload: Plant[];
} {
  const localById = new Map(localPlants.map((plant) => [plant.id, plant]));
  const remoteById = new Map(remotePlants.map((plant) => [plant.id, plant]));
  const deletedPlantTombstoneById = new Map(
    deletedPlantTombstones.map((tombstone) => [tombstone.plantId, tombstone]),
  );
  const mergedPlants: Plant[] = [];
  const plantsToUpload: Plant[] = [];
  const allIds = new Set<string>([
    ...localById.keys(),
    ...remoteById.keys(),
    ...deletedPlantTombstoneById.keys(),
  ]);

  for (const plantId of allIds) {
    const localPlant = localById.get(plantId);
    const remotePlant = remoteById.get(plantId);
    const deletedPlantTombstone = deletedPlantTombstoneById.get(plantId);
    const deletedPlantTombstoneValue = deletedPlantTombstone
      ? getDeletedPlantTombstoneValue(deletedPlantTombstone)
      : null;
    const survivingLocalPlant =
      localPlant && deletedPlantTombstoneValue !== null && deletedPlantTombstoneValue >= getPlantUpdatedAtValue(localPlant)
        ? undefined
        : localPlant;
    const survivingRemotePlant =
      remotePlant && deletedPlantTombstoneValue !== null && deletedPlantTombstoneValue >= getPlantUpdatedAtValue(remotePlant)
        ? undefined
        : remotePlant;

    if (survivingLocalPlant && survivingRemotePlant) {
      if (getPlantUpdatedAtValue(survivingLocalPlant) > getPlantUpdatedAtValue(survivingRemotePlant)) {
        mergedPlants.push(survivingLocalPlant);
        plantsToUpload.push(survivingLocalPlant);
      } else {
        mergedPlants.push(survivingRemotePlant);
      }
      continue;
    }

    if (survivingLocalPlant) {
      mergedPlants.push(survivingLocalPlant);
      plantsToUpload.push(survivingLocalPlant);
      continue;
    }

    if (survivingRemotePlant) {
      mergedPlants.push(survivingRemotePlant);
    }
  }

  return {
    mergedPlants: sortPlantsByNewestId(mergedPlants),
    plantsToUpload,
  };
}

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
  const [personalBackupEnabled, setPersonalBackupEnabledState] = useState(false);
  const [personalBackupAuthPending, setPersonalBackupAuthPendingState] = useState(false);
  const [householdEnabled, setHouseholdEnabledState] = useState(false);
  const [householdAuthPending, setHouseholdAuthPendingState] = useState(false);
  const [householdId, setHouseholdIdState] = useState<string | null>(null);
  const [householdCode, setHouseholdCodeState] = useState<string | null>(null);
  const [householdName, setHouseholdNameState] = useState<string | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [householdMemberColor, setHouseholdMemberColorState] = useState('#FF3B30');
  const [householdNotifications, setHouseholdNotifications] = useState<HouseholdNotification[]>([]);
  const [colorTheme, setColorThemeState] = useState<ColorThemeName>('default');
  const plantsRef = useRef<Plant[]>([]);
  const householdIdRef = useRef<string | null>(null);
  const personalBackupUnsubscribeRef = useRef<(() => void) | null>(null);
  const personalBackupSyncInProgressRef = useRef(false);
  const firestoreUnsubscribeRef = useRef<(() => void) | null>(null);
  const notifUnsubscribeRef = useRef<(() => void) | null>(null);
  const membersUnsubscribeRef = useRef<(() => void) | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    plantsRef.current = plants;
  }, [plants]);

  useEffect(() => {
    householdIdRef.current = householdId;
  }, [householdId]);

  const persistPlantsLocally = useCallback(async (nextPlants: Plant[]) => {
    plantsRef.current = nextPlants;
    setPlants(nextPlants);
    await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(nextPlants));
  }, []);

  const hydratePlants = useCallback(
    async (
      candidatePlants: Plant[],
      options?: {
        persistLocally?: boolean;
        householdIdToSync?: string | null;
      },
    ): Promise<Plant[]> => {
      const normalizedPlants: Plant[] = [];
      const changedPlantIds = new Set<string>();

      for (const plant of candidatePlants) {
        const { plant: normalizedPlant, changed } = normalizePlantRecord(plant);
        normalizedPlants.push(normalizedPlant);

        if (changed) {
          changedPlantIds.add(normalizedPlant.id);
        }
      }

      const { plants: nextPlants, changedPlants: reconciledPlants } = await reconcilePlantPhotoUris(normalizedPlants);

      for (const plant of reconciledPlants) {
        changedPlantIds.add(plant.id);
      }

      const changedPlants = nextPlants.filter((plant) => changedPlantIds.has(plant.id));

      if (options?.persistLocally) {
        await persistPlantsLocally(nextPlants);
      } else {
        plantsRef.current = nextPlants;
        setPlants(nextPlants);
      }

      if (options?.householdIdToSync && changedPlants.length > 0) {
        await Promise.all(
          changedPlants.map((plant) =>
            syncPlantToFirestore(plant, options.householdIdToSync!).catch((error) => {
              console.error('Error syncing migrated plant photo:', error);
            }),
          ),
        );
      }

      return nextPlants;
    },
    [persistPlantsLocally],
  );

  const loadPlants = useCallback(async () => {
    try {
      const stored = await SecureStore.getItemAsync(PLANTS_KEY);
      if (stored) {
        const parsedPlants = JSON.parse(stored) as Plant[];
        const sortedPlants = parsedPlants.sort((a: Plant, b: Plant) => parseInt(b.id) - parseInt(a.id));
        await hydratePlants(sortedPlants, { persistLocally: true });
      } else {
        plantsRef.current = [];
        setPlants([]);
      }
    } catch (error) {
      console.error('Error loading plants:', error);
    }
  }, [hydratePlants]);

  const loadUserData = useCallback(async () => {
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

      const storedPersonalBackupEnabled = await SecureStore.getItemAsync(PERSONAL_BACKUP_ENABLED_KEY);
      if (storedPersonalBackupEnabled === 'true') setPersonalBackupEnabledState(true);

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
  }, []);

  useEffect(() => {
    void loadPlants();
    void loadUserData();
  }, [loadPlants, loadUserData]);

  useEffect(() => {
    if (householdEnabled && householdId && isFirebaseAvailable()) {
      firestoreUnsubscribeRef.current = subscribeToPlants(householdId, (firestorePlants) => {
        void hydratePlants(firestorePlants, {
          persistLocally: true,
          householdIdToSync: householdId,
        });

        const userId = currentUserIdRef.current || authUser?.uid;
        if (userId && firestorePlants.some(p => !p.ownerId)) {
          backfillPlantOwnership(householdId, userId, userName || 'Unknown').catch(console.error);
        }
      });

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
  }, [authUser?.uid, householdEnabled, householdId, hydratePlants, userName]);

  useEffect(() => {
    if (authUser?.uid) {
      currentUserIdRef.current = authUser.uid;
    }
  }, [authUser?.uid]);

  const personalBackupUserId = authUser?.uid && !authUser.isAnonymous ? authUser.uid : null;

  const reconcilePersonalBackupSnapshot = useCallback(
    async (backupSnapshot: PersonalBackupSnapshot, userId: string) => {
      if (personalBackupSyncInProgressRef.current) {
        return;
      }

      personalBackupSyncInProgressRef.current = true;

      try {
        const { mergedPlants, plantsToUpload } = mergePlantsForPersonalBackup(
          plantsRef.current,
          backupSnapshot.plants,
          backupSnapshot.deletedPlantTombstones,
        );
        await hydratePlants(mergedPlants, { persistLocally: true });

        if (plantsToUpload.length > 0) {
          await Promise.all(
            plantsToUpload.map((plant) =>
              syncPlantToPersonalBackup(plant, userId).catch((error) => {
                console.error('Error syncing personal backup plant:', error);
              }),
            ),
          );
        }
      } finally {
        personalBackupSyncInProgressRef.current = false;
      }
    },
    [hydratePlants],
  );

  const syncPersonalBackupNow = useCallback(async () => {
    if (!personalBackupEnabled || householdEnabled || !personalBackupUserId) {
      return;
    }

    const backupSnapshot = await snapshotPersonalBackup(personalBackupUserId);
    await reconcilePersonalBackupSnapshot(backupSnapshot, personalBackupUserId);
  }, [householdEnabled, personalBackupEnabled, personalBackupUserId, reconcilePersonalBackupSnapshot]);

  useEffect(() => {
    if (personalBackupEnabled && !householdEnabled && personalBackupUserId && isFirebaseAvailable()) {
      personalBackupUnsubscribeRef.current = subscribeToPersonalBackup(personalBackupUserId, (backupSnapshot) => {
        void reconcilePersonalBackupSnapshot(backupSnapshot, personalBackupUserId);
      });
    }

    return () => {
      if (personalBackupUnsubscribeRef.current) {
        personalBackupUnsubscribeRef.current();
        personalBackupUnsubscribeRef.current = null;
      }
    };
  }, [householdEnabled, personalBackupEnabled, personalBackupUserId, reconcilePersonalBackupSnapshot]);

  useEffect(() => {
    const userId = currentUserIdRef.current || authUser?.uid;
    if (householdEnabled && householdId && userId) {
      currentUserIdRef.current = userId;
      notifUnsubscribeRef.current = subscribeToNotifications(userId, householdId, setHouseholdNotifications);
    }

    return () => {
      if (notifUnsubscribeRef.current) {
        notifUnsubscribeRef.current();
        notifUnsubscribeRef.current = null;
      }
    };
  }, [householdEnabled, householdId, authUser?.uid]);

  const isFirestoreMode = householdEnabled && !!householdId;
  const isPersonalBackupMode = !householdEnabled && !!personalBackupUserId && personalBackupEnabled;

  const addPlant = async (plantData: PlantInput) => {
    try {
      const timestamp = new Date().toISOString();
      const newPlant: Plant = {
        ...plantData,
        id: Date.now().toString(),
        percent: 80,
        wateringLog: [],
        photoUri: plantData.photoUri?.trim() || undefined,
        photoStoragePath: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
        ownerId: currentUserIdRef.current || undefined,
        ownerName: userName || undefined,
      };

      if (isFirestoreMode) {
        await syncPlantToFirestore(newPlant, householdId!);
      } else {
        const updatedPlants = [...plants, newPlant];
        await persistPlantsLocally(updatedPlants);

        if (isPersonalBackupMode && personalBackupUserId) {
          void syncPlantToPersonalBackup(newPlant, personalBackupUserId).catch((error) => {
            console.error('Error backing up new plant:', error);
          });
        }
      }
    } catch (error) {
      console.error('Error adding plant:', error);
      throw error;
    }
  };

  const removePlant = async (id: string) => {
    try {
      const existing = plants.find((p) => p.id === id);

      if (isFirestoreMode) {
        await deletePlantFromFirestore(id, householdId!);
      } else {
        const updatedPlants = plants.filter((p) => p.id !== id);
        await persistPlantsLocally(updatedPlants);

        if (isPersonalBackupMode && personalBackupUserId) {
          void deletePlantFromPersonalBackup(id, personalBackupUserId).catch((error) => {
            console.error('Error removing plant from personal backup:', error);
          });
        }
      }

      await deleteStoredPlantPhoto(existing?.photoUri);
    } catch (error) {
      console.error('Error removing plant:', error);
      throw error;
    }
  };

  const updatePlant = async (id: string, plantData: PlantInput) => {
    try {
      const existing = plants.find((p) => p.id === id);
      if (!existing) {
        return;
      }

      const nextPlant = applyPlantInput(existing, plantData);

      if (isFirestoreMode) {
        await syncPlantToFirestore(nextPlant, householdId!);
      } else {
        const updatedPlants = plants.map((p) => (p.id === id ? nextPlant : p));
        await persistPlantsLocally(updatedPlants);

        if (isPersonalBackupMode && personalBackupUserId) {
          void syncPlantToPersonalBackup(nextPlant, personalBackupUserId).catch((error) => {
            console.error('Error backing up updated plant:', error);
          });
        }
      }

      if (existing.photoUri !== nextPlant.photoUri) {
        await deleteStoredPlantPhoto(existing.photoUri);
      }
    } catch (error) {
      console.error('Error updating plant:', error);
      throw error;
    }
  };

  const waterPlant = async (id: string, note?: string, wateredAt?: string) => {
    try {
      const entry: WateringEntry = {
        date: wateredAt ?? new Date().toISOString(),
        action: 'Watered',
        dotColor: '#4CD964',
      };
      if (note) entry.note = note;
      if (userName) entry.wateredBy = userName;

      if (isFirestoreMode) {
        await addWateringEntry(id, householdId!, entry);
      } else {
        const updatedAt = new Date().toISOString();
        const updatedPlants = plants.map((p) =>
          p.id === id
            ? {
                ...p,
                wateringLog: upsertWateringEntryForDay(p.wateringLog || [], entry),
                updatedAt,
              }
            : p
        );
        await persistPlantsLocally(updatedPlants);

        if (isPersonalBackupMode && personalBackupUserId) {
          const updatedPlant = updatedPlants.find((plant) => plant.id === id);
          if (updatedPlant) {
            void syncPlantToPersonalBackup(updatedPlant, personalBackupUserId).catch((error) => {
              console.error('Error backing up watered plant:', error);
            });
          }
        }
      }
    } catch (error) {
      console.error('Error watering plant:', error);
      throw error;
    }
  };

  const addPlantHistoryEntry = async (id: string, action: string, entryAt?: string, dotColor?: string) => {
    try {
      const normalizedAction = action.trim();
      if (!normalizedAction) {
        return;
      }

      const entry: WateringEntry = {
        date: entryAt ?? new Date().toISOString(),
        action: normalizedAction,
        dotColor,
      };
      if (userName) entry.wateredBy = userName;

      if (isFirestoreMode) {
        const existing = plants.find((p) => p.id === id);
        if (!existing) {
          return;
        }

        await syncPlantToFirestore(
          {
            ...existing,
            wateringLog: [...(existing.wateringLog || []), entry],
            updatedAt: new Date().toISOString(),
          },
          householdId!,
        );
      } else {
        const updatedAt = new Date().toISOString();
        const updatedPlants = plants.map((p) =>
          p.id === id
            ? {
                ...p,
                wateringLog: [...(p.wateringLog || []), entry],
                updatedAt,
              }
            : p
        );
        await persistPlantsLocally(updatedPlants);

        if (isPersonalBackupMode && personalBackupUserId) {
          const updatedPlant = updatedPlants.find((plant) => plant.id === id);
          if (updatedPlant) {
            void syncPlantToPersonalBackup(updatedPlant, personalBackupUserId).catch((error) => {
              console.error('Error backing up updated history:', error);
            });
          }
        }
      }
    } catch (error) {
      console.error('Error adding history entry:', error);
      throw error;
    }
  };

  const unwaterPlant = async (id: string, entryDate: string, removeAllForDay = false) => {
    try {
      if (isFirestoreMode) {
        await removeWateringEntry(id, householdId!, entryDate, removeAllForDay);
      } else {
        const updatedAt = new Date().toISOString();
        const updatedPlants = plants.map((p) =>
          p.id === id
            ? {
                ...p,
                wateringLog: removeAllForDay
                  ? removeWateringEntriesForDay(p.wateringLog || [], entryDate)
                  : (p.wateringLog || []).filter((e) => e.date !== entryDate),
                updatedAt,
              }
            : p
        );
        await persistPlantsLocally(updatedPlants);

        if (isPersonalBackupMode && personalBackupUserId) {
          const updatedPlant = updatedPlants.find((plant) => plant.id === id);
          if (updatedPlant) {
            void syncPlantToPersonalBackup(updatedPlant, personalBackupUserId).catch((error) => {
              console.error('Error backing up unwatered plant:', error);
            });
          }
        }
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
        const updatedAt = new Date().toISOString();
        const updatedPlants = plants.map((p) => (p.id === id ? { ...p, wateringLog: [], updatedAt } : p));
        await persistPlantsLocally(updatedPlants);

        if (isPersonalBackupMode && personalBackupUserId) {
          const updatedPlant = updatedPlants.find((plant) => plant.id === id);
          if (updatedPlant) {
            void syncPlantToPersonalBackup(updatedPlant, personalBackupUserId).catch((error) => {
              console.error('Error backing up cleared watering history:', error);
            });
          }
        }
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
      if (personalBackupUnsubscribeRef.current) {
        personalBackupUnsubscribeRef.current();
        personalBackupUnsubscribeRef.current = null;
      }

      setUserNameState(null);
      setHasCompletedOnboarding(false);
      setHasCompletedWalkthrough(false);
      setAppearanceState('system');
      setTimezoneState(DEVICE_TIMEZONE);
      setNotificationsEnabledState(true);
      setDefaultCheckIntervalState('1 week');
      setColorThemeState('default');
      setPersonalBackupEnabledState(false);
      setPersonalBackupAuthPendingState(false);
      setHouseholdEnabledState(false);
      setHouseholdIdState(null);
      setHouseholdCodeState(null);
      setHouseholdNameState(null);
      setHouseholdMembers([]);
      setHouseholdMemberColorState('#FF3B30');
      setHouseholdNotifications([]);
      plantsRef.current = [];
      setPlants([]);
      currentUserIdRef.current = null;
      await clearStoredPlantPhotos();
      await SecureStore.deleteItemAsync(USER_NAME_KEY);
      await SecureStore.deleteItemAsync(ONBOARDING_KEY);
      await SecureStore.deleteItemAsync(WALKTHROUGH_KEY);
      await SecureStore.deleteItemAsync(PLANTS_KEY);
      await SecureStore.deleteItemAsync(APPEARANCE_KEY);
      await SecureStore.deleteItemAsync(TIMEZONE_KEY);
      await SecureStore.deleteItemAsync(NOTIFICATIONS_KEY);
      await SecureStore.deleteItemAsync(DEFAULT_INTERVAL_KEY);
      await SecureStore.deleteItemAsync(PERSONAL_BACKUP_ENABLED_KEY);
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

  const setPersonalBackupAuthPending = (value: boolean) => {
    setPersonalBackupAuthPendingState(value);
  };

  const setPersonalBackupEnabled = async (value: boolean) => {
    setPersonalBackupEnabledState(value);
    await SecureStore.setItemAsync(PERSONAL_BACKUP_ENABLED_KEY, value.toString());

    if (!value) {
      setPersonalBackupAuthPendingState(false);

      if (personalBackupUserId) {
        await markPersonalBackupDisabled(personalBackupUserId).catch((error) => {
          console.error('Error disabling personal backup:', error);
        });
      }

      return;
    }

    if (personalBackupUserId && !householdEnabled) {
      await syncPersonalBackupNow();
    }
  };

  const setHouseholdAuthPending = (value: boolean) => {
    setHouseholdAuthPendingState(value);
  };

  const setHouseholdEnabled = async (value: boolean, options?: SetHouseholdEnabledOptions) => {
    setHouseholdEnabledState(value);
    await SecureStore.setItemAsync(HOUSEHOLD_ENABLED_KEY, value.toString());

    if (!value) {
      const currentHouseholdId = householdIdRef.current;

      if (firestoreUnsubscribeRef.current) {
        firestoreUnsubscribeRef.current();
        firestoreUnsubscribeRef.current = null;
      }
      if (!options?.preserveLocalPlants) {
        await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(plantsRef.current));
      }

      if (!currentHouseholdId) {
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

    householdIdRef.current = newId;
    setHouseholdIdState(newId);
    setHouseholdCodeState(code);
    setHouseholdNameState(name);
    await SecureStore.setItemAsync(HOUSEHOLD_ID_KEY, newId);
    await SecureStore.setItemAsync(HOUSEHOLD_CODE_KEY, code);
    await SecureStore.setItemAsync(HOUSEHOLD_NAME_KEY, name);
    await uploadLocalPlants(plants, newId);
  };

  const joinExistingHousehold = async (userId: string, displayName: string, code: string) => {
    if (!isFirebaseAvailable()) throw new Error('Household sharing requires a development build with Firebase.');
    currentUserIdRef.current = userId;
    const { householdId: joinedId, householdName: joinedName } = await joinHousehold(userId, displayName, code);

    householdIdRef.current = joinedId;
    setHouseholdIdState(joinedId);
    setHouseholdCodeState(code.toUpperCase());
    setHouseholdNameState(joinedName);
    await SecureStore.setItemAsync(HOUSEHOLD_ID_KEY, joinedId);
    await SecureStore.setItemAsync(HOUSEHOLD_CODE_KEY, code.toUpperCase());
    await SecureStore.setItemAsync(HOUSEHOLD_NAME_KEY, joinedName);
  };

  const leaveCurrentHousehold = async (userId: string) => {
    if (!householdId) return;

    const snapshotPlants = await snapshotPlantsFromFirestore(householdId);
  const localSnapshotPlants = await hydratePlants(snapshotPlants, { persistLocally: true });
  plantsRef.current = localSnapshotPlants;
  setPlants(localSnapshotPlants);

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

    householdIdRef.current = null;
    setHouseholdIdState(null);
    setHouseholdCodeState(null);
    setHouseholdNameState(null);
    setHouseholdAuthPendingState(false);
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
    addPlantHistoryEntry,
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
    personalBackupEnabled,
    personalBackupAuthPending,
    setPersonalBackupEnabled,
    setPersonalBackupAuthPending,
    syncPersonalBackupNow,
    householdEnabled,
    householdAuthPending,
    setHouseholdAuthPending,
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