import MIcons from '@expo/vector-icons/MaterialIcons';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import { usePlants } from '@/contexts/PlantContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getThemeColors } from '@/constants/theme';

//TODO use this ship and update with new features: npm run release:testflight

const IOS_TAB_TRIGGER_OPTIONS = Platform.OS === 'ios'
  ? {
      titlePositionAdjustment: { vertical: 2 },
      selectedTitlePositionAdjustment: { vertical: 2 },
    }
  : undefined;

export default function TabLayout() {
  const { colorTheme } = usePlants();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const theme = getThemeColors(colorTheme, isDark);

  return (
    <NativeTabs
      backgroundColor={theme.cardBg}
      tintColor={theme.primary}
      iconColor={{
        default: theme.secondaryText,
        selected: theme.primary,
      }}
      labelStyle={{
        default: {
          color: theme.secondaryText,
          fontWeight: '500',
        },
        selected: {
          color: theme.primary,
          fontWeight: '600',
        },
      }}
    >
      <NativeTabs.Trigger name="index" options={IOS_TAB_TRIGGER_OPTIONS}>
        <NativeTabs.Trigger.TabBar backgroundColor={theme.cardBg} />
        <Label>Home</Label>
        <Icon sf="house.fill" androidSrc={<VectorIcon family={MIcons} name="home" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar" options={IOS_TAB_TRIGGER_OPTIONS}>
        <NativeTabs.Trigger.TabBar backgroundColor={theme.cardBg} />
        <Label>Calendar</Label>
        <Icon sf="calendar" androidSrc={<VectorIcon family={MIcons} name="calendar-today" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" options={IOS_TAB_TRIGGER_OPTIONS}>
        <NativeTabs.Trigger.TabBar backgroundColor={theme.cardBg} />
        <Label>Settings</Label>
        <Icon sf="gearshape.fill" androidSrc={<VectorIcon family={MIcons} name="settings" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
