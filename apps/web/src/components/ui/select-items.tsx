"use client";
import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

export interface SelectGroupProps extends React.ComponentPropsWithoutRef<typeof BaseSelect.Group> {
  ref?: React.Ref<HTMLDivElement>;
}

export const SelectGroup = ({ ref, ...props }: SelectGroupProps): React.JSX.Element => {
  return <BaseSelect.Group ref={ref} data-slot="select-group" {...props} />;
};

export interface SelectItemProps extends React.ComponentPropsWithoutRef<typeof BaseSelect.Item> {
  value: string;
  ref?: React.Ref<HTMLElement>;
}

export function SelectItem({
  className,
  children,
  ref,
  ...props
}: SelectItemProps): React.JSX.Element {
  return (
    <BaseSelect.Item
      ref={ref}
      data-slot="select-item"
      className={cn(
        "relative flex min-h-9 w-full cursor-default select-none items-center rounded-md py-2 ps-8 pe-2.5 text-sm leading-5 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[selected]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseSelect.ItemIndicator className="absolute start-2 flex items-center justify-center [&_svg]:size-4">
        <Check aria-hidden />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
