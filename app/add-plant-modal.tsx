import React, { useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  View,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePlants } from '@/app/context/PlantContext';

const CHECK_INTERVALS = [
  { label: 'Every 3 days', value: '3 days' },
  { label: 'Every week', value: '1 week' },
  { label: 'Every 2 weeks', value: '2 weeks' },
  { label: 'Monthly', value: '1 month' },
];

const GENDERS = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
  { label: 'Unknown', value: 'Unknown' },
];

export default function AddPlantModal() {
  const router = useRouter();
  const { addPlant } = usePlants();

  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [birthday, setBirthday] = useState(new Date().toISOString().split('T')[0]);
  const [checkInterval, setCheckInterval] = useState('1 week');
  const [gender, setGender] = useState('Unknown');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      await addPlant({
        name: name.trim(),
        location: location.trim(),
        photoUri,
        birthday,
        checkInterval,
        gender: gender as 'Male' | 'Female' | 'Unknown',
      });

      router.dismiss();
    } catch (error) {
      Alert.alert('Error', 'Failed to add plant');
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
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

          {/* Check Interval Dropdown */}
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Check Reservoir/Soil</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={checkInterval}
                onValueChange={setCheckInterval}
                enabled={!isSubmitting}
                style={styles.picker}
              >
                {CHECK_INTERVALS.map((interval) => (
                  <Picker.Item key={interval.value} label={interval.label} value={interval.value} />
                ))}
              </Picker>
            </View>
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
        </View>
      </ScrollView>

      {/* Bottom Action Buttons */}
      <View style={styles.actionBar}>
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
            <ThemedText style={styles.submitButtonText}>Add Plant</ThemedText>
          )}
        </TouchableOpacity>
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
    paddingBottom: 100,
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
    height: 280,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: '#444',
  },

  photoPlaceholder: {
    width: '100%',
    height: 280,
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
    height: 100,
  },

  picker: {
    color: '#FFF',
  },

  actionBar: {
    position: 'absolute',
    bottom: 35,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#535353',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    height: 80,
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

});
