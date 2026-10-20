import type { ExpoConfig } from 'expo/config';
import appJson from './app.json' with { type: 'json' };

const baseConfig = appJson.expo as ExpoConfig;

/** Apply environment-specific public config while retaining the checked-in Expo settings. */
export default (): ExpoConfig => {
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

  return {
    ...baseConfig,
    extra: {
      ...baseConfig.extra,
      ...(googleWebClientId ? { googleWebClientId } : {}),
    },
  };
};