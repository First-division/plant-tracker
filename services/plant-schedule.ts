/** Shared local-calendar schedule calculations used by home, calendar, and detail screens. */

import { parseCheckIntervalDays } from './plant-intervals';
import { getMostRecentWateringEntryOnOrBefore, getWateringEntries } from './watering-log';

type WateringEntryLike = {
  date: string;
};

type PlantScheduleInput = {
  birthday: string;
  checkInterval: string;
  waterDay?: number;
  wateringLog?: WateringEntryLike[];
};

const DAY_IN_MS = 1000 * 60 * 60 * 24;

/** Return local midnight for the supplied date without mutating it. */
export function getStartOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Move a date forward to the preferred weekday, leaving it unchanged when unspecified. */
export function snapToWaterDay(date: Date, waterDay: number | undefined): Date {
  if (waterDay === undefined) return date;
  const current = date.getDay();
  const diff = (waterDay - current + 7) % 7;
  if (diff === 0) return date;

  const snapped = new Date(date);
  snapped.setDate(snapped.getDate() + diff);
  return snapped;
}

/**
 * Calculate the next due day from the latest watering on or before the reference time,
 * or from the plant birthday when its watering history is empty.
 */
export function getNextWaterDate(
  plant: PlantScheduleInput,
  referenceDate: Date = new Date(),
): Date | null {
  const intervalDays = parseCheckIntervalDays(plant.checkInterval);
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) {
    return null;
  }

  const referenceDayStart = getStartOfLocalDay(referenceDate);
  const latestWatering = getMostRecentWateringEntryOnOrBefore(getWateringEntries(plant.wateringLog || []), referenceDate);
  let nextWaterDate: Date;

  if (latestWatering) {
    nextWaterDate = new Date(latestWatering.date);
    if (isNaN(nextWaterDate.getTime())) {
      return null;
    }
    nextWaterDate.setDate(nextWaterDate.getDate() + intervalDays);
  } else {
    const birthday = new Date(plant.birthday);
    if (isNaN(birthday.getTime())) {
      return null;
    }

    birthday.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((referenceDayStart.getTime() - birthday.getTime()) / DAY_IN_MS);
    const nextMultiple = diffDays <= 0 ? 0 : Math.ceil(diffDays / intervalDays);

    nextWaterDate = new Date(birthday);
    nextWaterDate.setDate(nextWaterDate.getDate() + nextMultiple * intervalDays);
  }

  nextWaterDate.setHours(0, 0, 0, 0);

  if (intervalDays >= 7) {
    nextWaterDate = snapToWaterDay(nextWaterDate, plant.waterDay);
  }

  if (nextWaterDate.getTime() < referenceDayStart.getTime()) {
    return new Date(referenceDayStart);
  }

  return nextWaterDate;
}

/**
 * Determine whether the most recent scheduled due day is before today.
 * Plants without watering history are evaluated from their birthday schedule.
 */
export function isPlantOverdue(
  plant: PlantScheduleInput,
  referenceDate: Date = new Date(),
): boolean {
  const intervalDays = parseCheckIntervalDays(plant.checkInterval);
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) {
    return false;
  }

  const todayStart = getStartOfLocalDay(referenceDate);
  const latestWatering = getMostRecentWateringEntryOnOrBefore(
    getWateringEntries(plant.wateringLog || []),
    referenceDate,
  );
  let dueDate: Date;

  if (latestWatering) {
    dueDate = new Date(latestWatering.date);
    if (isNaN(dueDate.getTime())) {
      return false;
    }
    dueDate.setDate(dueDate.getDate() + intervalDays);
  } else {
    const birthday = new Date(plant.birthday);
    if (isNaN(birthday.getTime())) {
      return false;
    }

    birthday.setHours(0, 0, 0, 0);
    const daysSinceBirthday = Math.floor((todayStart.getTime() - birthday.getTime()) / DAY_IN_MS);
    if (daysSinceBirthday < 0) {
      return false;
    }

    const latestScheduledMultiple =
      daysSinceBirthday > 0 && daysSinceBirthday < intervalDays
        ? 1
        : Math.floor(daysSinceBirthday / intervalDays);

    dueDate = new Date(birthday);
    dueDate.setDate(dueDate.getDate() + latestScheduledMultiple * intervalDays);
  }

  dueDate.setHours(0, 0, 0, 0);
  if (intervalDays >= 7) {
    dueDate = snapToWaterDay(dueDate, plant.waterDay);
  }

  return dueDate.getTime() < todayStart.getTime();
}

/** Return whole local calendar days until the next due date, or null for invalid intervals. */
export function getDaysUntilNextWater(
  plant: PlantScheduleInput,
  referenceDate: Date = new Date(),
): number | null {
  const nextWaterDate = getNextWaterDate(plant, referenceDate);
  if (!nextWaterDate) {
    return null;
  }

  const referenceDayStart = getStartOfLocalDay(referenceDate);
  return Math.max(0, Math.round((nextWaterDate.getTime() - referenceDayStart.getTime()) / DAY_IN_MS));
}