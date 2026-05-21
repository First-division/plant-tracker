import type { ExpoConfig } from 'expo/config';

const appJson = require('./app.json');

const baseConfig = appJson.expo as ExpoConfig;

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