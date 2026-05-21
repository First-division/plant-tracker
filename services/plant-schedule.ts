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

export function getStartOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function snapToWaterDay(date: Date, waterDay: number | undefined): Date {
  if (waterDay === undefined) return date;
  const current = date.getDay();
  const diff = (waterDay - current + 7) % 7;
  if (diff === 0) return date;

  const snapped = new Date(date);
  snapped.setDate(snapped.getDate() + diff);
  return snapped;
}

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