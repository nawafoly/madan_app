import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center overflow-hidden rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none absolute top-1/2 block size-4 -translate-y-1/2 rounded-full bg-white shadow-sm ring-0 transition-[inset-inline-start,inset-inline-end] duration-200 data-[state=unchecked]:start-px data-[state=unchecked]:end-auto data-[state=checked]:start-auto data-[state=checked]:end-px dark:bg-slate-100"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
