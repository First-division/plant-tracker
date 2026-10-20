import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { usePlants } from '@/contexts/PlantContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getThemeColors } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Present sign-in choices for account features while allowing anonymous app use. */
export default function AuthModal() {
  const params = useLocalSearchParams<{ purpose?: string }>();
  const {
    signInWithApple,
    signInWithGoogle,
    signInAnonymously,
    isLoading,
    googleSignInAvailable,
  } = useAuth();
  const {
    setHouseholdEnabled,
    setHouseholdAuthPending,
    setPersonalBackupEnabled,
    setPersonalBackupAuthPending,
    colorTheme,
  } = usePlants();
  const systemScheme = useColorScheme();
  const isDark = systemScheme === 'dark';
  const insets = useSafeAreaInsets();
  const isHouseholdAuth = params.purpose === 'household';
  const isPersonalBackupAuth = params.purpose === 'backup';
  const completedAuthRef = React.useRef(false);

  const palette = getThemeColors(colorTheme, isDark);
  const colors = {
    bg: palette.screenBg,
    card: isDark ? palette.cardBg : palette.lightCardBg,
    text: palette.text,
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
  };

  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const cancelledRef = React.useRef(false);

  const content = isPersonalBackupAuth
    ? {
        icon: 'cloud-upload' as const,
        title: 'Enable Cloud Backup',
        subtitle: 'Sign in with Apple or Google to keep your solo plant data recoverable across reinstalls and new devices.',
        appleDescription: 'Links backup to your Apple ID so you can restore your plants and photos after switching iPhones or reinstalling the app.',
        googleDescription: 'Uses your Google account for cross-platform backup recovery on Android and iPhone.',
        googleUnavailable: 'Google sign-in is unavailable on this Android build. Add the Android web client ID and rebuild to use Google backup on Android.',
      }
    : {
        icon: 'people-circle' as const,
        title: 'Sign In',
        subtitle: 'Sign in to create or join a household and share your plants with family members.',
        appleDescription: 'Links to your Apple ID for secure sign-in. Your account syncs across devices and can be recovered if you switch phones.',
        googleDescription: 'Uses your Google account. Works across Android and iOS, and your account can be recovered on any device.',
        googleUnavailable: 'Use Share Code Only for now. Google can be re-enabled after the Android web client ID is added and the app is rebuilt.',
      };

  React.useEffect(() => {
    return () => {
      if (isHouseholdAuth && !completedAuthRef.current) {
        setHouseholdAuthPending(false);
      }
      if (isPersonalBackupAuth && !completedAuthRef.current) {
        setPersonalBackupAuthPending(false);
      }
    };
  }, [isHouseholdAuth, isPersonalBackupAuth, setHouseholdAuthPending, setPersonalBackupAuthPending]);

  const finishAuth = async () => {
    try {
      if (isHouseholdAuth) {
        await setHouseholdEnabled(true);
        setHouseholdAuthPending(false);
        completedAuthRef.current = true;
      }

      if (isPersonalBackupAuth) {
        await setPersonalBackupEnabled(true);
        setPersonalBackupAuthPending(false);
        completedAuthRef.current = true;
      }
    } catch (error) {
      // Undo the half-enabled feature so the Settings switch matches reality.
      if (isHouseholdAuth) {
        await setHouseholdEnabled(false).catch(() => {});
        setHouseholdAuthPending(false);
      }
      if (isPersonalBackupAuth) {
        await setPersonalBackupEnabled(false).catch(() => {});
        setPersonalBackupAuthPending(false);
      }
      throw error;
    }

    router.back();
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    if (isHouseholdAuth) {
      setHouseholdAuthPending(false);
      completedAuthRef.current = true;
    }
    if (isPersonalBackupAuth) {
      setPersonalBackupAuthPending(false);
      completedAuthRef.current = true;
    }
    router.back();
  };

  const handleApple = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await signInWithApple();
      if (cancelledRef.current) return;
      await finishAuth();
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED' && !cancelledRef.current) {
        console.error('Apple sign-in error:', e);
        setErrorMessage(e.message || 'Failed to sign in with Apple. Please try again.');
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await signInWithGoogle();
      if (cancelledRef.current) return;
      await finishAuth();
    } catch (e: any) {
      if (e.code !== 'SIGN_IN_CANCELLED' && !cancelledRef.current) {
        console.error('Google sign-in error:', e);
        setErrorMessage(e.message || 'Failed to sign in with Google. Please try again.');
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await signInAnonymously();
      if (cancelledRef.current) return;
      await finishAuth();
    } catch (e: any) {
      if (!cancelledRef.current) {
        console.error('Anonymous sign-in error:', e);
        setErrorMessage(e.message || 'Failed to continue with share code only. Please try again.');
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  };

  if (isLoading || loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Signing in…</Text>
        <TouchableOpacity
          style={styles.loadingCancel}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel sign in"
        >
          <Text style={[styles.cancelText, { color: '#007AFF' }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <TouchableOpacity
        style={[styles.cancelButton, { top: Math.max(insets.top, 16) }]}
        onPress={handleCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel sign in"
      >
        <Text style={[styles.cancelText, { color: '#007AFF' }]}>Cancel</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 16) + 40, paddingBottom: Math.max(insets.bottom, 16) }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name={content.icon} size={80} color="#007AFF" />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{content.title}</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          {content.subtitle}
        </Text>

        {errorMessage && (
          <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Ionicons name="alert-circle" size={20} color="#FF3B30" />
            <Text style={[styles.errorText, { color: colors.text }]}>{errorMessage}</Text>
          </View>
        )}

        {Platform.OS === 'ios' && (
          <>
            <TouchableOpacity style={styles.appleButton} onPress={handleApple} activeOpacity={0.8}>
              <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
              <Text style={styles.appleButtonText}>Sign in with Apple</Text>
            </TouchableOpacity>
            <Text style={styles.optionDescription}>
              {content.appleDescription}
            </Text>
          </>
        )}

        {googleSignInAvailable ? (
          <>
            <TouchableOpacity
              style={[styles.googleButton, { borderColor: colors.secondaryText }]}
              onPress={handleGoogle}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-google" size={20} color="#4285F4" />
              <Text style={[styles.googleButtonText, { color: colors.text }]}>Sign in with Google</Text>
            </TouchableOpacity>
            <Text style={styles.optionDescription}>
              {content.googleDescription}
            </Text>
          </>
        ) : (
          <View style={[styles.unavailableCard, { backgroundColor: colors.card, borderColor: colors.secondaryText }]}> 
            <Ionicons name="warning-outline" size={20} color="#FF9500" />
            <Text style={[styles.unavailableTitle, { color: colors.text }]}>Google sign-in is unavailable on this Android build.</Text>
            <Text style={[styles.unavailableText, { color: colors.secondaryText }]}>{content.googleUnavailable}</Text>
          </View>
        )}

        {!isPersonalBackupAuth && (
          <>
            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: colors.secondaryText }]} />
              <Text style={[styles.dividerText, { color: colors.secondaryText }]}>or</Text>
              <View style={[styles.divider, { backgroundColor: colors.secondaryText }]} />
            </View>

            <TouchableOpacity
              style={[styles.skipButton, { backgroundColor: colors.card }]}
              onPress={handleSkip}
              activeOpacity={0.8}
            >
              <Ionicons name="key-outline" size={20} color="#007AFF" />
              <Text style={[styles.skipButtonText, { color: '#007AFF' }]}>Use Share Code Only</Text>
            </TouchableOpacity>
            <Text style={styles.optionDescription}>
              No account needed — join a household with a 6-character code. Quick to set up, but your session cannot be recovered on a new device.
            </Text>
          </>
        )}
      </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 440,
    alignSelf: 'center',
    width: '100%',
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 12,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 16,
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8E8E93',
  },
  googleButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  unavailableCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  unavailableTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  unavailableText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 16,
    width: '100%',
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    opacity: 0.3,
  },
  dividerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 16,
  },
  skipButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  optionDescription: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  cancelButton: {
    position: 'absolute',
    right: 8,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  loadingCancel: {
    marginTop: 12,
    minHeight: 44,
    minWidth: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF3B30',
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '500',
  },
});
