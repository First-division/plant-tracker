import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { getDb } from './firebase';
import { Plant, WateringEntry } from '@/app/context/PlantContext';

function plantsCol(householdId: string) {
  return collection(getDb(), 'households', householdId, 'plants');
}

export async function uploadLocalPlants(plants: Plant[], householdId: string): Promise<void> {
  const batch = writeBatch(getDb());

  for (const plant of plants) {
    const docRef = doc(plantsCol(householdId), plant.id);
    const existing = await getDoc(docRef);
    if (!existing.exists()) {
      batch.set(docRef, plantToFirestore(plant));
    }
  }

  await batch.commit();
}

export function subscribeToPlants(
  householdId: string,
  callback: (plants: Plant[]) => void,
): () => void {
  return onSnapshot(
    plantsCol(householdId),
    (snapshot) => {
      const plants: Plant[] = snapshot.docs.map((d) => ({
        ...firestoreToPlant(d.data()),
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

export async function syncPlantToFirestore(plant: Plant, householdId: string): Promise<void> {
  await setDoc(doc(plantsCol(householdId), plant.id), plantToFirestore(plant), { merge: true });
}

export async function deletePlantFromFirestore(plantId: string, householdId: string): Promise<void> {
  await deleteDoc(doc(plantsCol(householdId), plantId));
}

export async function addWateringEntry(
  plantId: string,
  householdId: string,
  entry: WateringEntry,
): Promise<void> {
  await updateDoc(doc(plantsCol(householdId), plantId), {
    wateringLog: arrayUnion(entry),
  });
}

export async function removeWateringEntry(
  plantId: string,
  householdId: string,
  entryDate: string,
): Promise<void> {
  const plantDoc = await getDoc(doc(plantsCol(householdId), plantId));
  if (plantDoc.exists()) {
    const data = plantDoc.data();
    const log: WateringEntry[] = data.wateringLog || [];
    const entryToRemove = log.find((e) => e.date === entryDate);
    if (entryToRemove) {
      await updateDoc(doc(plantsCol(householdId), plantId), {
        wateringLog: arrayRemove(entryToRemove),
      });
    }
  }
}

export async function clearWateringLog(
  plantId: string,
  householdId: string,
): Promise<void> {
  await updateDoc(doc(plantsCol(householdId), plantId), {
    wateringLog: [],
  });
}

export async function snapshotPlantsFromFirestore(householdId: string): Promise<Plant[]> {
  const snapshot = await getDocs(plantsCol(householdId));
  return snapshot.docs.map((d) => ({
    ...firestoreToPlant(d.data()),
    id: d.id,
  }));
}

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
    location: plant.location,
    checkInterval: plant.checkInterval,
    birthday: plant.birthday,
    gender: plant.gender,
    wateringLog: plant.wateringLog || [],
    ownerId: plant.ownerId || null,
    ownerName: plant.ownerName || null,
    waterDay: plant.waterDay ?? null,
    reminderTime: plant.reminderTime || null,
  };
}

function firestoreToPlant(data: Record<string, any>): Omit<Plant, 'id'> {
  return {
    name: data.name || '',
    percent: data.percent ?? 0,
    photoUri: data.photoUri || undefined,
    location: data.location || '',
    checkInterval: data.checkInterval || '1 week',
    birthday: data.birthday || '',
    gender: data.gender || 'Unknown',
    wateringLog: (data.wateringLog || []) as WateringEntry[],
    ownerId: data.ownerId || undefined,
    ownerName: data.ownerName || undefined,
    waterDay: data.waterDay ?? undefined,
    reminderTime: data.reminderTime || undefined,
  };
}
