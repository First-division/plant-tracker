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
  removePlant: (id: string) => Promise<void>;
  isLoading: boolean;
};

const PlantsContext = createContext<PlantsContextType | undefined>(undefined);

const PLANTS_KEY = 'plants_data';

export function PlantsProvider({ children }: { children: ReactNode }) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load plants on mount
  useEffect(() => {
    loadPlants();
  }, []);

  const loadPlants = async () => {
    try {
      const stored = await SecureStore.getItemAsync(PLANTS_KEY);
      if (stored) {
        setPlants(JSON.parse(stored));
      } else {
        // Initialize with mock data if no stored data
        const mockPlants: Plant[] = [
          {
            id: '1',
            name: 'Peace Lily',
            percent: 30,
            location: 'Living Room',
            checkInterval: '1 week',
            birthday: '2023-06-15',
            gender: 'Female',
          },
          {
            id: '2',
            name: 'Snake Plant',
            percent: 65,
            location: 'Bedroom',
            checkInterval: '2 weeks',
            birthday: '2022-03-10',
            gender: 'Male',
          },
          {
            id: '3',
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

  const value: PlantsContextType = {
    plants,
    addPlant,
    removePlant,
    isLoading,
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
