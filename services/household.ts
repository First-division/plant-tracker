import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  runTransaction,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { getDb } from './firebase';
import { MEMBER_COLORS } from '@/constants/theme';

export type HouseholdMember = {
  uid: string;
  displayName: string;
  joinedAt: string;
  color?: string;
};

export type Household = {
  id: string;
  name: string;
  code: string;
  createdBy: string;
  members: string[];
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I for readability
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function householdsCol() { return collection(getDb(), 'households'); }
function usersCol() { return collection(getDb(), 'users'); }

export async function createHousehold(
  userId: string,
  displayName: string,
  householdName: string,
): Promise<{ householdId: string; code: string }> {
  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    const q = query(householdsCol(), where('code', '==', code), limit(1));
    const existing = await getDocs(q);
    if (existing.empty) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) throw new Error('Failed to generate unique household code');

  const householdRef = doc(householdsCol());
  const householdId = householdRef.id;

  await runTransaction(getDb(), async (tx) => {
    tx.set(householdRef, {
      name: householdName,
      code,
      createdBy: userId,
      members: [userId],
      createdAt: serverTimestamp(),
    });

    tx.set(doc(usersCol(), userId), {
      displayName,
      householdId,
      color: MEMBER_COLORS[0],
      joinedAt: serverTimestamp(),
    }, { merge: true });
  });

  return { householdId, code };
}

export async function joinHousehold(
  userId: string,
  displayName: string,
  code: string,
): Promise<{ householdId: string; householdName: string }> {
  const q = query(householdsCol(), where('code', '==', code.toUpperCase()), limit(1));
  const snapshot = await getDocs(q);
  if (snapshot.empty) throw new Error('No household found with that code');

  const householdSnap = snapshot.docs[0];
  const householdId = householdSnap.id;
  const data = householdSnap.data();

  if ((data.members || []).length >= 6) {
    throw new Error('This household is full (max 6 members)');
  }

  if ((data.members || []).includes(userId)) {
    return { householdId, householdName: data.name };
  }

  const memberIndex = (data.members || []).length;

  await runTransaction(getDb(), async (tx) => {
    tx.update(doc(householdsCol(), householdId), {
      members: arrayUnion(userId),
    });

    tx.set(doc(usersCol(), userId), {
      displayName,
      householdId,
      color: MEMBER_COLORS[memberIndex % MEMBER_COLORS.length],
      joinedAt: serverTimestamp(),
    }, { merge: true });
  });

  return { householdId, householdName: data.name };
}

export async function leaveHousehold(userId: string, householdId: string): Promise<void> {
  const householdRef = doc(householdsCol(), householdId);
  const snapshot = await getDoc(householdRef);
  if (!snapshot.exists()) return;

  const data = snapshot.data()!;
  const members: string[] = data.members || [];
  const remaining = members.filter((m) => m !== userId);

  if (remaining.length === 0) {
    const plantsCol = collection(householdRef, 'plants');
    const plantsSnapshot = await getDocs(plantsCol);
    const batch = writeBatch(getDb());
    plantsSnapshot.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(householdRef);
    batch.update(doc(usersCol(), userId), {
      householdId: deleteField(),
    });
    await batch.commit();
  } else {
    const batch = writeBatch(getDb());
    batch.update(householdRef, {
      members: arrayRemove(userId),
    });
    batch.update(doc(usersCol(), userId), {
      householdId: deleteField(),
    });
    await batch.commit();
  }
}

export async function getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  const householdSnap = await getDoc(doc(householdsCol(), householdId));
  if (!householdSnap.exists()) return [];

  const data = householdSnap.data()!;
  const memberIds: string[] = data.members || [];

  const members: HouseholdMember[] = [];
  for (const uid of memberIds) {
    const userSnap = await getDoc(doc(usersCol(), uid));
    const userData = userSnap.data();
    members.push({
      uid,
      displayName: userData?.displayName || 'Unknown',
      joinedAt: userData?.joinedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      color: userData?.color || MEMBER_COLORS[members.length % MEMBER_COLORS.length],
    });
  }

  return members;
}

export async function updateMemberColor(userId: string, color: string): Promise<void> {
  await setDoc(doc(usersCol(), userId), { color }, { merge: true });
}

export async function getHouseholdByCode(code: string): Promise<Household | null> {
  const q = query(householdsCol(), where('code', '==', code.toUpperCase()), limit(1));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() } as Household;
}

/**
 * Real-time listener for household member changes (including color updates).
 * Queries user docs by householdId so any member's profile change triggers a callback.
 */
export function subscribeToHouseholdMembers(
  householdId: string,
  callback: (members: HouseholdMember[]) => void,
): () => void {
  const q = query(usersCol(), where('householdId', '==', householdId));
  return onSnapshot(q, (snapshot) => {
    const members: HouseholdMember[] = snapshot.docs.map((d, index) => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: data.displayName || 'Unknown',
        joinedAt: data.joinedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        color: data.color || MEMBER_COLORS[index % MEMBER_COLORS.length],
      };
    });
    callback(members);
  });
}
