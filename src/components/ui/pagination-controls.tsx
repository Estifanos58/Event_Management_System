import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/utils";

type PaginationControlsProps = {
  previousHref: string;
  nextHref: string;
  summary?: ReactNode;
  className?: string;
  summaryClassName?: string;
  controlsClassName?: string;
  linkClassName?: string;
  disabledLinkClassName?: string;
  previousLabel?: string;
  nextLabel?: string;
  disablePrevious?: boolean;
  disableNext?: boolean;
};

const DEFAULT_LINK_CLASS_NAME =
  "inline-flex h-8 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50";
const DEFAULT_DISABLED_LINK_CLASS_NAME =
  "pointer-events-none cursor-not-allowed border-gray-100 text-gray-300";

export function PaginationControls({
  previousHref,
  nextHref,
  summary,
  className,
  summaryClassName,
  controlsClassName,
  linkClassName,
  disabledLinkClassName,
  previousLabel = "Previous",
  nextLabel = "Next",
  disablePrevious = false,
  disableNext = false,
}: PaginationControlsProps) {
  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500",
        className,
      )}
    >
      {summary ? <p className={summaryClassName}>{summary}</p> : <span />}

      <div className={cn("flex gap-2", controlsClassName)}>
        <Link
          href={previousHref}
          aria-disabled={disablePrevious}
          className={cn(
            DEFAULT_LINK_CLASS_NAME,
            linkClassName,
            disablePrevious && [
              DEFAULT_DISABLED_LINK_CLASS_NAME,
              disabledLinkClassName,
            ],
          )}
        >
          {previousLabel}
        </Link>

        <Link
          href={nextHref}
          aria-disabled={disableNext}
          className={cn(
            DEFAULT_LINK_CLASS_NAME,
            linkClassName,
            disableNext && [
              DEFAULT_DISABLED_LINK_CLASS_NAME,
              disabledLinkClassName,
            ],
          )}
        >
          {nextLabel}
        </Link>
      </div>
    </div>
  );
}