import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { usePlants } from "@/app/context/PlantContext";

export default function HomeScreen() {
  const router = useRouter();
  const { plants, isLoading } = usePlants();

  const handleAddPlant = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push("/add-plant-modal");
  };
  return (
    <ThemedView style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="large" color="#00C853" style={{ marginTop: 40 }} />
      ) : (
        <>
          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={handleAddPlant}>
            <ThemedText style={styles.addButtonText}>+</ThemedText>
          </TouchableOpacity>
          
          {/* Title */}
          <ThemedText style={styles.title}>My Plants</ThemedText>

          

          {/* Plant List */}
          <FlatList
            data={plants}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <ThemedView style={styles.card}>
                <ThemedText style={styles.plantName}>{item.name}</ThemedText>
                <ThemedText style={styles.percent}>
                  {item.percent}% reservoir
                </ThemedText>
              </ThemedView>
            )}
          />
        </>
      )}

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#535353",
    paddingTop: 70,
    paddingHorizontal: 20,
  },

  title: {
    paddingTop: 20,
    fontSize: 32,
    fontWeight: "600",
    marginBottom: 20,
    
  },

  card: {
    padding: 18,
    borderRadius: 25,
    marginBottom: 15,

    shadowColor: "#ffffff",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },

  plantName: {
    fontSize: 18,
    fontWeight: "500",
  },

  percent: {
    marginTop: 6,
    color: "#00C853", // 👈 vibrant green
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