import MIcons from '@expo/vector-icons/MaterialIcons';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import { usePlants } from '@/contexts/PlantContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getThemeColors } from '@/constants/theme';

//TODO use this ship and update with new features: npm run release:testflight

const IOS_TAB_TRIGGER_OPTIONS = Platform.OS === 'ios' && !Platform.isPad
  ? {
      titlePositionAdjustment: { vertical: 2 },
      selectedTitlePositionAdjustment: { vertical: 2 },
    }
  : undefined;

/** Configure the app's primary tab navigation using the user's selected theme. */
export default function TabLayout() {
  const { colorTheme } = usePlants();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const theme = getThemeColors(colorTheme, isDark);

  return (
    <NativeTabs
      backgroundColor={Platform.OS === 'ios' ? undefined : theme.cardBg}
      tintColor={theme.primary}
      iconColor={{
        default: theme.secondaryText,
        selected: theme.primary,
      }}
      labelStyle={{
        default: {
          color: theme.secondaryText,
        },
        selected: {
          color: theme.primary,
        },
      }}
    >
      <NativeTabs.Trigger name="index" options={IOS_TAB_TRIGGER_OPTIONS}>
        <Label>Home</Label>
        <Icon sf="house.fill" androidSrc={<VectorIcon family={MIcons} name="home" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar" options={IOS_TAB_TRIGGER_OPTIONS}>
        <Label>Calendar</Label>
        <Icon sf="calendar" androidSrc={<VectorIcon family={MIcons} name="calendar-today" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" options={IOS_TAB_TRIGGER_OPTIONS}>
        <Label>Settings</Label>
        <Icon sf="gearshape.fill" androidSrc={<VectorIcon family={MIcons} name="settings" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
