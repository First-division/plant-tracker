/** Pure helpers for ordering watering history and comparing entries by local calendar day. */

type WateringEntryLike = {
  date: string;
  action?: string;
};

function toValidDate(value: string): Date | null {
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

/** Compare two dates by their device-local year, month, and day. */
export function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/** Return a copy sorted chronologically, placing invalid dates before valid dates. */
export function getSortedWateringLog<T extends WateringEntryLike>(entries: T[] = []): T[] {
  return [...entries].sort((left, right) => {
    const leftDate = toValidDate(left.date);
    const rightDate = toValidDate(right.date);
    if (!leftDate && !rightDate) return 0;
    if (!leftDate) return -1;
    if (!rightDate) return 1;
    return leftDate.getTime() - rightDate.getTime();
  });
}

/** Treat legacy entries without an action and explicit Water/Watered entries as watering. */
export function isWateringEntry<T extends WateringEntryLike>(entry: T): boolean {
  const normalizedAction = entry.action?.trim().toLowerCase();
  return !normalizedAction || normalizedAction === 'water' || normalizedAction === 'watered';
}

/** Filter a mixed care-history list down to watering events. */
export function getWateringEntries<T extends WateringEntryLike>(entries: T[] = []): T[] {
  return entries.filter((entry) => isWateringEntry(entry));
}

/** Return the latest valid-order candidate, or null when the list is empty. */
export function getMostRecentWateringEntry<T extends WateringEntryLike>(entries: T[] = []): T | null {
  const sorted = getSortedWateringLog(entries);
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

/** Return the latest watering entry at or before a specific instant. */
export function getMostRecentWateringEntryOnOrBefore<T extends WateringEntryLike>(
  entries: T[] = [],
  referenceDate: Date,
): T | null {
  const candidates = getSortedWateringLog(entries).filter((entry) => {
    const entryDate = toValidDate(entry.date);
    return entryDate ? entryDate.getTime() <= referenceDate.getTime() : false;
  });

  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

/** Return the latest watering entry whose timestamp falls on a local calendar day. */
export function getMostRecentWateringEntryForDay<T extends WateringEntryLike>(
  entries: T[] = [],
  targetDate: Date,
): T | null {
  const candidates = getSortedWateringLog(entries).filter((entry) => {
    const entryDate = toValidDate(entry.date);
    return entryDate ? isSameLocalDay(entryDate, targetDate) : false;
  });

  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

/**
 * Replace watering events for the entry's local day while retaining non-watering
 * history events from that same day.
 */
export function upsertWateringEntryForDay<T extends WateringEntryLike>(entries: T[] = [], entry: T): T[] {
  const entryDate = toValidDate(entry.date);
  if (!entryDate) return getSortedWateringLog(entries);

  const withoutSameDay = entries.filter((existingEntry) => {
    const existingDate = toValidDate(existingEntry.date);
    if (!existingDate) return true;
    if (!isSameLocalDay(existingDate, entryDate)) return true;
    return !isWateringEntry(existingEntry);
  });

  return getSortedWateringLog([...withoutSameDay, entry]);
}

/** Remove watering events for one local day without deleting other care-history actions. */
export function removeWateringEntriesForDay<T extends WateringEntryLike>(entries: T[] = [], targetDate: string): T[] {
  const target = toValidDate(targetDate);
  if (!target) return getSortedWateringLog(entries);

  return getSortedWateringLog(
    entries.filter((entry) => {
      const entryDate = toValidDate(entry.date);
      if (!entryDate) return true;
      if (!isSameLocalDay(entryDate, target)) return true;
      return !isWateringEntry(entry);
    }),
  );
}