import { ImageResponse } from "next/og";

export const alt = "FindTheDead — remarkable lives across Michigan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#101918",
          color: "#f4f1e8",
          padding: "64px 72px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                background: "#d8f58b",
                color: "#101918",
              }}
            >
              ↗
            </div>
            <span>FindTheDead.</span>
          </div>
          <span style={{ color: "#b7c0bc", letterSpacing: 4 }}>
            MICHIGAN
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 92,
              lineHeight: 1,
              letterSpacing: -4,
            }}
          >
            History has an address<span style={{ color: "#d8f58b" }}>.</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#b7c0bc" }}>
            Discover remarkable lives buried across Michigan.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
