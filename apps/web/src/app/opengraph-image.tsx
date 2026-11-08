import { ImageResponse } from "next/og";

export const alt = "GhostInit";
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
        background: "#000",
        color: "#fff",
        fontSize: 64,
      }}
    >
      GhostInit
    </div>,
    { ...size },
  );
}
