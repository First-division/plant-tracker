import MIcons from '@expo/vector-icons/MaterialIcons';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { usePlants } from '@/app/context/PlantContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getThemeColors } from '@/constants/theme';

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
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.TabBar backgroundColor={theme.cardBg} />
        <Label>Home</Label>
        <Icon sf="house.fill" androidSrc={<VectorIcon family={MIcons} name="home" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.TabBar backgroundColor={theme.cardBg} />
        <Label>Calendar</Label>
        <Icon sf="calendar" androidSrc={<VectorIcon family={MIcons} name="calendar-today" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.TabBar backgroundColor={theme.cardBg} />
        <Label>Settings</Label>
        <Icon sf="gearshape.fill" androidSrc={<VectorIcon family={MIcons} name="settings" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
