import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { usePlants } from '@/app/context/PlantContext';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const systemScheme = useRNColorScheme();
  const { appearance } = usePlants();

  if (!hasHydrated) return 'light';
  if (appearance === 'system') return systemScheme;
  return appearance;
}
