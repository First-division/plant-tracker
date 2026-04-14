import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

export type Plant = {
  id: string;
  name: string;
  percent: number;
  photoUri?: string;
  location: string;
  checkInterval: string; // e.g., "3 days", "1 week", "2 weeks", "1 month"
  birthday: string; // ISO date string
  gender: 'Male' | 'Female' | 'Unknown';
};

type PlantsContextType = {
  plants: Plant[];
  addPlant: (plant: Omit<Plant, 'id' | 'percent'>) => Promise<void>;
  updatePlant: (id: string, plantData: Omit<Plant, 'id' | 'percent'>) => Promise<void>;
  removePlant: (id: string) => Promise<void>;
  isLoading: boolean;
  userName: string | null;
  setUserName: (name: string) => Promise<void>;
  hasCompletedOnboarding: boolean;
  resetUserData: () => Promise<void>;
};

const PlantsContext = createContext<PlantsContextType | undefined>(undefined);

const PLANTS_KEY = 'plants_data';
const USER_NAME_KEY = 'user_name';
const ONBOARDING_KEY = 'onboarding_completed';

export function PlantsProvider({ children }: { children: ReactNode }) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserNameState] = useState<string | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  // Load plants and user data on mount
  useEffect(() => {
    loadPlants();
    loadUserData();
  }, []);

  const loadPlants = async () => {
    try {
      const stored = await SecureStore.getItemAsync(PLANTS_KEY);
      if (stored) {
        const parsedPlants = JSON.parse(stored);
        // Sort by newest first (assuming ID is timestamp-based)
        const sortedPlants = parsedPlants.sort((a: Plant, b: Plant) => 
          parseInt(b.id) - parseInt(a.id)
        );
        setPlants(sortedPlants);
      } else {
        // Initialize with mock data if no stored data
        const mockPlants: Plant[] = [
          {
            id: Date.now().toString(),
            name: 'Peace Lily',
            percent: 30,
            location: 'Living Room',
            checkInterval: '1 week',
            birthday: '2023-06-15',
            gender: 'Female',
          },
          {
            id: (Date.now() + 1).toString(),
            name: 'Snake Plant',
            percent: 65,
            location: 'Bedroom',
            checkInterval: '2 weeks',
            birthday: '2022-03-10',
            gender: 'Male',
          },
          {
            id: (Date.now() + 2).toString(),
            name: 'Succulent',
            percent: 80,
            location: 'Window Sill',
            checkInterval: '3 weeks',
            birthday: '2024-01-20',
            gender: 'Unknown',
          },
        ];
        setPlants(mockPlants);
        await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(mockPlants));
      }
    } catch (error) {
      console.error('Error loading plants:', error);
    }
  };

  const loadUserData = async () => {
    try {
      const storedName = await SecureStore.getItemAsync(USER_NAME_KEY);
      const storedOnboarding = await SecureStore.getItemAsync(ONBOARDING_KEY);
      
      if (storedName) {
        setUserNameState(storedName);
      }
      if (storedOnboarding === 'true') {
        setHasCompletedOnboarding(true);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addPlant = async (plantData: Omit<Plant, 'id' | 'percent'>) => {
    try {
      const newPlant: Plant = {
        ...plantData,
        id: Date.now().toString(),
        percent: 80, // Mock default value for reservoir
      };

      const updatedPlants = [...plants, newPlant];
      setPlants(updatedPlants);
      await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(updatedPlants));
    } catch (error) {
      console.error('Error adding plant:', error);
      throw error;
    }
  };

  const removePlant = async (id: string) => {
    try {
      const updatedPlants = plants.filter((p) => p.id !== id);
      setPlants(updatedPlants);
      await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(updatedPlants));
    } catch (error) {
      console.error('Error removing plant:', error);
      throw error;
    }
  };

  const updatePlant = async (id: string, plantData: Omit<Plant, 'id' | 'percent'>) => {
    try {
      const updatedPlants = plants.map((p) =>
        p.id === id ? { ...p, ...plantData } : p
      );
      setPlants(updatedPlants);
      await SecureStore.setItemAsync(PLANTS_KEY, JSON.stringify(updatedPlants));
    } catch (error) {
      console.error('Error updating plant:', error);
      throw error;
    }
  };

  const setUserName = async (name: string) => {
    try {
      setUserNameState(name);
      setHasCompletedOnboarding(true);
      await SecureStore.setItemAsync(USER_NAME_KEY, name);
      await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');
    } catch (error) {
      console.error('Error saving user name:', error);
      throw error;
    }
  };

  const resetUserData = async () => {
    try {
      setUserNameState(null);
      setHasCompletedOnboarding(false);
      await SecureStore.deleteItemAsync(USER_NAME_KEY);
      await SecureStore.deleteItemAsync(ONBOARDING_KEY);
    } catch (error) {
      console.error('Error resetting user data:', error);
      throw error;
    }
  };

  const value: PlantsContextType = {
    plants,
    addPlant,
    updatePlant,
    removePlant,
    isLoading,
    userName,
    setUserName,
    hasCompletedOnboarding,
    resetUserData,
  };

  return <PlantsContext.Provider value={value}>{children}</PlantsContext.Provider>;
}

export function usePlants() {
  const context = useContext(PlantsContext);
  if (context === undefined) {
    throw new Error('usePlants must be used within PlantsProvider');
  }
  return context;
}
