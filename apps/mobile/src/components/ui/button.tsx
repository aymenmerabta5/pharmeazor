import * as React from "react";
import { Pressable, type PressableProps, ActivityIndicator, View } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";
import { Text, TextClassContext } from "./text";

const buttonVariants = tv({
  base: "inline-flex flex-row items-center justify-center rounded-full gap-2 border border-transparent focus:border-ring",
  variants: {
    variant: {
      default: "bg-primary active:bg-primary/90",
      destructive: "border-destructive/40 bg-destructive/10 active:bg-destructive/20",
      outline: "border-input bg-card active:bg-accent",
      secondary: "bg-secondary active:bg-secondary/80",
      ghost: "active:bg-accent",
      link: "bg-transparent",
    },
    size: {
      default: "h-11 px-5",
      sm: "min-h-10 px-4",
      lg: "h-12 px-7",
      icon: "size-11",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

const buttonTextVariants = tv({
  base: "text-center font-semibold",
  variants: {
    variant: {
      default: "text-primary-foreground",
      destructive: "text-destructive active:text-background",
      outline: "text-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      link: "text-primary underline",
    },
    size: {
      default: "text-sm",
      sm: "text-[13px]",
      lg: "text-base",
      icon: "text-base",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps
  extends Omit<PressableProps, "children">, VariantProps<typeof buttonVariants> {
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
  isLoading?: boolean;
}

export function Button({
  className,
  textClassName,
  variant,
  size,
  children,
  isLoading,
  disabled,
  accessibilityState,
  ...props
}: ButtonProps): React.JSX.Element {
  const isDisabled = Boolean(disabled || isLoading);
  return (
    <TextClassContext.Provider value={cn(buttonTextVariants({ variant, size }), textClassName)}>
      <Pressable
        {...props}
        accessibilityRole="button"
        accessibilityState={{
          ...accessibilityState,
          busy: Boolean(isLoading),
          disabled: isDisabled,
        }}
        className={cn(
          buttonVariants({ variant, size }),
          isDisabled && "ui-disabled opacity-50",
          isLoading && "ui-loading",
          className,
        )}
        disabled={isDisabled}
      >
        <View className="flex-row items-center justify-center gap-2">
          {isLoading ? <ActivityIndicator size="small" /> : null}
          {typeof children === "string" ? (
            <Text className={cn(buttonTextVariants({ variant, size }), textClassName)}>
              {children}
            </Text>
          ) : (
            children
          )}
        </View>
      </Pressable>
    </TextClassContext.Provider>
  );
}

export { buttonVariants, buttonTextVariants };
