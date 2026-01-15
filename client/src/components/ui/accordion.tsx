import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/* ======================================================
   Accordion Root
====================================================== */
function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

/* ======================================================
   Accordion Item
====================================================== */
function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  );
}

/* ======================================================
   Accordion Trigger
   - Mobile first
   - RTL / LTR safe
   - Clean hover & focus
====================================================== */
function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          [
            /* Layout + tap area */
            "flex flex-1 items-start gap-4 rounded-md px-2 py-4 sm:px-3 sm:py-5",
            "justify-between",

            /* Typography */
            "text-sm font-medium leading-6 text-start",

            /* Motion */
            "transition-[background-color,color,box-shadow,transform] duration-200 ease-out",

            /* Hover (only on hover-capable devices) */
            "hover:bg-muted/40",
            "supports-[hover:hover]:hover:underline",

            /* Focus */
            "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-ring",

            /* Disabled */
            "disabled:pointer-events-none disabled:opacity-50",

            /* Icon rotate when open */
            "[&[data-state=open]>svg]:rotate-180",
          ].join(" "),
          className
        )}
        {...props}
      >
        {/* Text */}
        <span className="flex-1">{children}</span>

        {/* Icon */}
        <ChevronDownIcon
          className={cn(
            "pointer-events-none size-4 shrink-0 translate-y-0.5",
            "text-muted-foreground",
            "transition-transform duration-200 ease-out"
          )}
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/* ======================================================
   Accordion Content
====================================================== */
function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className={cn(
        "overflow-hidden text-sm text-muted-foreground",
        "data-[state=closed]:animate-accordion-up",
        "data-[state=open]:animate-accordion-down"
      )}
      {...props}
    >
      <div className={cn("px-2 pb-4 sm:px-3", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
