import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";

export interface InputProps extends TextInputProps {
  className?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(({ className, ...props }, ref) => {
  return (
    <TextInput
      ref={ref}
      className={cn(
        "flex h-12 w-full rounded-xl border border-input bg-card px-4 text-[15px] text-foreground placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
