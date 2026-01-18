import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card
 * - Base surface for dashboards & pages
 * - Neutral, calm, reusable
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        [
          // Surface
          "bg-card text-card-foreground",
          "border border-border",
          "rounded-xl",
          "shadow-sm",

          // Layout
          "flex flex-col gap-6",
          "py-6",
        ].join(" "),
        className
      )}
      {...props}
    />
  );
}

/**
 * Card Header
 */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        [
          "@container/card-header",
          "grid auto-rows-min",
          "grid-rows-[auto_auto]",
          "items-start gap-2",
          "px-6",

          // When there is an action slot
          "has-data-[slot=card-action]:grid-cols-[1fr_auto]",

          // Divider support
          "[.border-b]:pb-6",
        ].join(" "),
        className
      )}
      {...props}
    />
  );
}

/**
 * Card Title
 */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base font-semibold leading-none text-foreground",
        className
      )}
      {...props}
    />
  );
}

/**
 * Card Description
 */
function CardDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  );
}

/**
 * Card Action (top-right slot)
 */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

/**
 * Card Content
 */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 text-sm", className)}
      {...props}
    />
  );
}

/**
 * Card Footer
 */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        [
          "flex items-center gap-2",
          "px-6",

          // Divider support
          "[.border-t]:pt-6",
        ].join(" "),
        className
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
