/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { type ThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/components/app-theme-provider';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof ThemeColors,
) {
  const { colorScheme, colors } = useAppTheme();
  const colorFromProps = props[colorScheme];

  if (colorFromProps) {
    return colorFromProps;
  }
  return colors[colorName];
}
