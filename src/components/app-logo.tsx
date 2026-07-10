import { APP_NAME, LOGO_PATH } from "@/lib/config";

interface AppLogoProps {
  /** Show only the icon portion, used by the collapsed sidebar. */
  iconOnly?: boolean;
  /** Rendered height in pixels. */
  height?: number;
  className?: string;
}

/**
 * Renders the Workspace OSS wordmark. The SVG keeps the icon in the first
 * square of its viewBox, so icon-only mode can crop it without a second asset.
 */
export function AppLogo({ iconOnly = false, height = 28, className }: AppLogoProps) {
  if (iconOnly) {
    return (
      <div
        aria-label={APP_NAME}
        role="img"
        className={className}
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
          alt=""
          aria-hidden="true"
          style={{
            display: "block",
            height,
            width: "auto",
            maxWidth: "none",
            flexShrink: 0,
          }}
        />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_PATH}
      alt={APP_NAME}
      height={height}
      style={{ display: "block", height, width: "auto" }}
      className={className}
    />
  );
}
