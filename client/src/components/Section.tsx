import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Section
 * Wrapper عام للسيكشنات
 * - default: بدون خلفية
 * - highlight: سيكشن مميز (داشبورد / ملخص / مهم)
 */
type SectionProps = React.ComponentProps<"section"> & {
  variant?: "default" | "highlight";
};

function Section({
  className,
  variant = "default",
  ...props
}: SectionProps) {
  return (
    <section
      data-slot="section"
      className={cn(
        [
          "w-full",

          // spacing موحد
          "py-8 sm:py-10 lg:py-12",

          variant === "highlight" && [
            "rounded-2xl",
            "bg-primary text-primary-foreground",
            "shadow-sm",
          ],
        ],
        className
      )}
      {...props}
    />
  );
}

/**
 * Section Header
 */
function SectionHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="section-header"
      className={cn(
        [
          "mb-6",
          "flex flex-col gap-2",
        ],
        className
      )}
      {...props}
    />
  );
}

/**
 * Section Title
 */
function SectionTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="section-title"
      className={cn(
        "text-xl font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  );
}

/**
 * Section Description
 */
function SectionDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="section-description"
      className={cn(
        "text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

/**
 * Section Content
 */
function SectionContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="section-content"
      className={cn("space-y-6", className)}
      {...props}
    />
  );
}

export {
  Section,
  SectionHeader,
  SectionTitle,
  SectionDescription,
  SectionContent,
};
