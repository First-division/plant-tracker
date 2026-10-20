import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  View,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Modal,
  Linking,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PlantGender, usePlants } from '@/contexts/PlantContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CheckIntervalParts,
  checkIntervalPartsToDays,
  formatCheckInterval,
  hasCheckIntervalValue,
  parseCheckIntervalParts,
} from '@/services/plant-intervals';
import { persistPlantPhoto } from '@/services/plant-photos';
import { getThemeColors } from '@/constants/theme';

const GENDERS: { label: string; value: PlantGender }[] = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
  { label: 'They/them', value: 'They/them' },
  { label: 'Other', value: 'Other' },
];

/** Format a date as a local YYYY-MM-DD string (not UTC, so late-evening dates don't shift). */
function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parse a stored YYYY-MM-DD birthday as a local date; returns null when it is malformed or impossible. */
function parseDateString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const isReal = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isReal ? date : null;
}

type PhotoError = { message: string; retry?: () => void; openSettings?: boolean };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getIntervalInputValue(value: number): string {
  return value > 0 ? String(value) : '';
}

function getIntervalPartsFromInput(years: string, months: string, days: string): CheckIntervalParts {
  return {
    years: parseInt(years || '0', 10) || 0,
    months: parseInt(months || '0', 10) || 0,
    days: parseInt(days || '0', 10) || 0,
  };
}

/** Create a plant or edit an existing plant using the route's optional plant identifier. */
export default function AddPlantModal() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { addPlant, updatePlant, plants, defaultCheckInterval, colorTheme } = usePlants();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = getThemeColors(colorTheme, isDark);

  const colors = {
    bg: theme.screenBg,
    card: theme.cardBg,
    text: theme.text,
    secondaryText: theme.secondaryText,
    primary: theme.primary,
    primaryLight: theme.primaryLight,
    inputBg: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
    inputBorder: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(17, 24, 28, 0.1)',
    placeholder: isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(60, 60, 67, 0.55)',
    mutedSurface: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.68)',
    border: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(17, 24, 28, 0.08)',
  };

  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [birthday, setBirthday] = useState(toDateString(new Date()));
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [photoError, setPhotoError] = useState<PhotoError | null>(null);
  const loadedEditRef = useRef(false);
  const skipLeaveConfirmRef = useRef(false);
  const [intervalYears, setIntervalYears] = useState('');
  const [intervalMonths, setIntervalMonths] = useState('');
  const [intervalDays, setIntervalDays] = useState('');
  const [gender, setGender] = useState<PlantGender>('They/them');
  const [waterDay, setWaterDay] = useState<number | undefined>(undefined);
  const [reminderHour, setReminderHour] = useState(9);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const formScrollRef = useRef<ScrollView>(null);
  const focusedInputRef = useRef<TextInput | null>(null);
  const keyboardTopRef = useRef<number | null>(null);
  const scrollOffsetYRef = useRef(0);
  const nameInputRef = useRef<TextInput>(null);
  const locationInputRef = useRef<TextInput>(null);
  const intervalYearsInputRef = useRef<TextInput>(null);
  const intervalMonthsInputRef = useRef<TextInput>(null);
  const intervalDaysInputRef = useRef<TextInput>(null);

  const isEditing = !!params.editId;
  const editId = params.editId as string;

  /** Wrap a state setter so any user change marks the form as having unsaved edits. */
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setIsDirty(true);
    setter(value);
  };

  usePreventRemove(isDirty && !isSubmitting, ({ data }) => {
    if (skipLeaveConfirmRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert('Discard changes?', 'You have unsaved changes to this plant. If you leave now they will be lost.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const scrollInputAboveKeyboard = (input: TextInput | null) => {
    if (!input || !formScrollRef.current) {
      return;
    }

    const keyboardTop = keyboardTopRef.current;
    if (keyboardTop == null) {
      return;
    }

    input.measureInWindow((_x, y, _w, h) => {
      const inputBottom = y + h;
      const desiredBottom = keyboardTop - 24;
      const overlap = inputBottom - desiredBottom;

      if (overlap <= 0) {
        return;
      }

      formScrollRef.current?.scrollTo({
        y: Math.max(0, scrollOffsetYRef.current + overlap + 8),
        animated: true,
      });
    });
  };

  const handleInputFocus = (input: TextInput | null) => {
    focusedInputRef.current = input;
    requestAnimationFrame(() => {
      scrollInputAboveKeyboard(input);
    });
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const changeEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      requestAnimationFrame(() => {
        scrollInputAboveKeyboard(focusedInputRef.current);
      });
    });

    const changeSub = Keyboard.addListener(changeEvent, (event) => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      requestAnimationFrame(() => {
        scrollInputAboveKeyboard(focusedInputRef.current);
      });
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTopRef.current = null;
    });

    return () => {
      showSub.remove();
      changeSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleFormScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
  };

  const setIntervalStateFromValue = (value: string) => {
    const parts = parseCheckIntervalParts(value);
    setIntervalYears(getIntervalInputValue(parts.years));
    setIntervalMonths(getIntervalInputValue(parts.months));
    setIntervalDays(getIntervalInputValue(parts.days));
  };

  const handleIntervalInputChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (value: string) => {
    setIsDirty(true);
    setter(value.replace(/[^0-9]/g, ''));
  };

  const intervalParts = getIntervalPartsFromInput(intervalYears, intervalMonths, intervalDays);
  const intervalSummary = formatCheckInterval(intervalParts);
  const intervalTotalDays = checkIntervalPartsToDays(intervalParts);

  useEffect(() => {
    if (!isEditing) {
      setIntervalStateFromValue(defaultCheckInterval);
    }
  }, [defaultCheckInterval, isEditing]);

  useEffect(() => {
    if (isEditing && editId && !loadedEditRef.current) {
      const plant = plants.find(p => p.id === editId);
      if (plant) {
        loadedEditRef.current = true;
        setPhotoUri(plant.photoUri);
        setName(plant.name);
        setLocation(plant.location);
        setBirthday(plant.birthday);
        setIntervalStateFromValue(plant.checkInterval);
        setGender(plant.gender === 'Unknown' ? 'They/them' : plant.gender);
        if (plant.waterDay !== undefined) setWaterDay(plant.waterDay);
        if (plant.reminderTime) {
          const [h, m] = plant.reminderTime.split(':').map(Number);
          setReminderHour(h);
          setReminderMinute(m);
        }
      }
    }
  }, [isEditing, editId, plants]);

  useEffect(() => {
    if (intervalTotalDays < 7 && waterDay !== undefined) {
      setWaterDay(undefined);
    }
  }, [intervalTotalDays, waterDay]);

  const savePhotoToCameraRoll = async (storedPhotoUri: string) => {
    try {
      const MediaLibrary = await import('expo-media-library');
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Photo library permission is required if you want to save a copy to your camera roll.',
        );
        return;
      }

      await MediaLibrary.saveToLibraryAsync(storedPhotoUri);
      Alert.alert('Saved', 'A copy of the plant photo was saved to your camera roll.');
    } catch (error) {
      console.error('Error saving photo to camera roll:', error);
      Alert.alert(
        'Camera Roll Unavailable',
        'Saving to camera roll is unavailable in this build. Rebuild your app to include expo-media-library support.',
      );
    }
  };

  const persistSelectedPhoto = async (selectedPhotoUri: string, promptToSaveToCameraRoll = false) => {
    setIsProcessingPhoto(true);
    setPhotoError(null);

    try {
      const storedPhotoUri = await persistPlantPhoto(selectedPhotoUri);
      setPhotoUri(storedPhotoUri);
      setIsDirty(true);

      if (promptToSaveToCameraRoll) {
        Alert.alert(
          'Save to Camera Roll?',
          'Do you want to save this plant photo to your camera roll too?',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Save',
              onPress: () => {
                void savePhotoToCameraRoll(storedPhotoUri);
              },
            },
          ],
        );
      }
    } catch (error) {
      console.error('Error persisting plant photo:', error);
      setPhotoError({
        message: 'We could not save that photo. Check that your device has free storage, then try again.',
        retry: () => void persistSelectedPhoto(selectedPhotoUri, promptToSaveToCameraRoll),
      });
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const pickImage = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPhotoError(null);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        await persistSelectedPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setPhotoError({
        message: 'We could not open your photo library. Please try again.',
        retry: () => void pickImage(),
      });
    }
  };

  const takePicture = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPhotoError(null);

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setPhotoError({
          message: 'Camera access is turned off for PlantCare. Allow it in Settings to take a photo, or pick one from your library.',
          openSettings: true,
        });
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        await persistSelectedPhoto(result.assets[0].uri, true);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      setPhotoError({
        message: 'We could not open the camera. Please try again, or pick a photo instead.',
        retry: () => void takePicture(),
      });
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter a plant name');
      return;
    }

    if (!location.trim()) {
      Alert.alert('Validation Error', 'Please enter a location');
      return;
    }

    const birthdayDate = parseDateString(birthday);
    if (!birthdayDate) {
      Alert.alert('Validation Error', 'Please choose a valid birthday.');
      return;
    }
    if (birthdayDate.getTime() > Date.now()) {
      Alert.alert('Validation Error', 'A plant\u2019s birthday cannot be in the future.');
      return;
    }

    if (!hasCheckIntervalValue(intervalParts)) {
      Alert.alert('Validation Error', 'Please set at least one watering interval value.');
      return;
    }

    if (isProcessingPhoto) {
      Alert.alert('Photo still saving', 'Please wait for the photo to finish saving before submitting the plant.');
      return;
    }

    const checkInterval = formatCheckInterval(intervalParts);

    setIsSubmitting(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (isEditing) {
        await updatePlant(editId, {
          name: name.trim(),
          location: location.trim(),
          photoUri,
          birthday,
          checkInterval,
          gender,
          waterDay: intervalTotalDays >= 7 ? waterDay : undefined,
          reminderTime: `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`,
        });
      } else {
        await addPlant({
          name: name.trim(),
          location: location.trim(),
          photoUri,
          birthday,
          checkInterval,
          gender,
          waterDay: intervalTotalDays >= 7 ? waterDay : undefined,
          reminderTime: `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`,
        });
      }

      skipLeaveConfirmRef.current = true;
      router.back();
    } catch (error) {
      Alert.alert('Error', isEditing ? 'Failed to update plant' : 'Failed to add plant');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBirthdayChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowBirthdayPicker(false);
    }
    if (event.type === 'dismissed' || !selected) {
      return;
    }
    setIsDirty(true);
    setBirthday(toDateString(selected));
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView
        ref={formScrollRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { maxWidth: 600, alignSelf: 'center', width: '100%' }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        onScroll={handleFormScroll}
        scrollEventThrottle={16}
      >
        {/* Header */}
        {/* <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Add New Plant</ThemedText>
        </View> */}

        {/* Photo Section */}
        <View style={styles.photoSection}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={[styles.photoPreview, { backgroundColor: colors.mutedSurface }]} />
          ) : (
            <ThemedView style={[styles.photoPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ThemedText style={[styles.placeholderLabel, { color: colors.secondaryText }]}>No photo yet</ThemedText>
            </ThemedView>
          )}

          <View style={styles.photoButtonsRow}>
            <TouchableOpacity
              style={[styles.photoButton, { backgroundColor: colors.primary }]}
              onPress={takePicture}
              disabled={isSubmitting || isProcessingPhoto}
            >
              <ThemedText style={[styles.photoButtonText, { color: '#FFFFFF' }]}>📷 Take Photo</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.photoButton, { backgroundColor: colors.primary }]}
              onPress={pickImage}
              disabled={isSubmitting || isProcessingPhoto}
            >
              <ThemedText style={[styles.photoButtonText, { color: '#FFFFFF' }]}>🖼️ Pick Image</ThemedText>
            </TouchableOpacity>
          </View>
          {!!photoUri && (
            <TouchableOpacity
              style={styles.removePhotoButton}
              onPress={() => {
                setIsDirty(true);
                setPhotoUri(undefined);
                setPhotoError(null);
              }}
              disabled={isSubmitting || isProcessingPhoto}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <ThemedText style={styles.removePhotoText}>Remove photo</ThemedText>
            </TouchableOpacity>
          )}
          {photoError && (
            <View style={[styles.photoErrorBox, { borderColor: '#FF3B30' }]}>
              <ThemedText style={[styles.photoErrorText, { color: colors.text }]}>{photoError.message}</ThemedText>
              <View style={styles.photoErrorActions}>
                {photoError.retry && (
                  <TouchableOpacity onPress={photoError.retry} accessibilityRole="button">
                    <ThemedText style={[styles.photoErrorAction, { color: colors.primary }]}>Try again</ThemedText>
                  </TouchableOpacity>
                )}
                {photoError.openSettings && (
                  <TouchableOpacity onPress={() => void Linking.openSettings()} accessibilityRole="button">
                    <ThemedText style={[styles.photoErrorAction, { color: colors.primary }]}>Open Settings</ThemedText>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setPhotoError(null)} accessibilityRole="button">
                  <ThemedText style={[styles.photoErrorAction, { color: colors.secondaryText }]}>Dismiss</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {isProcessingPhoto && (
            <View style={styles.photoSavingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <ThemedText style={[styles.photoSavingText, { color: colors.secondaryText }]}>Saving photo...</ThemedText>
            </View>
          )}
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          {/* Plant Name */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Plant Name</ThemedText>
            <TextInput
              ref={nameInputRef}
              style={[styles.textInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="e.g. Peace Lily"
              placeholderTextColor={colors.placeholder}
              value={name}
              onChangeText={edit(setName)}
              editable={!isSubmitting}
              selectionColor={colors.primary}
              onFocus={() => handleInputFocus(nameInputRef.current)}
              onBlur={() => { focusedInputRef.current = null; }}
            />
          </View>

          {/* Location */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Plant Location</ThemedText>
            <TextInput
              ref={locationInputRef}
              style={[styles.textInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="e.g. Living Room Window"
              placeholderTextColor={colors.placeholder}
              value={location}
              onChangeText={edit(setLocation)}
              editable={!isSubmitting}
              selectionColor={colors.primary}
              onFocus={() => handleInputFocus(locationInputRef.current)}
              onBlur={() => { focusedInputRef.current = null; }}
            />
          </View>

          {/* Birthday */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Birthday</ThemedText>
            <TouchableOpacity
              style={[styles.textInput, styles.dateField, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              onPress={() => setShowBirthdayPicker(true)}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Choose birthday"
            >
              <ThemedText style={{ color: colors.text, fontSize: 16 }}>
                {parseDateString(birthday)?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) ?? 'Choose a date'}
              </ThemedText>
              <ThemedText style={{ color: colors.secondaryText }}>📅</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Check Interval Inputs */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Watering Reminder Interval</ThemedText>
            <ThemedText style={[styles.sublabel, { color: colors.secondaryText }]}>Use any combination of years, months, and days. At least one value must be greater than 0.</ThemedText>
            <View style={styles.intervalRow}>
              <View style={[styles.intervalCard, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                <TextInput
                  ref={intervalYearsInputRef}
                  style={[styles.intervalInput, { color: colors.text }]}
                  value={intervalYears}
                  onChangeText={handleIntervalInputChange(setIntervalYears)}
                  editable={!isSubmitting}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.primary}
                  onFocus={() => handleInputFocus(intervalYearsInputRef.current)}
                  onBlur={() => { focusedInputRef.current = null; }}
                />
                <ThemedText style={[styles.intervalLabel, { color: colors.secondaryText }]}>Years</ThemedText>
              </View>
              <View style={[styles.intervalCard, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                <TextInput
                  ref={intervalMonthsInputRef}
                  style={[styles.intervalInput, { color: colors.text }]}
                  value={intervalMonths}
                  onChangeText={handleIntervalInputChange(setIntervalMonths)}
                  editable={!isSubmitting}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.primary}
                  onFocus={() => handleInputFocus(intervalMonthsInputRef.current)}
                  onBlur={() => { focusedInputRef.current = null; }}
                />
                <ThemedText style={[styles.intervalLabel, { color: colors.secondaryText }]}>Months</ThemedText>
              </View>
              <View style={[styles.intervalCard, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                <TextInput
                  ref={intervalDaysInputRef}
                  style={[styles.intervalInput, { color: colors.text }]}
                  value={intervalDays}
                  onChangeText={handleIntervalInputChange(setIntervalDays)}
                  editable={!isSubmitting}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.primary}
                  onFocus={() => handleInputFocus(intervalDaysInputRef.current)}
                  onBlur={() => { focusedInputRef.current = null; }}
                />
                <ThemedText style={[styles.intervalLabel, { color: colors.secondaryText }]}>Days</ThemedText>
              </View>
            </View>
            <ThemedText style={[styles.intervalPreview, { color: colors.secondaryText }]}>
              {intervalSummary ? `Every ${intervalSummary}` : 'Enter an interval to schedule reminders'}
            </ThemedText>
          </View>

          {/* Gender Dropdown */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Gender</ThemedText>
            <View style={[styles.pickerContainer, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Picker
                selectedValue={gender}
                onValueChange={edit(setGender)}
                enabled={!isSubmitting}
                style={[styles.picker, { color: colors.text }]}
              >
                {GENDERS.map((g) => (
                  <Picker.Item key={g.value} label={g.label} value={g.value} />
                ))}
              </Picker>
            </View>
          </View>

          {/* Preferred Watering Day — only shown for intervals >= 7 days */}
          {intervalTotalDays >= 7 && (
            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.label, { color: colors.text }]}>Preferred Watering Day</ThemedText>
              <ThemedText style={[styles.sublabel, { color: colors.secondaryText }]}>Which day of the week should this plant be watered?</ThemedText>
              <View style={styles.dayChipRow}>
                {DAY_LABELS.map((label, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.dayChip,
                      { backgroundColor: colors.card, borderColor: colors.inputBorder },
                      waterDay === idx && styles.dayChipActive,
                      waterDay === idx && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => { setIsDirty(true); setWaterDay(waterDay === idx ? undefined : idx); }}
                    disabled={isSubmitting}
                  >
                    <ThemedText style={[
                      styles.dayChipText,
                      { color: colors.secondaryText },
                      waterDay === idx && styles.dayChipTextActive,
                    ]}>{label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Reminder Time */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Reminder Time</ThemedText>
            <ThemedText style={[styles.sublabel, { color: colors.secondaryText }]}>What time should you be reminded to water?</ThemedText>
            <View style={styles.timePickerRow}>
              <View style={styles.timePickerCol}>
                <ThemedText style={[styles.timePickerLabel, { color: colors.secondaryText }]}>Hour</ThemedText>
                <View style={[styles.timePickerContainer, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                  <Picker
                    selectedValue={reminderHour}
                    onValueChange={edit(setReminderHour)}
                    enabled={!isSubmitting}
                    style={[styles.picker, { color: colors.text }]}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <Picker.Item
                        key={i}
                        label={i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                        value={i}
                      />
                    ))}
                  </Picker>
                </View>
              </View>
              <View style={styles.timePickerCol}>
                <ThemedText style={[styles.timePickerLabel, { color: colors.secondaryText }]}>Minute</ThemedText>
                <View style={[styles.timePickerContainer, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                  <Picker
                    selectedValue={reminderMinute}
                    onValueChange={edit(setReminderMinute)}
                    enabled={!isSubmitting}
                    style={[styles.picker, { color: colors.text }]}
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <Picker.Item key={m} label={String(m).padStart(2, '0')} value={m} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' ? (
        <Modal visible={showBirthdayPicker} transparent animationType="fade" onRequestClose={() => setShowBirthdayPicker(false)}>
          <View style={styles.pickerBackdrop}>
            <View style={[styles.pickerCard, { backgroundColor: colors.card }]}>
              <ThemedText style={[styles.pickerTitle, { color: colors.text }]}>Birthday</ThemedText>
              <DateTimePicker
                value={parseDateString(birthday) ?? new Date()}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={handleBirthdayChange}
                themeVariant={isDark ? 'dark' : 'light'}
              />
              <TouchableOpacity style={styles.pickerDone} onPress={() => setShowBirthdayPicker(false)}>
                <ThemedText style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>Done</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : (
        showBirthdayPicker && (
          <DateTimePicker
            value={parseDateString(birthday) ?? new Date()}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={handleBirthdayChange}
          />
        )
      )}

      {/* Bottom Action Buttons */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <View style={{ flexDirection: 'row', gap: 12, maxWidth: 600, alignSelf: 'center', width: '100%' }}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton, { backgroundColor: colors.primaryLight, borderColor: colors.inputBorder }]}
          onPress={handleCancel}
          disabled={isSubmitting}
        >
          <ThemedText style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.submitButton, { backgroundColor: colors.primary }]}
          onPress={handleSubmit}
          disabled={isSubmitting || isProcessingPhoto}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <ThemedText style={[styles.submitButtonText, { color: '#FFFFFF' }]}>
              {isEditing ? 'Save Plant' : 'Add Plant'}
            </ThemedText>
          )}
        </TouchableOpacity>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: 20,
  },

  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },

  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFF',
  },

  photoSection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },

  photoPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 280,
    borderRadius: 16,
    marginBottom: 12,
  },

  photoPlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 280,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
  },

  placeholderText: {
    fontSize: 64,
    marginBottom: 8,
  },

  placeholderLabel: {
    fontSize: 25,
  },

  photoButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },

  photoButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  photoButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },

  removePhotoButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  removePhotoText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },

  photoErrorBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },

  photoErrorText: {
    fontSize: 13,
    lineHeight: 18,
  },

  photoErrorActions: {
    flexDirection: 'row',
    gap: 20,
  },

  photoErrorAction: {
    fontSize: 14,
    fontWeight: '700',
  },

  dateField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  pickerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  pickerCard: {
    borderRadius: 18,
    padding: 16,
  },

  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },

  pickerDone: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  photoSavingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  photoSavingText: {
    fontSize: 13,
    fontWeight: '500',
  },

  form: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  fieldGroup: {
    marginBottom: 20,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },

  textInput: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
  },

  pickerContainer: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    height: 90,
  },

  picker: {},

  intervalRow: {
    flexDirection: 'row',
    gap: 12,
  },

  intervalCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },

  intervalInput: {
    width: '100%',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    paddingVertical: 6,
  },

  intervalLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },

  intervalPreview: {
    fontSize: 12,
    marginTop: 10,
  },

  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },

  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  cancelButton: {
    borderWidth: 1,
  },

  cancelButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },

  submitButton: {},

  submitButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },

  sublabel: {
    fontSize: 12,
    marginBottom: 10,
  },

  dayChipRow: {
    flexDirection: 'row',
    gap: 6,
  },

  dayChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },

  dayChipActive: {},

  dayChipText: {
    fontSize: 13,
    fontWeight: '600',
  },

  dayChipTextActive: {
    color: '#FFF',
  },

  timePickerRow: {
    flexDirection: 'row',
    gap: 12,
  },

  timePickerCol: {
    flex: 1,
  },

  timePickerLabel: {
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'center',
  },

  timePickerContainer: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    height: 100,
  },

});
