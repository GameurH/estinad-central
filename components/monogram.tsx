import Image from "next/image";

/**
 * ESTINAD monogram — rendered from the official logo asset (/logo-pos.jpg).
 *
 * The mark is a light plate on a dark background. The `logo-lockup-image`
 * treatment (multiply + invert on light grounds, screen on dark) leaves only
 * the interlocking E/T geometry, true to the monochrome system — same rules
 * as control and estinad-landing.
 */
export function Monogram({
  className = "h-6 w-6",
  alt = "ESTINAD monogram",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <span className={`relative inline-block ${className}`}>
      <Image
        src="/logo-pos.jpg"
        alt={alt}
        fill
        sizes="64px"
        className="logo-lockup-image object-contain pointer-events-none select-none"
      />
    </span>
  );
}
