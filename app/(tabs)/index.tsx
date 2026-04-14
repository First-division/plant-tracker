import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, View, ScrollView, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { usePlants } from "@/app/context/PlantContext";
import { useEffect } from "react";

export default function HomeScreen() {
  const router = useRouter();
  const { plants, isLoading, removePlant, userName, hasCompletedOnboarding, resetUserData } = usePlants();

  useEffect(() => {
    if (!isLoading && !hasCompletedOnboarding) {
      router.push("/welcome-modal");
    }
  }, [isLoading, hasCompletedOnboarding, router]);

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const handleAddPlant = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push("/add-plant-modal");
  };

  const handlePlantMenu = (plant: any) => {
    Alert.alert(
      plant.name,
      "Choose an action",
      [
        {
          text: "Edit",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({
              pathname: "/add-plant-modal",
              params: { editId: plant.id }
            });
          }
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Delete Plant",
              `Are you sure you want to delete ${plant.name}?`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await removePlant(plant.id);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch (error) {
                      Alert.alert("Error", "Failed to delete plant");
                    }
                  }
                }
              ]
            );
          }
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleClearUserData = async () => {
    Alert.alert(
      "Clear User Data",
      "This will reset your name and show the welcome screen again. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await resetUserData();
              // useEffect will automatically navigate to welcome modal
            } catch (error) {
              Alert.alert("Error", "Failed to clear user data");
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#00C853" style={{ marginTop: 40 }} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <TouchableOpacity
        style={styles.addButton}
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={handleAddPlant}>
        <ThemedText style={styles.addButtonText}>+</ThemedText>
      </TouchableOpacity>
      
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View style={styles.greetingContainer}>
          <ThemedText style={styles.greeting}>{getTimeBasedGreeting()},</ThemedText>
          <ThemedText style={styles.userName} numberOfLines={2} adjustsFontSizeToFit>
            {userName}
          </ThemedText>
        </View>

        {/* Upcoming Reminders */}
        <View style={styles.remindersContainer}>
          <ThemedText style={styles.sectionTitle}>Upcoming Watering Reminders</ThemedText>
          <View style={styles.remindersContent}>
            <ThemedText style={styles.noRemindersText}>No upcoming reminders</ThemedText>
            <ThemedText style={styles.remindersSubtext}>Add plants to see watering schedules</ThemedText>
          </View>
        </View>

        {/* Your Plants */}
        <ThemedText style={styles.sectionTitle}>Your Plants</ThemedText>
        {plants.map((item) => (
          <LinearGradient
            key={item.id}
            colors={['rgba(255, 255, 255, 0.6)', 'rgba(0, 132, 255, 0.2)', 'rgba(255, 182, 222, 0.2)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardBorder}
          >
            <ThemedView style={styles.card}>
              <TouchableOpacity
                style={styles.menuButton}
                onPress={() => handlePlantMenu(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ThemedText style={styles.menuDots}>⋮</ThemedText>
              </TouchableOpacity>
              
              {/* Plant Info */}
              <View style={styles.plantInfo}>
                <ThemedText style={styles.plantName}>{item.name}</ThemedText>
                <ThemedText style={styles.plantLocation}>{item.location}</ThemedText>
                <ThemedText style={styles.percent}>
                  {item.percent}% reservoir
                </ThemedText>
              </View>
              
              {/* Plant Image */}
              {item.photoUri ? (
                <Image
                  source={{ uri: item.photoUri }}
                  style={styles.plantImage}
                />
              ) : (
                <View style={styles.plantImagePlaceholder}>
                  <ThemedText style={styles.imagePlaceholderText}>🌱</ThemedText>
                </View>
              )}
            </ThemedView>
          </LinearGradient>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#535353",
    paddingHorizontal: 20,
  },

  scrollContent: {
    flex: 1,
    paddingTop: 120,
  },

  scrollContentContainer: {
    paddingBottom: 40,
  },

  greetingContainer: {
    marginBottom: 40,
    paddingTop: 20,
  },

  greeting: {
    fontSize: 24,
    fontWeight: "600",
    color: "#FFF",
    marginBottom: 5,
  },

  userName: {
    fontSize: 32,
    fontWeight: "700",
    color: "#FFF",
    marginTop: 5,
    paddingTop: 10,
  },



  remindersContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 15,
    padding: 20,
    marginBottom: 30,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFF",
    marginBottom: 15,
  },

  remindersContent: {
    alignItems: "center",
  },

  noRemindersText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: 5,
  },

  remindersSubtext: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.4)",
  },

  cardBorder: {
    borderRadius: 25,
    marginBottom: 15,
    padding: 2,
  },

  card: {
    padding: 18,
    borderRadius: 23,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,

    shadowColor: "#ffffff",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },

  plantImage: {
    width: 90,
    height: 90,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },

  plantImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },

  imagePlaceholderText: {
    fontSize: 40,
  },

  plantInfo: {
    flex: 1,
  },

  menuButton: {
    position: "absolute",
    top: 8,
    right: 8,
    padding: 5,
    zIndex: 10,
  },

  menuDots: {
    fontSize: 20,
    color: "#FFF",
    opacity: 0.7,
  },

  plantName: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 5,
  },

  plantLocation: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    marginBottom: 8,
  },

  percent: {
    color: "#00C853",
    fontWeight: "500",
  },

  addButton: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#00C853",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    zIndex: 10,
  },

  addButtonText: {
    color: "#FFFFFF",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "700",
  },
});