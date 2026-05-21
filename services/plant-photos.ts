import * as FileSystem from 'expo-file-system/legacy';

type PlantPhotoRecord = {
  id: string;
  photoUri?: string;
};

const PLANT_PHOTOS_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}plant-photos/`
  : null;

function isRemotePhotoUri(photoUri: string): boolean {
  return /^https?:\/\//i.test(photoUri) || photoUri.startsWith('data:');
}

function getPhotoExtension(photoUri: string): string {
  const normalizedUri = photoUri.split('?')[0]?.split('#')[0] ?? photoUri;
  const extensionMatch = normalizedUri.match(/\.([a-zA-Z0-9]+)$/);
  return extensionMatch?.[1]?.toLowerCase() || 'jpg';
}

function buildStoredPhotoUri(photoUri: string): string {
  if (!PLANT_PHOTOS_DIR) {
    return photoUri;
  }

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${PLANT_PHOTOS_DIR}${uniqueSuffix}.${getPhotoExtension(photoUri)}`;
}

async function ensurePlantPhotoDirectory(): Promise<void> {
  if (!PLANT_PHOTOS_DIR) {
    return;
  }

  await FileSystem.makeDirectoryAsync(PLANT_PHOTOS_DIR, { intermediates: true });
}

export function isManagedPlantPhotoUri(photoUri?: string): boolean {
  return !!photoUri && !!PLANT_PHOTOS_DIR && photoUri.startsWith(PLANT_PHOTOS_DIR);
}

export async function persistPlantPhoto(photoUri: string): Promise<string> {
  const normalizedPhotoUri = photoUri.trim();

  if (!normalizedPhotoUri || !PLANT_PHOTOS_DIR || isRemotePhotoUri(normalizedPhotoUri)) {
    return normalizedPhotoUri;
  }

  if (isManagedPlantPhotoUri(normalizedPhotoUri)) {
    const info = await FileSystem.getInfoAsync(normalizedPhotoUri);
    if (info.exists) {
      return normalizedPhotoUri;
    }
  }

  await ensurePlantPhotoDirectory();

  const storedPhotoUri = buildStoredPhotoUri(normalizedPhotoUri);
  await FileSystem.copyAsync({ from: normalizedPhotoUri, to: storedPhotoUri });

  return storedPhotoUri;
}

export async function resolvePlantPhotoUri(photoUri?: string): Promise<string | undefined> {
  if (!photoUri) {
    return undefined;
  }

  const normalizedPhotoUri = photoUri.trim();
  if (!normalizedPhotoUri || !PLANT_PHOTOS_DIR || isRemotePhotoUri(normalizedPhotoUri)) {
    return normalizedPhotoUri || undefined;
  }

  if (isManagedPlantPhotoUri(normalizedPhotoUri)) {
    const managedInfo = await FileSystem.getInfoAsync(normalizedPhotoUri);
    return managedInfo.exists ? normalizedPhotoUri : undefined;
  }

  try {
    return await persistPlantPhoto(normalizedPhotoUri);
  } catch {
    try {
      const info = await FileSystem.getInfoAsync(normalizedPhotoUri);
      return info.exists ? normalizedPhotoUri : undefined;
    } catch {
      return undefined;
    }
  }
}

export async function reconcilePlantPhotoUris<T extends PlantPhotoRecord>(plants: T[]): Promise<{
  plants: T[];
  changedPlants: T[];
}> {
  const nextPlants: T[] = [];
  const changedPlants: T[] = [];

  for (const plant of plants) {
    const nextPhotoUri = await resolvePlantPhotoUri(plant.photoUri);

    if (nextPhotoUri !== plant.photoUri) {
      const nextPlant = {
        ...plant,
        photoUri: nextPhotoUri,
      };

      nextPlants.push(nextPlant);
      changedPlants.push(nextPlant);
      continue;
    }

    nextPlants.push(plant);
  }

  return {
    plants: nextPlants,
    changedPlants,
  };
}

export async function deleteStoredPlantPhoto(photoUri?: string): Promise<void> {
  if (!photoUri || !isManagedPlantPhotoUri(photoUri)) {
    return;
  }

  try {
    const info = await FileSystem.getInfoAsync(photoUri);
    if (info.exists) {
      await FileSystem.deleteAsync(photoUri, { idempotent: true });
    }
  } catch (error) {
    console.warn('Error deleting stored plant photo:', error);
  }
}

export async function clearStoredPlantPhotos(): Promise<void> {
  if (!PLANT_PHOTOS_DIR) {
    return;
  }

  try {
    await FileSystem.deleteAsync(PLANT_PHOTOS_DIR, { idempotent: true });
  } catch (error) {
    console.warn('Error clearing stored plant photos:', error);
  }
}