import { LOGO_PATH } from "@/lib/config";

interface AppLogoProps {
  /** Show only the square icon portion (for collapsed sidebar) */
  iconOnly?: boolean;
  /** Height in px (defaults to 28) */
  height?: number;
  className?: string;
}

/**
 * Renders the application logo from the configured logo asset.
 * In iconOnly mode the image is clipped to just the icon square.
 */
export function AppLogo({ iconOnly = false, height = 28, className }: AppLogoProps) {
  if (iconOnly) {
    return (
      <div
        style={{
          width: height,
          height,
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_PATH}
          alt="Logo"
          style={{ height, width: "auto", maxWidth: "none" }}
        />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_PATH}
      alt="Logo"
      style={{ height, width: "auto" }}
      className={className}
    />
  );
}
