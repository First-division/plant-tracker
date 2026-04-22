import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { usePlants, Plant } from '@/app/context/PlantContext';
import { parseCheckIntervalDays } from '@/services/plant-intervals';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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

  if (log.length > 0) {
    const lastWatered = new Date(log[log.length - 1].date);
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

async function registerForPushNotifications(): Promise<boolean> {
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

function buildNotificationBody(plant: Plant): string {
  const base = `Your ${plant.name} in ${plant.location} needs watering today.`;
  const log = plant.wateringLog || [];
  if (log.length > 0) {
    const last = log[log.length - 1];
    if (last.wateredBy) {
      return `${last.wateredBy} last watered this plant. ${base}`;
    }
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

export function useWateringNotifications() {
  const { plants, notificationsEnabled, householdNotifications } = usePlants();
  const hasRegistered = useRef(false);
  const shownReminderIds = useRef(new Set<string>());

  useEffect(() => {
    if (!notificationsEnabled) {
      Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    const setup = async () => {
      if (!hasRegistered.current) {
        const granted = await registerForPushNotifications();
        if (!granted) return;
        hasRegistered.current = true;
      }

      await scheduleWateringNotifications(plants);
    };

    setup();
  }, [plants, notificationsEnabled]);

  // Trigger local push for incoming household reminders
  useEffect(() => {
    if (!notificationsEnabled) return;
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
  }, [householdNotifications, notificationsEnabled]);
}
