/** Keeps local watering reminders and incoming household reminder alerts in sync with app state. */

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { usePlants, Plant } from '@/contexts/PlantContext';
import { parseCheckIntervalDays } from '@/services/plant-intervals';
import { getMostRecentWateringEntryOnOrBefore, getWateringEntries } from '@/services/watering-log';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Snap a date forward to the nearest occurrence of the preferred day of the week (0=Sun..6=Sat)
function snapToWaterDay(date: Date, waterDay: number | undefined): Date {
  if (waterDay === undefined) return date;
  const current = date.getDay();
  const diff = (waterDay - current + 7) % 7;
  if (diff === 0) return date; // already on the preferred day
  const snapped = new Date(date);
  snapped.setDate(snapped.getDate() + diff);
  return snapped;
}

function getNextWaterDate(plant: Plant): Date {
  const intervalDays = parseCheckIntervalDays(plant.checkInterval);
  const now = new Date();
  const log = plant.wateringLog || [];
  let next: Date;

  const latestWatering = getMostRecentWateringEntryOnOrBefore(getWateringEntries(log), now);

  if (latestWatering) {
    const lastWatered = new Date(latestWatering.date);
    next = new Date(lastWatered);
    next.setDate(next.getDate() + intervalDays);
    if (next < now) next = new Date(now);
  } else {
    const start = new Date(plant.birthday);
    if (isNaN(start.getTime())) return now;
    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const nextMultiple = diffDays <= 0 ? 0 : Math.ceil(diffDays / intervalDays);
    next = new Date(start);
    next.setDate(next.getDate() + nextMultiple * intervalDays);
    if (next < now) next = new Date(now);
  }

  // Snap to preferred day of the week (only for intervals >= 7 days)
  if (intervalDays >= 7) {
    next = snapToWaterDay(next, plant.waterDay);
  }

  return next;
}

/** Ask for notification permission when needed and configure Android's reminder channel. */
export async function registerForPushNotifications(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('watering', {
      name: 'Watering Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  return true;
}

const LOCATION_HINTS: { match: RegExp; hint: string }[] = [
  { match: /kitchen/i, hint: 'Give it a quick drink while you’re in the kitchen.' },
  { match: /bath|shower|powder|toilet|\bwc\b/i, hint: 'Give it a drink next time you’re freshening up.' },
  { match: /bed|nursery|guest/i, hint: 'Give it a drink next time you’re in the bedroom.' },
  { match: /living|lounge|family|\bden\b|sitting/i, hint: 'Give it a drink next time you’re relaxing in the living room.' },
  { match: /office|desk|study|work/i, hint: 'Take a quick break from work and give it a drink.' },
  { match: /patio|porch|balcony|garden|yard|deck|outside|outdoor|terrace/i, hint: 'Step outside and give it a drink.' },
  { match: /window|sill|sun/i, hint: 'Give it a drink while the sunlight is on it.' },
  { match: /dining|hall|entry|foyer|stairs/i, hint: 'Give it a drink next time you walk past.' },
];

/** Pick a short, friendly nudge that matches where the plant lives. */
function getLocationHint(location: string | undefined): string {
  const place = location?.trim() ?? '';
  const match = LOCATION_HINTS.find(({ match: pattern }) => pattern.test(place));
  return match?.hint ?? 'Give it a drink when you get a chance.';
}

function buildNotificationBody(plant: Plant): string {
  const base = `Your plant ${plant.name} needs watering today. ${getLocationHint(plant.location)}`;
  const log = plant.wateringLog || [];
  const latestWatering = getMostRecentWateringEntryOnOrBefore(getWateringEntries(log), new Date());
  if (latestWatering?.wateredBy) {
    return `${latestWatering.wateredBy} last watered this plant. ${base}`;
  }
  return base;
}

async function scheduleWateringNotifications(plants: Plant[]) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const plant of plants) {
    const nextWater = getNextWaterDate(plant);
    const trigger = new Date(nextWater);

    // Use plant's preferred reminder time, default to 9:00 AM
    if (plant.reminderTime) {
      const [h, m] = plant.reminderTime.split(':').map(Number);
      trigger.setHours(h, m, 0, 0);
    } else {
      trigger.setHours(9, 0, 0, 0);
    }

    if (trigger <= new Date()) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time to water ${plant.name}! 💧`,
        body: buildNotificationBody(plant),
        data: { plantId: plant.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: Platform.OS === 'android' ? 'watering' : undefined,
      },
    });
  }
}

/** Reschedule local reminders when enabled plant data changes. */
export function useWateringNotifications() {
  const {
    plants,
    notificationsEnabled,
    setNotificationsEnabled,
    householdNotifications,
    hasCompletedOnboarding,
  } = usePlants();
  const hasRegistered = useRef(false);
  const shownReminderIds = useRef(new Set<string>());

  useEffect(() => {
    // New installs are asked for permission by the welcome flow, not at launch.
    if (!notificationsEnabled || !hasCompletedOnboarding) {
      Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    const setup = async () => {
      if (!hasRegistered.current) {
        const granted = await registerForPushNotifications();
        if (!granted) {
          await setNotificationsEnabled(false);
          return;
        }
        hasRegistered.current = true;
      }

      await scheduleWateringNotifications(plants);
    };

    void setup().catch((error) => {
      console.error('Unable to configure watering notifications:', error);
    });
  }, [plants, notificationsEnabled, setNotificationsEnabled, hasCompletedOnboarding]);

  // Trigger local push for incoming household reminders
  useEffect(() => {
    if (!notificationsEnabled || !hasCompletedOnboarding) return;
    for (const notif of householdNotifications) {
      if (!notif.read && !shownReminderIds.current.has(notif.id)) {
        shownReminderIds.current.add(notif.id);
        Notifications.scheduleNotificationAsync({
          content: {
            title: `${notif.fromName} sent a reminder 💧`,
            body: `Don't forget to water ${notif.plantName}!`,
            data: { plantId: notif.plantId, type: 'household_reminder' },
          },
          trigger: null, // fire immediately
        });
      }
    }
  }, [householdNotifications, notificationsEnabled, hasCompletedOnboarding]);
}
