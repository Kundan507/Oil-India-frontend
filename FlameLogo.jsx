import React from "react";

// The Oil India Tracker flame mark, recreated as inline SVG so it stays
// crisp at any size (sidebar icon, login screen, favicon) without
// shipping a raster image. Color is controllable via the `color` prop
// so it can sit on both the dark navy sidebar and the dark login screen
// exactly like the original artwork (white flame on navy).
export default function FlameLogo({ size = 32, color = "#F6F4EF", className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Oil India Tracker logo"
    >
      <path
        d="M50 4
           C 46 22, 30 34, 30 56
           C 30 68, 37 76, 44 80
           C 40 70, 42 60, 48 52
           C 50 62, 56 66, 56 76
           C 56 78, 55 80, 54 82
           C 62 79, 68 71, 68 60
           C 68 50, 62 44, 60 36
           C 61 46, 57 50, 54 52
           C 56 34, 50 22, 50 4 Z"
        fill={color}
      />
      <path
        d="M22 58
           C 22 50, 26 44, 30 40
           C 27 48, 28 56, 33 64
           C 38 72, 46 76, 50 82
           C 44 84, 36 84, 30 80
           C 24 76, 22 68, 22 58 Z"
        fill={color}
      />
      <path
        d="M78 58
           C 78 50, 74 44, 70 40
           C 73 48, 72 56, 67 64
           C 62 72, 54 76, 50 82
           C 56 84, 64 84, 70 80
           C 76 76, 78 68, 78 58 Z"
        fill={color}
      />
    </svg>
  );
}
