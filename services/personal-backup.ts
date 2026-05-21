import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import * as FileSystem from 'expo-file-system/legacy';
import { deleteObject, getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import { Plant, WateringEntry } from '@/contexts/PlantContext';
import { getDb, getStorageService } from './firebase';

function personalPlantsCol(userId: string) {
  return collection(getDb(), 'users', userId, 'plants');
}

function deletedPlantsCol(userId: string) {
  return collection(getDb(), 'users', userId, 'deletedPlants');
}

export type DeletedPlantTombstone = {
  plantId: string;
  deletedAt: string;
};

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

function buildPlantPhotoStoragePath(userId: string, plantId: string, photoUri: string): string {
  return `users/${userId}/plants/${plantId}/photo.${getPhotoExtension(photoUri)}`;
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
      console.warn('Error deleting personal backup photo from storage:', error);
    }
  }
}

async function uploadPlantPhotoToStorage(
  photoUri: string,
  plantId: string,
  userId: string,
  previousStoragePath?: string,
): Promise<{ photoUri: string; photoStoragePath: string }> {
  const nextStoragePath = buildPlantPhotoStoragePath(userId, plantId, photoUri);
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

async function preparePlantForBackup(
  plant: Plant,
  userId: string,
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
    userId,
    previousStoragePath,
  );

  return {
    ...plant,
    ...uploadedPhoto,
    createdAt,
    updatedAt,
  };
}

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
    gender: data.gender || 'Unknown',
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

export async function syncPlantToPersonalBackup(plant: Plant, userId: string): Promise<Plant> {
  const docRef = doc(personalPlantsCol(userId), plant.id);
  const existing = await getDoc(docRef);
  const existingPlant = existing.exists()
    ? { ...firestoreToPlant(existing.data(), plant.id), id: plant.id }
    : undefined;

  return persistPlantRecord(plant, userId, existingPlant);
}

export async function deletePlantFromPersonalBackup(plantId: string, userId: string): Promise<void> {
  const docRef = doc(personalPlantsCol(userId), plantId);
  const existing = await getDoc(docRef);
  const deletedAt = new Date().toISOString();

  if (existing.exists()) {
    await deletePlantPhotoFromStorage(existing.data().photoStoragePath);
  }

  await setDoc(doc(deletedPlantsCol(userId), plantId), {
    deletedAt,
  }, { merge: true });

  await deleteDoc(docRef);

  await setDoc(doc(getDb(), 'users', userId), {
    lastPersonalBackupAt: deletedAt,
  }, { merge: true });
}

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

export async function markPersonalBackupDisabled(userId: string): Promise<void> {
  await setDoc(doc(getDb(), 'users', userId), {
    personalBackupEnabled: false,
    lastPersonalBackupAt: new Date().toISOString(),
  }, { merge: true });
}