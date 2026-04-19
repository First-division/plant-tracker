import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  useColorScheme,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/app/context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AuthModal() {
  const { signInWithApple, signInWithGoogle, signInAnonymously, isLoading } = useAuth();
  const systemScheme = useColorScheme();
  const isDark = systemScheme === 'dark';
  const insets = useSafeAreaInsets();

  const colors = {
    bg: isDark ? '#000000' : '#F2F2F7',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#000000',
    secondaryText: isDark ? '#8E8E93' : '#6C6C70',
  };

  const [loading, setLoading] = React.useState(false);

  const handleApple = async () => {
    setLoading(true);
    try {
      await signInWithApple();
      router.back();
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        console.error('Apple sign-in error:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      router.back();
    } catch (e: any) {
      if (e.code !== 'SIGN_IN_CANCELLED') {
        console.error('Google sign-in error:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await signInAnonymously();
      router.back();
    } catch (e) {
      console.error('Anonymous sign-in error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <TouchableOpacity style={[styles.cancelButton, { top: Math.max(insets.top, 16) }]} onPress={() => router.back()}>
        <Text style={[styles.cancelText, { color: '#007AFF' }]}>Cancel</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 16) + 40, paddingBottom: Math.max(insets.bottom, 16) }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="people-circle" size={80} color="#007AFF" />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Sign In</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          Sign in to create or join a household and share your plants with family members.
        </Text>

        {Platform.OS === 'ios' && (
          <>
            <TouchableOpacity style={styles.appleButton} onPress={handleApple} activeOpacity={0.8}>
              <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
              <Text style={styles.appleButtonText}>Sign in with Apple</Text>
            </TouchableOpacity>
            <Text style={styles.optionDescription}>
              Links to your Apple ID for secure sign-in. Your account syncs across devices and can be recovered if you switch phones.
            </Text>
          </>
        )}

        <TouchableOpacity
          style={[styles.googleButton, { borderColor: colors.secondaryText }]}
          onPress={handleGoogle}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-google" size={20} color="#4285F4" />
          <Text style={[styles.googleButtonText, { color: colors.text }]}>Sign in with Google</Text>
        </TouchableOpacity>
        <Text style={styles.optionDescription}>
          Uses your Google account. Works across Android and iOS, and your account can be recovered on any device.
        </Text>

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
          No account needed — join a household with a 6-character code. Quick to set up, but your session can't be recovered on a new device.
        </Text>
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
    right: 16,
    padding: 8,
    zIndex: 10,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '500',
  },
});
