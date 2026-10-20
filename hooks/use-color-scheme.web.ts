import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { usePlants } from '@/contexts/PlantContext';

/** Resolve the saved/system theme after web hydration to avoid static-rendering mismatches. */
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
