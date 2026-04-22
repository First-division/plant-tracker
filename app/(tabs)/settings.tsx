import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  Modal,
  FlatList,
  useColorScheme,
  Clipboard,
  PanResponder,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import { usePlants, AppAppearance } from '@/app/context/PlantContext';
import { useAuth } from '@/app/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { COLOR_THEMES, ColorThemeName, MEMBER_COLORS, getThemeColors } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ---- Simple HSV Color Picker (no external deps) ----
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function SimpleColorPicker({ value, onColorChange }: { value: string; onColorChange: (hex: string) => void }) {
  const initial = hexToHsv(value);
  const [hue, setHue] = useState(initial.h);
  const [sat, setSat] = useState(initial.s);
  const [val, setVal] = useState(initial.v);
  const [panelW, setPanelW] = useState(0);
  const [panelH, setPanelH] = useState(0);
  const [hueW, setHueW] = useState(0);

  // Refs for PanResponder callbacks (avoid stale closures)
  const hueRef = useRef(initial.h);
  const satRef = useRef(initial.s);
  const valRef = useRef(initial.v);
  const onColorChangeRef = useRef(onColorChange);
  onColorChangeRef.current = onColorChange;

  // View refs for measureInWindow
  const panelRef = useRef<View>(null);
  const hueBarRef = useRef<View>(null);
  const panelOrigin = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const hueOrigin = useRef({ x: 0, w: 0 });

  const updateFromPanel = useCallback((pageX: number, pageY: number) => {
    const localX = pageX - panelOrigin.current.x;
    const localY = pageY - panelOrigin.current.y;
    const s = Math.max(0, Math.min(1, localX / panelOrigin.current.w));
    const v = Math.max(0, Math.min(1, 1 - localY / panelOrigin.current.h));
    satRef.current = s;
    valRef.current = v;
    setSat(s);
    setVal(v);
    onColorChangeRef.current(hsvToHex(hueRef.current, s, v));
  }, []);

  const updateFromHue = useCallback((pageX: number) => {
    const localX = pageX - hueOrigin.current.x;
    const h = Math.max(0, Math.min(360, (localX / hueOrigin.current.w) * 360));
    hueRef.current = h;
    setHue(h);
    onColorChangeRef.current(hsvToHex(h, satRef.current, valRef.current));
  }, []);

  const panelResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        panelRef.current?.measureInWindow((x, y, w, h) => {
          panelOrigin.current = { x, y, w, h };
          updateFromPanel(e.nativeEvent.pageX, e.nativeEvent.pageY);
        });
      },
      onPanResponderMove: (e) => {
        updateFromPanel(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
    })
  ).current;

  const hueResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        hueBarRef.current?.measureInWindow((x, _y, w) => {
          hueOrigin.current = { x, w };
          updateFromHue(e.nativeEvent.pageX);
        });
      },
      onPanResponderMove: (e) => {
        updateFromHue(e.nativeEvent.pageX);
      },
    })
  ).current;

  const hueColor = hsvToHex(hue, 1, 1);

  return (
    <View style={cpStyles.container}>
      {/* Saturation/Value panel */}
      <View
        ref={panelRef}
        style={cpStyles.panel}
        onLayout={(e: LayoutChangeEvent) => {
          setPanelW(e.nativeEvent.layout.width);
          setPanelH(e.nativeEvent.layout.height);
        }}
        {...panelResponder.panHandlers}
      >
        <View style={[cpStyles.panelBg, { backgroundColor: hueColor }]} pointerEvents="none" />
        <LinearGradient
          colors={['#FFFFFF', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {/* Thumb */}
        <View pointerEvents="none" style={[
          cpStyles.thumb,
          {
            left: sat * (panelW || 280) - 10,
            top: (1 - val) * (panelH || 200) - 10,
            borderColor: val > 0.5 ? '#000' : '#fff',
          },
        ]} />
      </View>

      {/* Hue bar */}
      <View
        ref={hueBarRef}
        style={cpStyles.hueBar}
        onLayout={(e: LayoutChangeEvent) => { setHueW(e.nativeEvent.layout.width); }}
        {...hueResponder.panHandlers}
      >
        <View style={cpStyles.hueGradient} pointerEvents="none">
          {[0, 60, 120, 180, 240, 300, 360].map((stop, i, arr) => {
            if (i === arr.length - 1) return null;
            return (
              <View
                key={stop}
                style={[
                  cpStyles.hueSegment,
                  { backgroundColor: hsvToHex(stop, 1, 1) },
                ]}
              />
            );
          })}
        </View>
        {/* Hue thumb */}
        <View pointerEvents="none" style={[
          cpStyles.hueThumb,
          { left: (hue / 360) * (hueW || 280) - 10 },
        ]} />
      </View>
    </View>
  );
}

const cpStyles = StyleSheet.create({
  container: { width: '100%', gap: 16 },
  panel: { width: '100%', height: 200, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  panelBg: { ...StyleSheet.absoluteFillObject },
  thumb: {
    position: 'absolute',
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  hueBar: { width: '100%', height: 36, borderRadius: 18, overflow: 'hidden', position: 'relative' },
  hueGradient: { flex: 1, flexDirection: 'row' },
  hueSegment: { flex: 1 },
  hueThumb: {
    position: 'absolute', top: 3,
    width: 20, height: 30, borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 2, borderColor: 'rgba(0,0,0,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2,
  },
});

const INTERVALS = ['2 days', '5 days', '1 week', '2 weeks', '3 weeks', '1 month', '2 months', '3 months', '4 months'];

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Phoenix',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function getAllTimezones(): string[] {
  try {
    return (Intl as any).supportedValuesOf('timeZone');
  } catch {
    return COMMON_TIMEZONES;
  }
}

export default function SettingsScreen() {
  const {
    userName,
    setUserName,
    appearance,
    setAppearance,
    timezone,
    setTimezone,
    notificationsEnabled,
    setNotificationsEnabled,
    defaultCheckInterval,
    setDefaultCheckInterval,
    resetUserData,
    householdEnabled,
    setHouseholdEnabled,
    householdId,
    householdCode,
    householdName,
    householdMembers,
    createNewHousehold,
    joinExistingHousehold,
    leaveCurrentHousehold,
    refreshHouseholdMembers,
    colorTheme,
    setColorTheme,
    householdMemberColor,
    setHouseholdMemberColor,
  } = usePlants();

  const { user, isAuthenticated, signOut, firebaseAvailable } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Auto-enable household after returning from auth modal
  const pendingHouseholdEnableRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated && pendingHouseholdEnableRef.current) {
      pendingHouseholdEnableRef.current = false;
      void setHouseholdEnabled(true);
    }
  }, [isAuthenticated, setHouseholdEnabled]);

  const systemScheme = useColorScheme();
  const effectiveScheme = appearance === 'system' ? systemScheme : appearance;
  const isDark = effectiveScheme === 'dark';

  const theme = getThemeColors(colorTheme, isDark);
  const colors = {
    bg: theme.screenBg,
    card: theme.cardBg,
    text: theme.text,
    secondaryText: theme.secondaryText,
    separator: isDark ? '#38383A' : '#C6C6C8',
    destructive: '#FF3B30',
    tint: theme.primary,
    groupedHeader: isDark ? '#8E8E93' : '#6C6C70',
  };

  const [tzModalVisible, setTzModalVisible] = useState(false);
  const [tzSearch, setTzSearch] = useState('');
  const [intervalModalVisible, setIntervalModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [colorPickerTab, setColorPickerTab] = useState<'presets' | 'custom'>('presets');
  const [customPickerColor, setCustomPickerColor] = useState(householdMemberColor);
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const settingsModalPresentationStyle = Platform.OS === 'ios' ? 'formSheet' : 'fullScreen';
  const androidModalTopInset = Platform.OS === 'android' ? insets.top : 0;

  // Cross-platform prompt modal (replaces iOS-only Alert.prompt)
  const [promptConfig, setPromptConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    defaultValue: string;
    onSubmit: (value: string) => void;
    submitLabel: string;
  }>({ visible: false, title: '', message: '', defaultValue: '', onSubmit: () => {}, submitLabel: 'OK' });
  const [promptValue, setPromptValue] = useState('');
  const showPrompt = (title: string, message: string, onSubmit: (v: string) => void, defaultValue = '', submitLabel = 'OK') => {
    setPromptValue(defaultValue);
    setPromptConfig({ visible: true, title, message, defaultValue, onSubmit, submitLabel });
  };

  // Custom colors from other household members that aren't in MEMBER_COLORS presets
  const lockedCustomColors = useMemo(() => {
    if (!user) return [];
    const presetSet = new Set(MEMBER_COLORS.map(c => c.toUpperCase()));
    return householdMembers
      .filter(m => m.uid !== user.uid && m.color && !presetSet.has(m.color.toUpperCase()))
      .map(m => ({ color: m.color!, name: m.displayName }));
  }, [householdMembers, user]);

  // Check if the user's current color is a custom (non-preset) color
  const myCustomColor = useMemo(() => {
    if (!householdMemberColor) return null;
    const presetSet = new Set(MEMBER_COLORS.map(c => c.toUpperCase()));
    if (presetSet.has(householdMemberColor.toUpperCase())) return null;
    return householdMemberColor;
  }, [householdMemberColor]);

  // Gesture blocker for custom picker tab — captures swipes to prevent modal dismiss
  const customTabGestureBlocker = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const allTimezones = getAllTimezones();
  const filteredTimezones = tzSearch
    ? allTimezones.filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase()))
    : allTimezones;

  const handleEditName = () => {
    showPrompt('Edit Name', 'Enter your name', (value) => {
      if (value.trim()) setUserName(value.trim());
    }, userName ?? '', 'Save');
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'This will delete all your plants, settings, and account data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetUserData();
            // Switch to home tab, then show welcome modal after it settles
            (navigation as any).navigate('index');
            setTimeout(() => {
              router.push('/welcome-modal');
            }, 400);
          },
        },
      ],
    );
  };

  const formatTimezone = (tz: string) => tz.replace(/_/g, ' ');

  const renderSectionHeader = (title: string) => (
    <Text style={[styles.sectionHeader, { color: colors.groupedHeader }]}>
      {title.toUpperCase()}
    </Text>
  );

  const renderRow = ({
    icon,
    iconColor,
    label,
    value,
    onPress,
    rightElement,
    isLast = false,
  }: {
    icon: string;
    iconColor: string;
    label: string;
    value?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    isLast?: boolean;
  }) => (
    <TouchableOpacity
      style={[
        styles.row,
        { backgroundColor: colors.card },
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
      ]}
      onPress={onPress}
      disabled={!onPress && !rightElement}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <View style={[styles.iconBox, { backgroundColor: iconColor }]}>
        <Ionicons name={icon as any} size={18} color="#FFFFFF" />
      </View>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        {rightElement ?? (
          <>
            {value && <Text style={[styles.rowValue, { color: colors.secondaryText }]}>{value}</Text>}
            {onPress && <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />}
          </>
        )}
      </View>
    </TouchableOpacity>
  );

  const appearanceLabels: { key: AppAppearance; label: string }[] = [
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
    { key: 'system', label: 'System' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      {/* ACCOUNT */}
      {renderSectionHeader('Account')}
      <View style={[styles.cardGroup, { backgroundColor: colors.card }]}>
        {renderRow({
          icon: 'person',
          iconColor: '#007AFF',
          label: 'Name',
          value: userName ?? 'Not set',
          onPress: handleEditName,
          isLast: true,
        })}
      </View>

      {/* APPEARANCE */}
      {renderSectionHeader('Appearance')}
      <View style={[styles.cardGroup, { backgroundColor: colors.card }]}>
        <View style={[styles.row, { backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
          <View style={[styles.iconBox, { backgroundColor: '#FF9500' }]}>
            <Ionicons name="sunny" size={18} color="#FFFFFF" />
          </View>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Theme</Text>
          <View style={styles.segmentedControl}>
            {appearanceLabels.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.segmentButton,
                  {
                    backgroundColor: appearance === key
                      ? (isDark ? '#636366' : '#FFFFFF')
                      : 'transparent',
                  },
                  appearance === key && styles.segmentButtonActive,
                ]}
                onPress={() => setAppearance(key)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: appearance === key ? colors.text : colors.secondaryText,
                      fontWeight: appearance === key ? '600' : '400',
                    },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {renderRow({
          icon: 'color-palette',
          iconColor: COLOR_THEMES[colorTheme].primary,
          label: 'Color Theme',
          value: COLOR_THEMES[colorTheme].label,
          onPress: () => setThemeModalVisible(true),
          isLast: true,
        })}
      </View>

      {/* PREFERENCES */}
      {renderSectionHeader('Preferences')}
      <View style={[styles.cardGroup, { backgroundColor: colors.card }]}>
        {renderRow({
          icon: 'globe',
          iconColor: '#5856D6',
          label: 'Time Zone',
          value: formatTimezone(timezone),
          onPress: () => setTzModalVisible(true),
        })}
        {renderRow({
          icon: 'water',
          iconColor: '#34C759',
          label: 'Default Watering',
          value: defaultCheckInterval,
          onPress: () => setIntervalModalVisible(true),
        })}
        {renderRow({
          icon: 'notifications',
          iconColor: '#FF3B30',
          label: 'Notifications',
          rightElement: (
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#767577', true: '#34C759' }}
            />
          ),
          isLast: true,
        })}
      </View>

      {/* HOUSEHOLD */}
      {renderSectionHeader('Household')}
      <View style={[styles.cardGroup, { backgroundColor: colors.card }]}>
        {(() => {
          const otherMembers = householdMembers.filter(m => m.uid !== user?.uid);
          const isLocked = householdEnabled && !!householdId && otherMembers.length > 0;
          return renderRow({
            icon: isLocked ? 'lock-closed' : 'people',
            iconColor: '#007AFF',
            label: 'Household Sharing',
            rightElement: (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isLocked && (
                  <Ionicons name="lock-closed" size={16} color={colors.secondaryText} />
                )}
                <Switch
                  value={householdEnabled}
                  disabled={isLocked}
                  onValueChange={(val) => {
                    if (isLocked) return;
                    if (val && !firebaseAvailable) {
                      Alert.alert(
                        'Development Build Required',
                        'Household sharing requires a development build with Firebase configured. Create an EAS build to enable this feature.',
                      );
                      return;
                    }
                    if (val) {
                      pendingHouseholdEnableRef.current = true;

                      if (isAuthenticated) {
                        void (async () => {
                          try {
                            await signOut();
                            router.push('/auth-modal');
                          } catch (e: any) {
                            pendingHouseholdEnableRef.current = false;
                            Alert.alert('Error', e.message || 'Failed to reset household sign-in.');
                          }
                        })();
                        return;
                      }

                      router.push('/auth-modal');
                      return;
                    }
                    if (!val && householdId && user) {
                      // Solo user toggling off — leave and reset household
                      Alert.alert(
                        'Leave Household',
                        'Turning off household sharing will delete your household since you are the only member. Your plants will be saved locally.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Leave & Turn Off',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await leaveCurrentHousehold(user.uid);
                                await signOut();
                                await setHouseholdEnabled(false);
                              } catch (e: any) {
                                Alert.alert('Error', e.message);
                              }
                            },
                          },
                        ],
                      );
                      return;
                    }

                    pendingHouseholdEnableRef.current = false;
                    void (async () => {
                      try {
                        await setHouseholdEnabled(false);
                        if (isAuthenticated) {
                          await signOut();
                        }
                      } catch (e: any) {
                        Alert.alert('Error', e.message || 'Failed to turn off household sharing.');
                      }
                    })();
                  }}
                  trackColor={{ false: '#767577', true: '#34C759' }}
                />
              </View>
            ),
            isLast: !householdEnabled,
          });
        })()}

        {householdEnabled && !householdId && (
          <>
            {renderRow({
              icon: 'add-circle',
              iconColor: '#34C759',
              label: 'Create Household',
              onPress: () => {
                showPrompt('Create Household', 'Enter a name for your household', async (name) => {
                  if (name.trim() && user) {
                    try {
                      await createNewHousehold(user.uid, userName || 'Member', name.trim());
                    } catch (e: any) {
                      Alert.alert('Error', e.message);
                    }
                  }
                }, '', 'Create');
              },
            })}
            {renderRow({
              icon: 'enter',
              iconColor: '#5856D6',
              label: 'Join Household',
              onPress: () => {
                showPrompt('Join Household', 'Enter the 6-character household code', async (code) => {
                  if (code.trim().length === 6 && user) {
                    try {
                      await joinExistingHousehold(user.uid, userName || 'Member', code.trim());
                      Alert.alert('Joined!', 'You are now part of the household.');
                    } catch (e: any) {
                      Alert.alert('Error', e.message);
                    }
                  } else {
                    Alert.alert('Invalid Code', 'Please enter a 6-character code.');
                  }
                }, '', 'Join');
              },
              isLast: true,
            })}
          </>
        )}

        {householdEnabled && householdId && (
          <>
            {renderRow({
              icon: 'home',
              iconColor: '#FF9500',
              label: 'Name',
              value: householdName || 'My Household',
            })}
            {renderRow({
              icon: 'key',
              iconColor: '#5856D6',
              label: 'Share Code',
              value: householdCode || '',
              onPress: () => {
                if (householdCode) {
                  Clipboard.setString(householdCode);
                  Alert.alert('Copied!', `Code ${householdCode} copied to clipboard.`);
                }
              },
            })}
            {householdMembers.length > 0 && renderRow({
              icon: 'people-circle',
              iconColor: '#34C759',
              label: 'Members',
              value: `${householdMembers.length}`,
              onPress: () => {
                refreshHouseholdMembers();
                setMembersModalVisible(true);
              },
            })}
            {renderRow({
              icon: 'color-fill',
              iconColor: householdMemberColor,
              label: 'My Calendar Color',
              rightElement: (
                <TouchableOpacity
                  onPress={() => setColorPickerVisible(true)}
                  style={[styles.colorSwatch, { backgroundColor: householdMemberColor }]}
                />
              ),
              onPress: () => setColorPickerVisible(true),
            })}
            {renderRow({
              icon: 'exit',
              iconColor: '#FF3B30',
              label: 'Leave Household',
              onPress: () => {
                Alert.alert(
                  'Leave Household',
                  'Your plants will be saved locally. If you are the last member, the household will be deleted.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Leave',
                      style: 'destructive',
                      onPress: async () => {
                        if (user) {
                          try {
                            await leaveCurrentHousehold(user.uid);
                            await signOut();
                            setHouseholdEnabled(false);
                          } catch (e: any) {
                            Alert.alert('Error', e.message);
                          }
                        }
                      },
                    },
                  ],
                );
              },
              isLast: true,
            })}
          </>
        )}
      </View>

      {/* DATA */}
      {renderSectionHeader('Data')}
      <View style={[styles.cardGroup, { backgroundColor: colors.card }]}>
        {renderRow({
          icon: 'trash',
          iconColor: colors.destructive,
          label: 'Reset All Data',
          onPress: handleResetData,
          rightElement: <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />,
          isLast: true,
        })}
      </View>

      {/* ABOUT */}
      {renderSectionHeader('About')}
      <View style={[styles.cardGroup, { backgroundColor: colors.card }]}>
        {renderRow({
          icon: 'leaf',
          iconColor: '#34C759',
          label: 'App Version',
          value: '1.0.1',
          isLast: true,
        })}
      </View>

      <View style={{ height: 40 }} />

      {/* TIMEZONE MODAL */}
      <Modal visible={tzModalVisible} animationType="slide" presentationStyle={settingsModalPresentationStyle} statusBarTranslucent={Platform.OS === 'android'}>
        <View style={[styles.modalContainer, { backgroundColor: colors.bg, paddingTop: androidModalTopInset }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => { setTzModalVisible(false); setTzSearch(''); }}>
              <Text style={[styles.modalCancel, { color: colors.tint }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Time Zone</Text>
            <View style={{ width: 60 }} />
          </View>
          <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
            <Ionicons name="search" size={16} color={colors.secondaryText} style={{ marginRight: 6 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search time zones..."
              placeholderTextColor={colors.secondaryText}
              value={tzSearch}
              onChangeText={setTzSearch}
              autoCorrect={false}
            />
          </View>
          <FlatList
            data={filteredTimezones}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.tzRow,
                  { backgroundColor: colors.card, borderBottomColor: colors.separator },
                ]}
                onPress={() => {
                  setTimezone(item);
                  setTzModalVisible(false);
                  setTzSearch('');
                }}
              >
                <Text style={[styles.tzText, { color: colors.text }]}>{formatTimezone(item)}</Text>
                {item === timezone && <Ionicons name="checkmark" size={20} color={colors.tint} />}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* INTERVAL PICKER MODAL */}
      <Modal visible={intervalModalVisible} animationType="slide" presentationStyle={settingsModalPresentationStyle} statusBarTranslucent={Platform.OS === 'android'}>
        <View style={[styles.modalContainer, { backgroundColor: colors.bg, paddingTop: androidModalTopInset }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => setIntervalModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: colors.tint }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Default Watering Interval</Text>
            <View style={{ width: 60 }} />
          </View>
          {INTERVALS.map((interval, index) => (
            <TouchableOpacity
              key={interval}
              style={[
                styles.tzRow,
                { backgroundColor: colors.card, borderBottomColor: colors.separator },
                index === INTERVALS.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => {
                setDefaultCheckInterval(interval);
                setIntervalModalVisible(false);
              }}
            >
              <Text style={[styles.tzText, { color: colors.text }]}>{interval}</Text>
              {interval === defaultCheckInterval && (
                <Ionicons name="checkmark" size={20} color={colors.tint} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* COLOR THEME MODAL */}
      <Modal visible={themeModalVisible} animationType="slide" presentationStyle={settingsModalPresentationStyle} statusBarTranslucent={Platform.OS === 'android'}>
        <View style={[styles.modalContainer, { backgroundColor: colors.bg, paddingTop: androidModalTopInset }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => setThemeModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: colors.tint }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Color Theme</Text>
            <View style={{ width: 60 }} />
          </View>
          {(Object.keys(COLOR_THEMES) as ColorThemeName[]).map((key, index, arr) => {
            const theme = COLOR_THEMES[key];
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.tzRow,
                  { backgroundColor: colors.card, borderBottomColor: colors.separator },
                  index === arr.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => {
                  setColorTheme(key);
                  setThemeModalVisible(false);
                }}
              >
                <View style={styles.themeRowLeft}>
                  <View style={[styles.themeCircle, { backgroundColor: theme.primary }]} />
                  <Text style={[styles.tzText, { color: colors.text }]}>{theme.label}</Text>
                </View>
                {key === colorTheme && (
                  <Ionicons name="checkmark" size={20} color={colors.tint} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {/* MEMBER COLOR PICKER MODAL */}
      <Modal
        visible={colorPickerVisible}
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => { setColorPickerVisible(false); setColorPickerTab('presets'); }}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => { setColorPickerVisible(false); setColorPickerTab('presets'); }}>
              <Text style={[styles.modalCancel, { color: colors.tint }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>My Calendar Color</Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Presets / Custom toggle */}
          <View style={styles.colorTabRow}>
            <View style={[styles.colorTabContainer, { backgroundColor: isDark ? 'rgba(118,118,128,0.24)' : 'rgba(118,118,128,0.12)' }]}>
              {(['presets', 'custom'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.colorTabButton,
                    colorPickerTab === tab && {
                      backgroundColor: isDark ? '#636366' : '#FFFFFF',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.15,
                      shadowRadius: 2,
                      elevation: 2,
                    },
                  ]}
                  onPress={() => setColorPickerTab(tab)}
                >
                  <Text style={[
                    styles.colorTabText,
                    { color: colorPickerTab === tab ? colors.text : colors.secondaryText,
                      fontWeight: colorPickerTab === tab ? '600' : '400' },
                  ]}>
                    {tab === 'presets' ? 'Presets' : 'Custom'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {colorPickerTab === 'presets' ? (
            <ScrollView contentContainerStyle={styles.colorGrid}>
              {MEMBER_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    color.toUpperCase() === householdMemberColor?.toUpperCase() && styles.colorOptionSelected,
                  ]}
                  onPress={() => {
                    if (user) {
                      setHouseholdMemberColor(user.uid, color);
                    }
                    setColorPickerVisible(false);
                    setColorPickerTab('presets');
                  }}
                >
                  {color.toUpperCase() === householdMemberColor?.toUpperCase() && (
                    <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              ))}

              {/* User's own custom picked color */}
              {myCustomColor && (
                <>
                  <View style={styles.customColorDivider}>
                    <Text style={[styles.customColorLabel, { color: colors.secondaryText }]}>Custom Picked Color</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.colorOption,
                      { backgroundColor: myCustomColor },
                      styles.colorOptionSelected,
                    ]}
                    onPress={() => {
                      setColorPickerVisible(false);
                      setColorPickerTab('presets');
                    }}
                  >
                    <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </>
              )}

              {/* Locked custom colors from other household members */}
              {lockedCustomColors.length > 0 && (
                <View style={styles.customColorDivider}>
                  <Text style={[styles.customColorLabel, { color: colors.secondaryText }]}>Member Colors</Text>
                </View>
              )}
              {lockedCustomColors.map(({ color, name }) => (
                <View key={color} style={styles.lockedColorWrapper}>
                  <View style={[styles.colorOption, { backgroundColor: color, opacity: 0.6 }]}>
                    <Ionicons name="lock-closed" size={18} color="rgba(255,255,255,0.7)" />
                  </View>
                  <Text style={[styles.lockedColorName, { color: colors.secondaryText }]} numberOfLines={1}>
                    {name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.customPickerContainer} {...customTabGestureBlocker.panHandlers}>
              <SimpleColorPicker
                value={customPickerColor}
                onColorChange={setCustomPickerColor}
              />

              <View style={[styles.previewCard, { backgroundColor: colors.card }]}>
                <View style={[styles.previewSwatch, { backgroundColor: customPickerColor }]} />
                <View style={styles.previewTextCol}>
                  <Text style={[styles.previewLabel, { color: colors.secondaryText }]}>Selected Color</Text>
                  <Text style={[styles.previewHex, { color: colors.text }]}>{customPickerColor.toUpperCase()}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.customPickerConfirm, { backgroundColor: colors.tint }]}
                onPress={() => {
                  if (user) {
                    setHouseholdMemberColor(user.uid, customPickerColor);
                  }
                  setColorPickerVisible(false);
                  setColorPickerTab('presets');
                }}
              >
                <Text style={styles.customPickerConfirmText}>Select Color</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* HOUSEHOLD MEMBERS MODAL */}
      <Modal visible={membersModalVisible} animationType="slide" presentationStyle={settingsModalPresentationStyle} statusBarTranslucent={Platform.OS === 'android'}>
        <View style={[styles.modalContainer, { backgroundColor: colors.bg, paddingTop: androidModalTopInset }]}> 
          <View style={[styles.modalHeader, { backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => setMembersModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: colors.tint }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Household Members</Text>
            <View style={{ width: 60 }} />
          </View>
          <View style={styles.membersListContainer}>
            {householdMembers.map((member, index) => {
              const isYou = member.uid === user?.uid;
              const joinDate = member.joinedAt
                ? new Date(member.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : null;
              return (
                <View
                  key={member.uid}
                  style={[
                    styles.memberRow,
                    { backgroundColor: colors.card },
                    index !== householdMembers.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                  ]}
                >
                  <View style={[styles.memberColorDot, { backgroundColor: member.color || '#007AFF' }]} />
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {member.displayName}{isYou ? ' (You)' : ''}
                    </Text>
                    {joinDate && (
                      <Text style={[styles.memberJoinDate, { color: colors.secondaryText }]}>
                        Joined {joinDate}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            {householdMembers.length === 0 && (
              <Text style={[styles.noMembersText, { color: colors.secondaryText }]}>
                No members found
              </Text>
            )}
          </View>
        </View>
      </Modal>

      {/* CROSS-PLATFORM PROMPT MODAL */}
      <Modal
        visible={promptConfig.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPromptConfig(p => ({ ...p, visible: false }))}
      >
        <View style={styles.promptOverlay}>
          <View style={[styles.promptBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.promptTitle, { color: colors.text }]}>{promptConfig.title}</Text>
            <Text style={[styles.promptMessage, { color: colors.text, opacity: 0.7 }]}>{promptConfig.message}</Text>
            <TextInput
              style={[styles.promptInput, { color: colors.text, borderColor: colors.tint, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              value={promptValue}
              onChangeText={setPromptValue}
              autoFocus
              placeholderTextColor={isDark ? '#888' : '#999'}
            />
            <View style={styles.promptButtons}>
              <TouchableOpacity style={styles.promptBtn} onPress={() => setPromptConfig(p => ({ ...p, visible: false }))}>
                <Text style={[styles.promptBtnText, { color: colors.tint }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.promptBtn} onPress={() => {
                setPromptConfig(p => ({ ...p, visible: false }));
                promptConfig.onSubmit(promptValue);
              }}>
                <Text style={[styles.promptBtnText, { color: colors.tint, fontWeight: '600' }]}>{promptConfig.submitLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 8,
    maxWidth: 600,
    alignSelf: 'center' as const,
    width: '100%' as const,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: -0.08,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  cardGroup: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 17,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowValue: {
    fontSize: 17,
    marginRight: 4,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(118,118,128,0.12)',
    borderRadius: 8,
    padding: 2,
  },
  segmentButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 7,
  },
  segmentButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalCancel: {
    fontSize: 17,
    width: 60,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  tzRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tzText: {
    fontSize: 17,
  },
  themeRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themeCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  colorTabRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'center',
  },
  colorTabContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  colorTabButton: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 7,
  },
  colorTabText: {
    fontSize: 13,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 16,
    justifyContent: 'center',
  },
  colorOption: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  lockedColorWrapper: {
    alignItems: 'center',
    width: 56,
  },
  lockedColorName: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  customPickerContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 30,
    paddingHorizontal: 20,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    width: '100%',
    gap: 14,
  },
  previewTextCol: {
    flex: 1,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  previewSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  previewHex: {
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  customPickerConfirm: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  customPickerConfirmText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  customColorDivider: {
    width: '100%',
    paddingTop: 12,
    paddingBottom: 4,
  },
  customColorLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  membersListContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 10,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  memberColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 14,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 17,
    fontWeight: '500',
  },
  memberJoinDate: {
    fontSize: 13,
    marginTop: 2,
  },
  noMembersText: {
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 30,
  },
  promptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  promptBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 14,
    padding: 20,
  },
  promptTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  promptMessage: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  promptInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  promptButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
  },
  promptBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  promptBtnText: {
    fontSize: 17,
  },
});
