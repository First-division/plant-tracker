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
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePlants } from '@/app/context/PlantContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckIntervalParts,
  checkIntervalPartsToDays,
  formatCheckInterval,
  hasCheckIntervalValue,
  parseCheckIntervalParts,
} from '@/services/plant-intervals';

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
  const { addPlant, updatePlant, plants, defaultCheckInterval } = usePlants();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

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
        setPhotoUri(result.assets[0].uri);
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
        setPhotoUri(result.assets[0].uri);
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

      router.dismiss();
    } catch (error) {
      Alert.alert('Error', isEditing ? 'Failed to update plant' : 'Failed to add plant');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.dismiss();
  };

  return (
    <ThemedView style={styles.container}>
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
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          ) : (
            <ThemedView style={styles.photoPlaceholder}>
              <ThemedText style={styles.placeholderLabel}>No photo yet</ThemedText>
            </ThemedView>
          )}

          <View style={styles.photoButtonsRow}>
            <TouchableOpacity style={styles.photoButton} onPress={takePicture}>
              <ThemedText style={styles.photoButtonText}>📷 Take Photo</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
              <ThemedText style={styles.photoButtonText}>🖼️ Pick Image</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          {/* Plant Name */}
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Plant Name</ThemedText>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Peace Lily"
              placeholderTextColor="#888"
              value={name}
              onChangeText={setName}
              editable={!isSubmitting}
            />
          </View>

          {/* Location */}
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Plant Location</ThemedText>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Living Room Window"
              placeholderTextColor="#888"
              value={location}
              onChangeText={setLocation}
              editable={!isSubmitting}
            />
          </View>

          {/* Birthday */}
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Birthday (YYYY-MM-DD)</ThemedText>
            <TextInput
              style={styles.textInput}
              placeholder="2024-01-20"
              placeholderTextColor="#888"
              value={birthday}
              onChangeText={setBirthday}
              editable={!isSubmitting}
            />
          </View>

          {/* Check Interval Inputs */}
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Watering Reminder Interval</ThemedText>
            <ThemedText style={styles.sublabel}>Use any combination of years, months, and days. At least one value must be greater than 0.</ThemedText>
            <View style={styles.intervalRow}>
              <View style={styles.intervalCard}>
                <TextInput
                  style={styles.intervalInput}
                  value={intervalYears}
                  onChangeText={handleIntervalInputChange(setIntervalYears)}
                  editable={!isSubmitting}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="0"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                />
                <ThemedText style={styles.intervalLabel}>Years</ThemedText>
              </View>
              <View style={styles.intervalCard}>
                <TextInput
                  style={styles.intervalInput}
                  value={intervalMonths}
                  onChangeText={handleIntervalInputChange(setIntervalMonths)}
                  editable={!isSubmitting}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="0"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                />
                <ThemedText style={styles.intervalLabel}>Months</ThemedText>
              </View>
              <View style={styles.intervalCard}>
                <TextInput
                  style={styles.intervalInput}
                  value={intervalDays}
                  onChangeText={handleIntervalInputChange(setIntervalDays)}
                  editable={!isSubmitting}
                  keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                  placeholder="0"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                />
                <ThemedText style={styles.intervalLabel}>Days</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.intervalPreview}>
              {intervalSummary ? `Every ${intervalSummary}` : 'Enter an interval to schedule reminders'}
            </ThemedText>
          </View>

          {/* Gender Dropdown */}
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Gender</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={gender}
                onValueChange={setGender}
                enabled={!isSubmitting}
                style={styles.picker}
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
              <ThemedText style={styles.label}>Preferred Watering Day</ThemedText>
              <ThemedText style={styles.sublabel}>Which day of the week should this plant be watered?</ThemedText>
              <View style={styles.dayChipRow}>
                {DAY_LABELS.map((label, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.dayChip,
                      waterDay === idx && styles.dayChipActive,
                    ]}
                    onPress={() => setWaterDay(waterDay === idx ? undefined : idx)}
                    disabled={isSubmitting}
                  >
                    <ThemedText style={[
                      styles.dayChipText,
                      waterDay === idx && styles.dayChipTextActive,
                    ]}>{label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Reminder Time */}
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Reminder Time</ThemedText>
            <ThemedText style={styles.sublabel}>What time should you be reminded to water?</ThemedText>
            <View style={styles.timePickerRow}>
              <View style={styles.timePickerCol}>
                <ThemedText style={styles.timePickerLabel}>Hour</ThemedText>
                <View style={styles.timePickerContainer}>
                  <Picker
                    selectedValue={reminderHour}
                    onValueChange={setReminderHour}
                    enabled={!isSubmitting}
                    style={styles.picker}
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
                <ThemedText style={styles.timePickerLabel}>Minute</ThemedText>
                <View style={styles.timePickerContainer}>
                  <Picker
                    selectedValue={reminderMinute}
                    onValueChange={setReminderMinute}
                    enabled={!isSubmitting}
                    style={styles.picker}
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
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={{ flexDirection: 'row', gap: 12, maxWidth: 600, alignSelf: 'center', width: '100%' }}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={handleCancel}
          disabled={isSubmitting}
        >
          <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.submitButton]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <ThemedText style={styles.submitButtonText}>
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
    backgroundColor: '#535353',
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
    backgroundColor: '#444',
  },

  photoPlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 280,
    borderRadius: 16,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },

  placeholderText: {
    fontSize: 64,
    marginBottom: 8,
  },

  placeholderLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
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
    backgroundColor: '#00C853',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  photoButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
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
    color: '#FFF',
    marginBottom: 8,
  },

  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },

  pickerContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    justifyContent: 'center',
    height: 90,
  },

  picker: {
    color: '#FFF',
  },

  intervalRow: {
    flexDirection: 'row',
    gap: 12,
  },

  intervalCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },

  intervalInput: {
    width: '100%',
    textAlign: 'center',
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    paddingVertical: 6,
  },

  intervalLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },

  intervalPreview: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 10,
  },

  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#535353',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },

  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },

  cancelButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },

  submitButton: {
    backgroundColor: '#00C853',
  },

  submitButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },

  sublabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },

  dayChipActive: {
    backgroundColor: '#00C853',
    borderColor: '#00C853',
  },

  dayChipText: {
    color: 'rgba(255, 255, 255, 0.7)',
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
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
    textAlign: 'center',
  },

  timePickerContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    justifyContent: 'center',
    height: 100,
  },

});
