import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  TextInput,
  View,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  ScrollView,
  Animated,
  findNodeHandle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { usePlants } from '@/contexts/PlantContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { registerForPushNotifications } from '@/hooks/use-notifications';

const STEPS = [
  'welcome',
  'home',
  'watering',
  'calendar',
  'household',
  'notifications',
  'name',
] as const;
type Step = typeof STEPS[number];

/** Name saved when the user skips entering one; it can be changed later in Settings. */
const DEFAULT_USER_NAME = 'Plant Lover';

/** Walk new users through app features and capture their initial display name. */
export default function WelcomeModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setUserName, setNotificationsEnabled, colorTheme, setPersonalBackupAuthPending, setPersonalBackupEnabled } = usePlants();
  const { user, isAuthenticated, signOut, firebaseAvailable } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const palette = getThemeColors(colorTheme, isDark);

  const colors = {
    bg: palette.screenBg,
    card: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    text: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.65)',
    inputBg: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    inputBorder: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
    inputText: isDark ? '#FFF' : '#000',
    dotInactive: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)',
    backText: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
    iconCircleBg: palette.primaryLight,
  };

  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingNotifications, setIsRequestingNotifications] = useState(false);
  const { width: screenW, height: screenH } = useWindowDimensions();

  const stepIndex = STEPS.indexOf(step);
  const isLast = step === 'name';
  const isFirst = step === 'welcome';

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const welcomeScrollRef = useRef<ScrollView>(null);
  const nameInputRef = useRef<TextInput>(null);

  const transitionTo = useCallback((newStep: Step) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setStep(newStep);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  const handleNext = () => {
    if (!isLast) transitionTo(STEPS[stepIndex + 1]);
  };

  const handleBack = () => {
    if (!isFirst) transitionTo(STEPS[stepIndex - 1]);
  };

  /** Ask for OS notification permission, remember the choice, then continue the tour. */
  const handleNotificationChoice = async (allow: boolean) => {
    setIsRequestingNotifications(true);
    try {
      const granted = allow ? await registerForPushNotifications() : false;
      await setNotificationsEnabled(granted);
    } catch (error) {
      console.error('Unable to configure notifications:', error);
      await setNotificationsEnabled(false).catch(() => {});
    } finally {
      setIsRequestingNotifications(false);
      transitionTo('name');
    }
  };

  const handleSubmit = async (useDefaultName = false) => {
    const finalName = useDefaultName ? DEFAULT_USER_NAME : name.trim();
    if (!finalName) {
      Alert.alert('Please enter your name', 'Or tap "Skip for now" and add it later in Settings.');
      return;
    }
    setIsSubmitting(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await setUserName(finalName);
      router.dismiss();
    } catch (error) {
      Alert.alert('Error', 'Failed to save your name. Please try again.');
      console.error(error);
      setIsSubmitting(false);
    }
  };

  const handleRestoreFromBackup = async () => {
    if (!firebaseAvailable) {
      Alert.alert('Cloud Backup Unavailable', 'Cloud backup requires a build with Firebase configured.');
      return;
    }

    setPersonalBackupAuthPending(true);
    try {
      if (user && !user.isAnonymous) {
        await setPersonalBackupEnabled(true);
        setPersonalBackupAuthPending(false);
        return;
      }
      if (isAuthenticated) {
        await signOut();
      }
      router.push({ pathname: '/auth-modal', params: { purpose: 'backup' } });
    } catch (error: any) {
      await setPersonalBackupEnabled(false).catch(() => {});
      setPersonalBackupAuthPending(false);
      Alert.alert('Cloud Backup', error?.message || 'Could not start restore. Please try again.');
    }
  };

  const handleNameFocus = () => {
    const inputNode = nameInputRef.current ? findNodeHandle(nameInputRef.current) : null;
    if (!inputNode || !welcomeScrollRef.current) {
      return;
    }

    welcomeScrollRef.current.scrollResponderScrollNativeHandleToKeyboard(inputNode, 64, true);
  };

  // Responsive sizes
  const isSmall = screenH < 700;
  const cardPadding = isSmall ? 20 : 28;
  const titleSize = Math.min(28, screenW * 0.07);
  const bodySize = Math.min(16, screenW * 0.04);

  const renderStepContent = () => {
    switch (step) {
      case 'welcome':
        return (
          <>
            <View style={[s.iconCircle, { backgroundColor: colors.iconCircleBg, width: isSmall ? 72 : 80, height: isSmall ? 72 : 80, borderRadius: isSmall ? 36 : 40 }]}>
              <Ionicons name="leaf" size={isSmall ? 36 : 44} color={palette.primary} />
            </View>
            <ThemedText style={[s.title, { fontSize: titleSize, color: colors.text }]}>Welcome to PlantCare!</ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, color: colors.textSecondary }]}>
              Your personal plant care companion. We will help you track watering schedules, monitor plant health, and get reminders when it is time to water your plants.
            </ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, marginTop: 12, color: colors.textSecondary }]}>
              Let us take a quick tour of the app.
            </ThemedText>
            <TouchableOpacity
              onPress={() => void handleRestoreFromBackup()}
              style={s.restoreLink}
              accessibilityRole="button"
              accessibilityLabel="Already have an account? Sign in to restore your plants from cloud backup"
            >
              <ThemedText style={[s.restoreLinkText, { color: palette.primary }]}>
                Already backed up? Sign in to restore your plants
              </ThemedText>
            </TouchableOpacity>
          </>
        );
      case 'home':
        return (
          <>
            <View style={[s.iconCircle, { backgroundColor: colors.iconCircleBg }]}>
              <Ionicons name="home" size={isSmall ? 28 : 34} color={palette.primary} />
            </View>
            <ThemedText style={[s.title, { fontSize: titleSize, color: colors.text }]}>Home Screen</ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, color: colors.textSecondary }]}>
              The home screen shows all your plants at a glance. You will see each plant health percentage, location, and when it next needs watering.
            </ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, marginTop: 12, color: colors.textSecondary }]}>
              Tap the <ThemedText style={[s.highlight, { color: palette.primary }]}>+</ThemedText> button to add your first plant. You can set a watering schedule and the app will remind you when it is time.
            </ThemedText>
          </>
        );
      case 'watering':
        return (
          <>
            <View style={[s.iconCircle, { backgroundColor: colors.iconCircleBg }]}>
              <Ionicons name="water" size={isSmall ? 28 : 34} color={palette.primary} />
            </View>
            <ThemedText style={[s.title, { fontSize: titleSize, color: colors.text }]}>Logging Watering</ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, color: colors.textSecondary }]}>
              Open a plant and tap <ThemedText style={[s.highlight, { color: palette.primary }]}>Water</ThemedText> to log it for today.
            </ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, marginTop: 12, color: colors.textSecondary }]}>
              Forgot to log it? <ThemedText style={[s.highlight, { color: palette.primary }]}>Press and hold Water</ThemedText> to pick the day and time you really watered, or tap Other date.
            </ThemedText>
          </>
        );
      case 'calendar':
        return (
          <>
            <View style={[s.iconCircle, { backgroundColor: colors.iconCircleBg }]}>
              <Ionicons name="calendar" size={isSmall ? 28 : 34} color={palette.primary} />
            </View>
            <ThemedText style={[s.title, { fontSize: titleSize, color: colors.text }]}>Calendar</ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, color: colors.textSecondary }]}>
              The calendar gives you an overview of all your upcoming and past waterings. Days with scheduled waterings are marked with colored dots.
            </ThemedText>
            <View style={s.arrowRow}>
              <Ionicons name="arrow-down" size={22} color={palette.primary} />
              <ThemedText style={[s.arrowLabel, { fontSize: bodySize - 1, color: palette.primary }]}>
                Find it in the tab bar below
              </ThemedText>
              <Ionicons name="arrow-down" size={22} color={palette.primary} />
            </View>
          </>
        );
      case 'household':
        return (
          <>
            <View style={[s.iconCircle, { backgroundColor: colors.iconCircleBg }]}>
              <Ionicons name="people" size={isSmall ? 28 : 34} color={palette.primary} />
            </View>
            <ThemedText style={[s.title, { fontSize: titleSize, color: colors.text }]}>Household Sharing</ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, color: colors.textSecondary }]}>
              PlantCare supports sharing plants with your household. Multiple people can track and water the same plants, and everyone’s activity shows up on the calendar.
            </ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, marginTop: 12, color: colors.textSecondary }]}>
              This feature is <ThemedText style={[s.highlight, { color: palette.primary }]}>turned off by default</ThemedText>. You can enable it anytime in Settings by toggling Household Mode and signing in.
            </ThemedText>
          </>
        );
      case 'notifications':
        return (
          <>
            <View style={[s.iconCircle, { backgroundColor: colors.iconCircleBg }]}>
              <Ionicons name="notifications" size={isSmall ? 28 : 34} color={palette.primary} />
            </View>
            <ThemedText style={[s.title, { fontSize: titleSize, color: colors.text }]}>Watering Reminders</ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, color: colors.textSecondary }]}>
              Get a notification when a plant needs water so nothing gets forgotten. Your device will ask for permission next.
            </ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, marginTop: 12, color: colors.textSecondary }]}>
              You can change this anytime in <ThemedText style={[s.highlight, { color: palette.primary }]}>Settings</ThemedText>.
            </ThemedText>
          </>
        );
      case 'name':
        return (
          <>
            <ThemedText style={[s.title, { fontSize: titleSize, color: colors.text }]}>Almost Done!</ThemedText>
            <ThemedText style={[s.body, { fontSize: bodySize, marginBottom: 20, color: colors.textSecondary }]}>
              Enter your name so we can personalize your experience. You can skip this and add it later in Settings.
            </ThemedText>
            <View style={s.inputContainer}>
              <ThemedText style={[s.label, { fontSize: bodySize, color: colors.text }]}>What is your name?</ThemedText>
              <TextInput
                ref={nameInputRef}
                style={[s.textInput, { fontSize: bodySize, backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                placeholder="Enter your name"
                placeholderTextColor="#888"
                value={name}
                onChangeText={setName}
                editable={!isSubmitting}
                autoFocus
                onFocus={handleNameFocus}
              />
            </View>
          </>
        );
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
    >
      <View style={[s.outer, { backgroundColor: colors.bg }]}>
        {stepIndex < STEPS.indexOf('notifications') && (
          <TouchableOpacity
            style={[s.skipTour, { top: Math.max(insets.top, 12) }]}
            onPress={() => transitionTo('notifications')}
            accessibilityRole="button"
            accessibilityLabel="Skip the tour"
          >
            <ThemedText style={[s.backText, { color: colors.backText }]}>Skip tour</ThemedText>
          </TouchableOpacity>
        )}
        <ScrollView
          ref={welcomeScrollRef}
          contentContainerStyle={[s.scrollContent, { paddingHorizontal: screenW < 380 ? 16 : 24, paddingTop: Math.max(insets.top, 20) + 28 }]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={[s.card, { padding: cardPadding, backgroundColor: colors.card }]}>
            <Animated.View style={{ opacity: fadeAnim, alignItems: 'center', width: '100%' }}>
              {renderStepContent()}
            </Animated.View>

            {/* Progress dots */}
            <View style={s.dotsRow}>
              {STEPS.map((_, i) => (
                <View key={i} style={[s.dot, { backgroundColor: colors.dotInactive }, i === stepIndex && [s.dotActive, { backgroundColor: palette.primary }]]} />
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Bottom nav */}
        <View style={[s.navRow, { paddingHorizontal: screenW < 380 ? 16 : 24, paddingBottom: isSmall ? 16 : 30 }]}>
          {!isFirst ? (
            <TouchableOpacity onPress={handleBack} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={20} color={colors.backText} />
              <ThemedText style={[s.backText, { color: colors.backText }]}>Back</ThemedText>
            </TouchableOpacity>
          ) : <View style={{ width: 70 }} />}

          {isLast ? (
            <View style={s.notificationActions}>
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: palette.primary }, isSubmitting && { opacity: 0.6 }]}
                onPress={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <ThemedText style={s.primaryBtnText}>Get Started</ThemedText>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleSubmit(true)}
                disabled={isSubmitting}
                style={s.laterBtn}
                accessibilityRole="button"
                accessibilityLabel="Skip entering a name"
              >
                <ThemedText style={[s.backText, { color: colors.backText }]}>Skip for now</ThemedText>
              </TouchableOpacity>
            </View>
          ) : step === 'notifications' ? (
            <View style={s.notificationActions}>
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: palette.primary }, isRequestingNotifications && { opacity: 0.6 }]}
                onPress={() => void handleNotificationChoice(true)}
                disabled={isRequestingNotifications}
              >
                {isRequestingNotifications ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <ThemedText style={s.primaryBtnText}>Turn On</ThemedText>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleNotificationChoice(false)}
                disabled={isRequestingNotifications}
                style={s.laterBtn}
              >
                <ThemedText style={[s.backText, { color: colors.backText }]}>Maybe Later</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[s.primaryBtn, { backgroundColor: palette.primary }]} onPress={handleNext} accessibilityRole="button" accessibilityLabel="Next">
              <ThemedText style={s.primaryBtnText}>Next</ThemedText>
              <Ionicons name="chevron-forward" size={18} color="#FFF" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  outer: {
    flex: 1,
    backgroundColor: '#535353',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 60,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    backgroundColor: '#00C853',
    width: 20,
  },
  emojiWrap: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emoji: {
    textAlign: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,200,83,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    paddingTop: 8,
    paddingBottom: 15,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: 'rgba(255, 255, 255, 0.82)',
    textAlign: 'center',
    lineHeight: 22,
  },
  highlight: {
    color: '#00C853',
    fontWeight: '700',
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,200,83,0.12)',
    borderRadius: 12,
  },
  arrowLabel: {
    color: '#00C853',
    fontWeight: '600',
  },
  inputContainer: {
    width: '100%',
    marginBottom: 8,
  },
  label: {
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFF',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 70,
    minHeight: 44,
  },
  backText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: '#00C853',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 130,
    justifyContent: 'center',
  },
  notificationActions: {
    alignItems: 'center',
    gap: 6,
  },
  skipTour: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  restoreLink: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
  },
  restoreLinkText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  laterBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
