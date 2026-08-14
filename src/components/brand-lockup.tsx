import type { AppBranding } from "@/lib/app-branding";
import { cn } from "@/lib/utils";

export function BrandLockup({
  branding,
  className,
}: {
  branding: AppBranding;
  className?: string;
}) {
  return (
    <span className={cn("lfp-brand-lockup", className)}>
      <svg aria-hidden="true" className="lfp-brand-mark" viewBox="0 0 190 140">
        <g fill="var(--lfp-coral)">
          <path d="M12 8h26v91c0 9 5 14 15 14h5v23H46c-22 0-34-13-34-35V8Z" />
          <path d="M61 136V61H49V39h12v-5C61 13 73 2 95 2h20v23H98c-8 0-11 4-11 11v3h28v22H87v75H61Z" />
          <path d="M94 39h25v9c8-8 18-12 29-12 27 0 42 21 42 50s-15 50-42 50c-11 0-20-4-28-11v15H94V39Zm48 74c14 0 22-11 22-27s-8-27-22-27-23 11-23 27 9 27 23 27Z" fillRule="evenodd" />
        </g>
      </svg>
      <span className="lfp-brand-product">{branding.shortName}</span>
    </span>
  );
}
