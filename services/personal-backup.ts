/** Per-user Firestore backup, including reduced-size plant photos and deletion tombstones. */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Plant, WateringEntry } from '@/contexts/PlantContext';
import { getPlantPhotoVersion, savePlantPhotoFromBase64 } from './plant-photos';
import { getDb } from './firebase';

function personalPlantsCol(userId: string) {
  return collection(getDb(), 'users', userId, 'plants');
}

function plantPhotosCol(userId: string) {
  return collection(getDb(), 'users', userId, 'plantPhotos');
}

function deletedPlantsCol(userId: string) {
  return collection(getDb(), 'users', userId, 'deletedPlants');
}

/** Records a plant deletion so stale copies are not restored during backup reconciliation. */
export type DeletedPlantTombstone = {
  plantId: string;
  deletedAt: string;
};

/** A consistent backup view of plants and deleted-plant markers. */
export type PersonalBackupSnapshot = {
  plants: Plant[];
  deletedPlantTombstones: DeletedPlantTombstone[];
};

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

function normalizeFirestoreTimestamp(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  return fallback;
}

const BACKUP_PHOTO_MAX_BASE64_CHARS = 700_000;
const BACKUP_PHOTO_ATTEMPTS = [
  { size: 640, quality: 0.6 },
  { size: 480, quality: 0.5 },
  { size: 320, quality: 0.4 },
];

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

/** Shrink a local photo to a small JPEG (base64) that fits comfortably in a Firestore document. */
async function shrinkPhotoForBackup(photoUri: string): Promise<string | null> {
  let manipulator: typeof import('expo-image-manipulator');
  try {
    // Loaded lazily so builds without the native module keep working (photos just are not backed up).
    manipulator = require('expo-image-manipulator');
  } catch (error) {
    console.warn('Image manipulator unavailable; skipping photo backup:', error);
    return null;
  }

  const info = await FileSystem.getInfoAsync(photoUri);
  if (!info.exists) {
    return null;
  }

  const { width, height } = await getImageSize(photoUri);
  const longestSide = Math.max(width, height);

  for (const attempt of BACKUP_PHOTO_ATTEMPTS) {
    const context = manipulator.ImageManipulator.manipulate(photoUri);
    if (longestSide > attempt.size) {
      context.resize(width >= height ? { width: attempt.size } : { height: attempt.size });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: attempt.quality,
      format: manipulator.SaveFormat.JPEG,
      base64: true,
    });

    if (saved.base64 && saved.base64.length <= BACKUP_PHOTO_MAX_BASE64_CHARS) {
      return saved.base64;
    }
  }

  return null;
}

async function deleteBackupPhoto(userId: string, plantId: string): Promise<void> {
  try {
    await deleteDoc(doc(plantPhotosCol(userId), plantId));
  } catch (error) {
    console.warn('Error deleting personal backup photo:', error);
  }
}

/**
 * Download a plant's backed-up photo and save it on this device. Resolves to the local file
 * URI, or undefined when the cloud copy is missing or does not match the expected version.
 */
export async function restorePlantPhotoFromBackup(
  userId: string,
  plantId: string,
  expectedVersion: string,
): Promise<string | undefined> {
  const photoSnapshot = await getDoc(doc(plantPhotosCol(userId), plantId));
  if (!photoSnapshot.exists()) {
    return undefined;
  }

  const data = photoSnapshot.data();
  if (data.version !== expectedVersion || typeof data.data !== 'string' || !data.data) {
    return undefined;
  }

  return savePlantPhotoFromBase64(expectedVersion, data.data);
}

async function preparePlantForBackup(
  plant: Plant,
  userId: string,
  existingPlant?: Plant,
): Promise<Plant> {
  const createdAt = plant.createdAt || existingPlant?.createdAt || getLegacyPlantTimestamp(plant.id);
  const updatedAt = plant.updatedAt || new Date().toISOString();
  const localPhotoUri = plant.photoUri?.trim() || undefined;
  const cloudVersion = existingPlant?.photoVersion;
  let photoVersion = cloudVersion;

  if (!localPhotoUri) {
    // Only an explicit removal (no photo and no known cloud version) deletes the cloud copy;
    // a plant whose photo has simply not been restored yet keeps its backed-up photo.
    if (!plant.photoVersion) {
      if (cloudVersion) {
        await deleteBackupPhoto(userId, plant.id);
      }
      photoVersion = undefined;
    } else {
      photoVersion = plant.photoVersion;
    }
  } else {
    const localVersion = getPlantPhotoVersion(localPhotoUri);

    if (localVersion && localVersion !== cloudVersion) {
      try {
        const base64 = await shrinkPhotoForBackup(localPhotoUri);
        if (base64) {
          // The photo document is written first so a plant never points at a missing photo.
          await setDoc(doc(plantPhotosCol(userId), plant.id), {
            version: localVersion,
            data: base64,
            updatedAt: new Date().toISOString(),
          });
          photoVersion = localVersion;
        } else {
          console.warn('Plant photo could not be prepared for backup; backing up without it.');
        }
      } catch (error) {
        console.warn('Plant photo upload failed; backing up without it:', error);
      }
    }
  }

  return {
    ...plant,
    photoUri: undefined,
    photoStoragePath: undefined,
    photoVersion,
    createdAt,
    updatedAt,
  };
}

function plantToFirestore(plant: Plant): Record<string, any> {
  return {
    name: plant.name,
    percent: plant.percent,
    photoUri: null,
    photoStoragePath: null,
    photoVersion: plant.photoVersion || null,
    location: plant.location,
    checkInterval: plant.checkInterval,
    birthday: plant.birthday,
    gender: plant.gender,
    wateringLog: plant.wateringLog || [],
    createdAt: plant.createdAt,
    updatedAt: plant.updatedAt,
    ownerId: plant.ownerId || null,
    ownerName: plant.ownerName || null,
    waterDay: plant.waterDay ?? null,
    reminderTime: plant.reminderTime || null,
  };
}

function firestoreToPlant(data: Record<string, any>, plantId: string): Omit<Plant, 'id'> {
  const createdAtFallback = getLegacyPlantTimestamp(plantId);
  const createdAt = normalizeFirestoreTimestamp(data.createdAt, createdAtFallback);

  return {
    name: data.name || '',
    percent: data.percent ?? 0,
    photoUri: undefined,
    photoStoragePath: undefined,
    photoVersion: typeof data.photoVersion === 'string' && data.photoVersion ? data.photoVersion : undefined,
    location: data.location || '',
    checkInterval: data.checkInterval || '1 week',
    birthday: data.birthday || '',
    gender: data.gender === 'Unknown' ? 'They/them' : data.gender || 'They/them',
    wateringLog: (data.wateringLog || []) as WateringEntry[],
    createdAt,
    updatedAt: normalizeFirestoreTimestamp(data.updatedAt, createdAt),
    ownerId: data.ownerId || undefined,
    ownerName: data.ownerName || undefined,
    waterDay: data.waterDay ?? undefined,
    reminderTime: data.reminderTime || undefined,
  };
}

function firestoreToDeletedPlantTombstone(
  data: Record<string, any>,
  plantId: string,
): DeletedPlantTombstone {
  return {
    plantId,
    deletedAt: normalizeFirestoreTimestamp(data.deletedAt, new Date().toISOString()),
  };
}

async function persistPlantRecord(plant: Plant, userId: string, existingPlant?: Plant): Promise<Plant> {
  const nextPlant = await preparePlantForBackup(plant, userId, existingPlant);
  await setDoc(doc(personalPlantsCol(userId), plant.id), plantToFirestore(nextPlant), { merge: true });
  await deleteDoc(doc(deletedPlantsCol(userId), plant.id));

  await setDoc(doc(getDb(), 'users', userId), {
    personalBackupEnabled: true,
    lastPersonalBackupAt: new Date().toISOString(),
  }, { merge: true });

  return nextPlant;
}

/**
 * Subscribe to both backup plants and deletion tombstones. The callback fires only after
 * the initial snapshot for both collections has arrived; return value stops both listeners.
 */
export function subscribeToPersonalBackup(
  userId: string,
  callback: (snapshot: PersonalBackupSnapshot) => void,
): () => void {
  let latestPlants: Plant[] = [];
  let latestDeletedPlantTombstones: DeletedPlantTombstone[] = [];
  let plantsReady = false;
  let deletedPlantsReady = false;

  const emitSnapshot = () => {
    if (!plantsReady || !deletedPlantsReady) {
      return;
    }

    callback({
      plants: latestPlants,
      deletedPlantTombstones: latestDeletedPlantTombstones,
    });
  };

  const unsubscribePlants = onSnapshot(
    personalPlantsCol(userId),
    (snapshot) => {
      latestPlants = snapshot.docs.map((d) => ({
        ...firestoreToPlant(d.data(), d.id),
        id: d.id,
      }));
      latestPlants.sort((a, b) => Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10));
      plantsReady = true;
      emitSnapshot();
    },
    (error) => {
      console.error('Personal backup subscription error:', error);
    },
  );

  const unsubscribeDeletedPlants = onSnapshot(
    deletedPlantsCol(userId),
    (snapshot) => {
      latestDeletedPlantTombstones = snapshot.docs.map((deletedPlantDoc) =>
        firestoreToDeletedPlantTombstone(deletedPlantDoc.data(), deletedPlantDoc.id),
      );
      deletedPlantsReady = true;
      emitSnapshot();
    },
    (error) => {
      console.error('Personal backup tombstone subscription error:', error);
    },
  );

  return () => {
    unsubscribePlants();
    unsubscribeDeletedPlants();
  };
}

/** Upload or update one user's cloud copy of a plant and its photo when needed. */
export async function syncPlantToPersonalBackup(plant: Plant, userId: string): Promise<Plant> {
  const docRef = doc(personalPlantsCol(userId), plant.id);
  const existing = await getDoc(docRef);
  const existingPlant = existing.exists()
    ? { ...firestoreToPlant(existing.data(), plant.id), id: plant.id }
    : undefined;

  return persistPlantRecord(plant, userId, existingPlant);
}

/** Delete a backup plant and write a tombstone to prevent stale data from reappearing. */
export async function deletePlantFromPersonalBackup(plantId: string, userId: string): Promise<void> {
  const docRef = doc(personalPlantsCol(userId), plantId);
  const existing = await getDoc(docRef);
  const deletedAt = new Date().toISOString();

  if (existing.exists() && existing.data().photoVersion) {
    await deleteBackupPhoto(userId, plantId);
  }

  await setDoc(doc(deletedPlantsCol(userId), plantId), {
    deletedAt,
  }, { merge: true });

  await deleteDoc(docRef);

  await setDoc(doc(getDb(), 'users', userId), {
    lastPersonalBackupAt: deletedAt,
  }, { merge: true });
}

/** Fetch backup plants and tombstones once for merge or recovery operations. */
export async function snapshotPersonalBackup(userId: string): Promise<PersonalBackupSnapshot> {
  const [plantsSnapshot, deletedPlantsSnapshot] = await Promise.all([
    getDocs(personalPlantsCol(userId)),
    getDocs(deletedPlantsCol(userId)),
  ]);

  const plants = plantsSnapshot.docs.map((plantDoc) => ({
    ...firestoreToPlant(plantDoc.data(), plantDoc.id),
    id: plantDoc.id,
  }));
  plants.sort((a, b) => Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10));

  return {
    plants,
    deletedPlantTombstones: deletedPlantsSnapshot.docs.map((deletedPlantDoc) =>
      firestoreToDeletedPlantTombstone(deletedPlantDoc.data(), deletedPlantDoc.id),
    ),
  };
}

/** Erase everything stored for this user: plants, photos, deletion records and the profile. */
export async function deleteAllPersonalBackupData(userId: string): Promise<void> {
  const collections = [
    personalPlantsCol(userId),
    plantPhotosCol(userId),
    deletedPlantsCol(userId),
    collection(getDb(), 'users', userId, 'private'),
  ];

  for (const col of collections) {
    const snapshot = await getDocs(col);
    for (let i = 0; i < snapshot.docs.length; i += 400) {
      const batch = writeBatch(getDb());
      snapshot.docs.slice(i, i + 400).forEach((docSnapshot) => batch.delete(docSnapshot.ref));
      await batch.commit();
    }
  }

  await deleteDoc(doc(getDb(), 'users', userId));
}

export type PersonalBackupSettings = {
  userName?: string;
  timezone?: string;
  defaultCheckInterval?: string;
  colorTheme?: string;
  appearance?: string;
};

/** Save the user's name and preferences alongside the plants. */
export async function savePersonalBackupSettings(
  userId: string,
  settings: PersonalBackupSettings,
): Promise<void> {
  await setDoc(doc(getDb(), 'users', userId, 'private', 'settings'), settings);
}

/** Read the backed-up name and preferences, if any. */
export async function fetchPersonalBackupSettings(userId: string): Promise<PersonalBackupSettings | null> {
  const settingsSnapshot = await getDoc(doc(getDb(), 'users', userId, 'private', 'settings'));
  return settingsSnapshot.exists() ? (settingsSnapshot.data() as PersonalBackupSettings) : null;
}

/** Record that this user has disabled personal cloud backup. */
export async function markPersonalBackupDisabled(userId: string): Promise<void> {
  await setDoc(doc(getDb(), 'users', userId), {
    personalBackupEnabled: false,
    lastPersonalBackupAt: new Date().toISOString(),
  }, { merge: true });
}