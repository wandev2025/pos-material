import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & { style?: any; scaleTo?: number };

// Subtle press feedback: scales down on press-in, eases back on release.
// Drop-in for TouchableOpacity (minus activeOpacity).
export default function PressableScale({ style, onPressIn, onPressOut, scaleTo = 0.96, children, ...rest }: Props) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={e => {
        scale.value = withTiming(scaleTo, { duration: 110 });
        onPressIn?.(e);
      }}
      onPressOut={e => {
        scale.value = withTiming(1, { duration: 150 });
        onPressOut?.(e);
      }}
      style={[style, aStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
