import { useWindowDimensions } from 'react-native';

const TABLET_MIN_WIDTH = 700;

/**
 * Layout helper for iPad and other wide windows. Phones (and iPad split-view windows narrower
 * than a tablet) report `isTablet: false`, so their layouts are never touched.
 */
export function useTabletLayout() {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;
  return {
    width,
    isTablet,
    // Two columns of cards at normal tablet widths, three on very wide windows.
    columns: !isTablet ? 1 : width >= 1100 ? 3 : 2,
  };
}
