import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { getDb } from './firebase';

export type HouseholdNotification = {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  plantId: string;
  plantName: string;
  type: 'water_reminder';
  read: boolean;
  createdAt: string; // ISO string
};

function notificationsCol(householdId: string) {
  return collection(getDb(), 'households', householdId, 'notifications');
}

export async function sendWaterReminder(
  fromUserId: string,
  fromName: string,
  toUserId: string,
  plantId: string,
  plantName: string,
  householdId: string,
): Promise<void> {
  const notifRef = doc(notificationsCol(householdId));
  await setDoc(notifRef, {
    fromUserId,
    fromName,
    toUserId,
    plantId,
    plantName,
    type: 'water_reminder',
    read: false,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToNotifications(
  userId: string,
  householdId: string,
  callback: (notifications: HouseholdNotification[]) => void,
): () => void {
  const q = query(
    notificationsCol(householdId),
    where('toUserId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const notifications: HouseholdNotification[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fromUserId: data.fromUserId || '',
          fromName: data.fromName || 'Someone',
          toUserId: data.toUserId || '',
          plantId: data.plantId || '',
          plantName: data.plantName || 'a plant',
          type: data.type || 'water_reminder',
          read: data.read ?? false,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        };
      });
      callback(notifications);
    },
    (error) => {
      console.error('Household notifications subscription error:', error);
    },
  );
}

export async function markNotificationRead(
  notificationId: string,
  householdId: string,
): Promise<void> {
  await updateDoc(doc(notificationsCol(householdId), notificationId), { read: true });
}

export async function getUnreadNotifications(
  userId: string,
  householdId: string,
): Promise<HouseholdNotification[]> {
  const q = query(
    notificationsCol(householdId),
    where('toUserId', '==', userId),
    where('read', '==', false),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      fromUserId: data.fromUserId || '',
      fromName: data.fromName || 'Someone',
      toUserId: data.toUserId || '',
      plantId: data.plantId || '',
      plantName: data.plantName || 'a plant',
      type: data.type || 'water_reminder',
      read: false,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    };
  });
}
