/** Optional crash reporting. Does nothing until a Sentry DSN is configured. */

import Constants from 'expo-constants';

type SentryModule = typeof import('@sentry/react-native');

let sentry: SentryModule | null = null;

function getDsn(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  const fromConfig = Constants.expoConfig?.extra?.sentryDsn;
  return fromEnv || (typeof fromConfig === 'string' ? fromConfig.trim() : '');
}

/** Start crash reporting once at launch; safe to call when the DSN or native module is missing. */
export function initCrashReporting(): void {
  const dsn = getDsn();
  if (!dsn || __DEV__) {
    return;
  }

  try {
    // Loaded lazily so builds without the native module keep working.
    sentry = require('@sentry/react-native') as SentryModule;
    sentry.init({
      dsn,
      sendDefaultPii: false,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0,
    });
  } catch (error) {
    sentry = null;
    console.warn('Crash reporting could not start:', error);
  }
}

/** Report a handled error that is worth knowing about. */
export function reportError(error: unknown, context?: string): void {
  if (!sentry) {
    return;
  }

  sentry.captureException(error, context ? { extra: { context } } : undefined);
}
