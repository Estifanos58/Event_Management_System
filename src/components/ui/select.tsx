import type { SelectHTMLAttributes } from "react";
import { cn } from "./utils";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
        className,
      )}
      {...props}
    />
  );
}
