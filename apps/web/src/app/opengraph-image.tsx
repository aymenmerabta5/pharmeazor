import { ImageResponse } from "next/og";

export const alt = "pharmeazor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: "#f7f5f0",
        color: "#1f4d42",
        fontSize: 64,
      }}
    >
      pharmeazor
    </div>,
    { ...size },
  );
}
