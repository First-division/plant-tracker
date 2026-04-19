import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
  LayoutRectangle,
} from 'react-native';

interface WalkthroughStep {
  title: string;
  description: string;
  icon: string;
  targetRef?: React.RefObject<View | null>;
  // When no targetRef, show centered card with no spotlight
  centered?: boolean;
}

interface OnboardingWalkthroughProps {
  steps: WalkthroughStep[];
  onComplete: () => void;
}

export default function OnboardingWalkthrough({ steps, onComplete }: OnboardingWalkthroughProps) {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<LayoutRectangle | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  const step = steps[currentStep];

  const measureTarget = useCallback(() => {
    if (step.centered || !step.targetRef?.current) {
      setTargetRect(null);
      return;
    }
    step.targetRef.current.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setTargetRect({ x, y, width, height });
      } else {
        setTargetRect(null);
      }
    });
  }, [step]);

  useEffect(() => {
    // Fade in on mount
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    // Animate card on step change
    cardAnim.setValue(0);
    Animated.spring(cardAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();

    // Small delay to let layout settle before measuring
    const timer = setTimeout(measureTarget, 100);
    return () => clearTimeout(timer);
  }, [currentStep, measureTarget]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  const handleFinish = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onComplete();
    });
  };

  const isLast = currentStep === steps.length - 1;
  const showSpotlight = targetRect != null;

  // Position the tooltip card above or below the spotlight
  const getCardStyle = () => {
    if (!showSpotlight || step.centered) {
      // Centered card
      return {
        top: SCREEN_HEIGHT * 0.3,
        left: 30,
        right: 30,
      };
    }
    const spotlightCenterY = targetRect!.y + targetRect!.height / 2;
    const cardAbove = spotlightCenterY > SCREEN_HEIGHT / 2;

    if (cardAbove) {
      return {
        bottom: SCREEN_HEIGHT - targetRect!.y + 20,
        left: 20,
        right: 20,
      };
    }
    return {
      top: targetRect!.y + targetRect!.height + 20,
      left: 20,
      right: 20,
    };
  };

  const cardTranslateY = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} pointerEvents="box-none">
      {/* Backdrop */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={handleNext}
      >
        <View style={[styles.backdrop]}>
          {showSpotlight && (
            <View
              style={[
                styles.spotlight,
                {
                  top: targetRect!.y - 8,
                  left: targetRect!.x - 8,
                  width: targetRect!.width + 16,
                  height: targetRect!.height + 16,
                  borderRadius: 16,
                },
              ]}
            />
          )}
        </View>
      </TouchableOpacity>

      {/* Tooltip Card */}
      <Animated.View
        style={[
          styles.card,
          getCardStyle(),
          {
            opacity: cardAnim,
            transform: [{ translateY: cardTranslateY }],
          },
        ]}
        pointerEvents="box-none"
      >
        <Text style={styles.icon}>{step.icon}</Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>

        {/* Step Dots */}
        <View style={styles.dotsRow}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentStep && styles.dotActive]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttonsRow}>
          {!isLast && (
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleNext}
            style={[styles.nextButton, isLast && styles.doneButton]}
          >
            <Text style={styles.nextText}>{isLast ? "Let's Go!" : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  spotlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 2,
    borderColor: '#00C853',
  },
  card: {
    position: 'absolute',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    maxWidth: 500,
    alignSelf: 'center',
    shadowColor: '#00C853',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dotActive: {
    backgroundColor: '#00C853',
    width: 20,
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  skipText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
  },
  nextButton: {
    backgroundColor: '#00C853',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  doneButton: {
    paddingHorizontal: 40,
  },
  nextText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
