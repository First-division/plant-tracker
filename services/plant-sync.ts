/**
 * Firestore persistence for shared household plants, including transactional care-history
 * changes and Firebase Storage upload/cleanup for plant photos.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import * as FileSystem from 'expo-file-system/legacy';
import { deleteObject, getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import { getDb, getStorageService } from './firebase';
import { Plant, WateringEntry } from '@/contexts/PlantContext';
import { removeWateringEntriesForDay, upsertWateringEntryForDay } from './watering-log';

function plantsCol(householdId: string) {
  return collection(getDb(), 'households', householdId, 'plants');
}

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

function getPhotoExtension(photoUri: string): string {
  const normalizedUri = photoUri.split('?')[0]?.split('#')[0] ?? photoUri;
  const extensionMatch = normalizedUri.match(/\.([a-zA-Z0-9]+)$/);
  return extensionMatch?.[1]?.toLowerCase() || 'jpg';
}

function getPhotoContentType(photoUri: string): string {
  switch (getPhotoExtension(photoUri)) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

function buildPlantPhotoStoragePath(householdId: string, plantId: string, photoUri: string): string {
  return `households/${householdId}/plants/${plantId}/photo.${getPhotoExtension(photoUri)}`;
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

async function deletePlantPhotoFromStorage(storagePath?: string | null): Promise<void> {
  if (!storagePath) {
    return;
  }

  try {
    await deleteObject(storageRef(getStorageService(), storagePath));
  } catch (error) {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined;

    if (errorCode !== 'storage/object-not-found') {
      console.warn('Error deleting plant photo from storage:', error);
    }
  }
}

async function uploadPlantPhotoToStorage(
  photoUri: string,
  plantId: string,
  householdId: string,
  previousStoragePath?: string,
): Promise<{ photoUri: string; photoStoragePath: string }> {
  const nextStoragePath = buildPlantPhotoStoragePath(householdId, plantId, photoUri);
  const encodedPhoto = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const photoRef = storageRef(getStorageService(), nextStoragePath);
  await uploadString(photoRef, encodedPhoto, 'base64', {
    contentType: getPhotoContentType(photoUri),
  });

  const downloadUrl = await getDownloadURL(photoRef);

  if (previousStoragePath && previousStoragePath !== nextStoragePath) {
    await deletePlantPhotoFromStorage(previousStoragePath);
  }

  return {
    photoUri: downloadUrl,
    photoStoragePath: nextStoragePath,
  };
}

async function preparePlantForFirestore(
  plant: Plant,
  householdId: string,
  existingPlant?: Plant,
): Promise<Plant> {
  const createdAt = plant.createdAt || existingPlant?.createdAt || getLegacyPlantTimestamp(plant.id);
  const updatedAt = plant.updatedAt || new Date().toISOString();
  const normalizedPhotoUri = plant.photoUri?.trim() || undefined;
  const previousStoragePath = existingPlant?.photoStoragePath;

  if (!normalizedPhotoUri) {
    await deletePlantPhotoFromStorage(previousStoragePath);

    return {
      ...plant,
      photoUri: undefined,
      photoStoragePath: undefined,
      createdAt,
      updatedAt,
    };
  }

  if (isRemotePhotoUri(normalizedPhotoUri)) {
    const shouldKeepStoragePath = existingPlant?.photoUri === normalizedPhotoUri
      ? previousStoragePath
      : undefined;

    if (!shouldKeepStoragePath) {
      await deletePlantPhotoFromStorage(previousStoragePath);
    }

    return {
      ...plant,
      photoUri: normalizedPhotoUri,
      photoStoragePath: shouldKeepStoragePath,
      createdAt,
      updatedAt,
    };
  }

  const uploadedPhoto = await uploadPlantPhotoToStorage(
    normalizedPhotoUri,
    plant.id,
    householdId,
    previousStoragePath,
  );

  return {
    ...plant,
    ...uploadedPhoto,
    createdAt,
    updatedAt,
  };
}

async function persistPlantRecord(
  plant: Plant,
  householdId: string,
  existingPlant?: Plant,
): Promise<Plant> {
  const nextPlant = await preparePlantForFirestore(plant, householdId, existingPlant);
  await setDoc(doc(plantsCol(householdId), plant.id), plantToFirestore(nextPlant), { merge: true });
  return nextPlant;
}

/** Upload local plants to a household without replacing records that already exist there. */
export async function uploadLocalPlants(plants: Plant[], householdId: string): Promise<void> {
  for (const plant of plants) {
    const docRef = doc(plantsCol(householdId), plant.id);
    const existing = await getDoc(docRef);
    if (!existing.exists()) {
      await persistPlantRecord(plant, householdId);
    }
  }
}

/** Subscribe to a household's plants and normalize Firestore records for app state. */
export function subscribeToPlants(
  householdId: string,
  callback: (plants: Plant[]) => void,
): () => void {
  return onSnapshot(
    plantsCol(householdId),
    (snapshot) => {
      const plants: Plant[] = snapshot.docs.map((d) => ({
        ...firestoreToPlant(d.data(), d.id),
        id: d.id,
      }));
      plants.sort((a, b) => parseInt(b.id) - parseInt(a.id));
      callback(plants);
    },
    (error) => {
      console.error('Firestore plants subscription error:', error);
    },
  );
}

/**
 * Save plant fields to the household record while transactionally preserving its latest
 * watering log, which may have changed since the screen loaded.
 */
export async function syncPlantToFirestore(plant: Plant, householdId: string): Promise<void> {
  const docRef = doc(plantsCol(householdId), plant.id);
  const existing = await getDoc(docRef);
  const existingPlant = existing.exists()
    ? { ...firestoreToPlant(existing.data(), plant.id), id: plant.id }
    : undefined;
  const nextPlant = await preparePlantForFirestore(plant, householdId, existingPlant);

  await runTransaction(getDb(), async (transaction) => {
    const latest = await transaction.get(docRef);
    const record = plantToFirestore(nextPlant);
    if (latest.exists()) {
      record.wateringLog = latest.data().wateringLog || [];
    }
    transaction.set(docRef, record, { merge: true });
  });
}

/** Delete a shared plant and its associated Firebase Storage photo, if present. */
export async function deletePlantFromFirestore(plantId: string, householdId: string): Promise<void> {
  const docRef = doc(plantsCol(householdId), plantId);
  const existing = await getDoc(docRef);

  if (existing.exists()) {
    await deletePlantPhotoFromStorage(existing.data().photoStoragePath);
  }

  await deleteDoc(docRef);
}

/** Transactionally add or replace a watering event for its local calendar day. */
export async function addWateringEntry(
  plantId: string,
  householdId: string,
  entry: WateringEntry,
): Promise<void> {
  await updatePlantWateringLog(plantId, householdId, (log) =>
    upsertWateringEntryForDay(log, entry),
  );
}

/** Transactionally append a non-deduplicated care-history event. */
export async function appendPlantHistoryEntry(
  plantId: string,
  householdId: string,
  entry: WateringEntry,
): Promise<void> {
  await updatePlantWateringLog(plantId, householdId, (log) => [...log, entry]);
}

/** Apply a log transformation against the latest Firestore record and fail if it is missing. */
async function updatePlantWateringLog(
  plantId: string,
  householdId: string,
  updateLog: (log: WateringEntry[]) => WateringEntry[],
): Promise<void> {
  const plantRef = doc(plantsCol(householdId), plantId);
  await runTransaction(getDb(), async (transaction) => {
    const plantDoc = await transaction.get(plantRef);
    if (!plantDoc.exists()) {
      throw new Error(`Cannot update watering history: plant "${plantId}" does not exist.`);
    }

    const log: WateringEntry[] = plantDoc.data().wateringLog || [];
    transaction.update(plantRef, {
      wateringLog: updateLog(log),
      updatedAt: new Date().toISOString(),
    });
  });
}

/** Transactionally remove one history entry or all watering events for its local day. */
export async function removeWateringEntry(
  plantId: string,
  householdId: string,
  entryDate: string,
  removeAllForDay = false,
): Promise<void> {
  await updatePlantWateringLog(plantId, householdId, (log) =>
    removeAllForDay
      ? removeWateringEntriesForDay(log, entryDate)
      : log.filter((entry) => entry.date !== entryDate),
  );
}

/** Transactionally clear a plant's complete watering and care-history log. */
export async function clearWateringLog(
  plantId: string,
  householdId: string,
): Promise<void> {
  await updatePlantWateringLog(plantId, householdId, () => []);
}

/** Fetch and normalize the current household plant collection as a one-time snapshot. */
export async function snapshotPlantsFromFirestore(householdId: string): Promise<Plant[]> {
  const snapshot = await getDocs(plantsCol(householdId));
  return snapshot.docs.map((d) => ({
    ...firestoreToPlant(d.data(), d.id),
    id: d.id,
  }));
}

/** Set ownership metadata on existing household plants that predate ownership tracking. */
export async function backfillPlantOwnership(
  householdId: string,
  ownerId: string,
  ownerName: string,
): Promise<void> {
  const snapshot = await getDocs(plantsCol(householdId));
  const batch = writeBatch(getDb());
  let count = 0;

  for (const d of snapshot.docs) {
    const data = d.data();
    if (!data.ownerId) {
      batch.update(d.ref, { ownerId, ownerName });
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`Backfilled ${count} plants with ownerId: ${ownerId}`);
  }
}

// --- Helpers ---

function plantToFirestore(plant: Plant): Record<string, any> {
  return {
    name: plant.name,
    percent: plant.percent,
    photoUri: plant.photoUri || null,
    photoStoragePath: plant.photoStoragePath || null,
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
    photoUri: data.photoUri || undefined,
    photoStoragePath: data.photoStoragePath || undefined,
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
