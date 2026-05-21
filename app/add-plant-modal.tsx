import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePlants } from '@/contexts/PlantContext';
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

const GENDERS = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
  { label: 'Unknown', value: 'Unknown' },
];

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

export default function AddPlantModal() {
  const router = useRouter();
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
  const [birthday, setBirthday] = useState(new Date().toISOString().split('T')[0]);
  const [intervalYears, setIntervalYears] = useState('');
  const [intervalMonths, setIntervalMonths] = useState('');
  const [intervalDays, setIntervalDays] = useState('');
  const [gender, setGender] = useState('Unknown');
  const [waterDay, setWaterDay] = useState<number | undefined>(undefined);
  const [reminderHour, setReminderHour] = useState(9);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  const isEditing = !!params.editId;
  const editId = params.editId as string;

  const setIntervalStateFromValue = (value: string) => {
    const parts = parseCheckIntervalParts(value);
    setIntervalYears(getIntervalInputValue(parts.years));
    setIntervalMonths(getIntervalInputValue(parts.months));
    setIntervalDays(getIntervalInputValue(parts.days));
  };

  const handleIntervalInputChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (value: string) => {
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
    if (isEditing && editId) {
      const plant = plants.find(p => p.id === editId);
      if (plant) {
        setPhotoUri(plant.photoUri);
        setName(plant.name);
        setLocation(plant.location);
        setBirthday(plant.birthday);
        setIntervalStateFromValue(plant.checkInterval);
        setGender(plant.gender);
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

    try {
      const storedPhotoUri = await persistPlantPhoto(selectedPhotoUri);
      setPhotoUri(storedPhotoUri);

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
      Alert.alert('Error', 'Failed to save the photo for this plant.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const pickImage = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePicture = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to take a photo');
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
      Alert.alert('Error', 'Failed to take picture');
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
          gender: gender as 'Male' | 'Female' | 'Unknown',
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
          gender: gender as 'Male' | 'Female' | 'Unknown',
          waterDay: intervalTotalDays >= 7 ? waterDay : undefined,
          reminderTime: `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`,
        });
      }

      router.back();
    } catch (error) {
      Alert.alert('Error', isEditing ? 'Failed to update plant' : 'Failed to add plant');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
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
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { maxWidth: 600, alignSelf: 'center', width: '100%' }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}
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
              style={[styles.textInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="e.g. Peace Lily"
              placeholderTextColor={colors.placeholder}
              value={name}
              onChangeText={setName}
              editable={!isSubmitting}
              selectionColor={colors.primary}
            />
          </View>

          {/* Location */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Plant Location</ThemedText>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="e.g. Living Room Window"
              placeholderTextColor={colors.placeholder}
              value={location}
              onChangeText={setLocation}
              editable={!isSubmitting}
              selectionColor={colors.primary}
            />
          </View>

          {/* Birthday */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Birthday (YYYY-MM-DD)</ThemedText>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
              placeholder="2024-01-20"
              placeholderTextColor={colors.placeholder}
              value={birthday}
              onChangeText={setBirthday}
              editable={!isSubmitting}
              selectionColor={colors.primary}
            />
          </View>

          {/* Check Interval Inputs */}
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Watering Reminder Interval</ThemedText>
            <ThemedText style={[styles.sublabel, { color: colors.secondaryText }]}>Use any combination of years, months, and days. At least one value must be greater than 0.</ThemedText>
            <View style={styles.intervalRow}>
              <View style={[styles.intervalCard, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                <TextInput
                  style={[styles.intervalInput, { color: colors.text }]}
                  value={intervalYears}
                  onChangeText={handleIntervalInputChange(setIntervalYears)}
                  editable={!isSubmitting}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.primary}
                />
                <ThemedText style={[styles.intervalLabel, { color: colors.secondaryText }]}>Years</ThemedText>
              </View>
              <View style={[styles.intervalCard, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                <TextInput
                  style={[styles.intervalInput, { color: colors.text }]}
                  value={intervalMonths}
                  onChangeText={handleIntervalInputChange(setIntervalMonths)}
                  editable={!isSubmitting}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.primary}
                />
                <ThemedText style={[styles.intervalLabel, { color: colors.secondaryText }]}>Months</ThemedText>
              </View>
              <View style={[styles.intervalCard, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
                <TextInput
                  style={[styles.intervalInput, { color: colors.text }]}
                  value={intervalDays}
                  onChangeText={handleIntervalInputChange(setIntervalDays)}
                  editable={!isSubmitting}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.primary}
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
                onValueChange={setGender}
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
                    onPress={() => setWaterDay(waterDay === idx ? undefined : idx)}
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
                    onValueChange={setReminderHour}
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
                    onValueChange={setReminderMinute}
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
