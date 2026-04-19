import { useColorScheme as useRNColorScheme } from 'react-native';
import { usePlants } from '@/app/context/PlantContext';

export function useColorScheme() {
  const systemScheme = useRNColorScheme();
  const { appearance } = usePlants();

  if (appearance === 'system') return systemScheme;
  return appearance;
}
