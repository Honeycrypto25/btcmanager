import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top, #2f291e 0%, #16120d 48%, #090807 100%)",
          color: "#f3c77a",
          fontSize: 156,
          fontWeight: 700,
          letterSpacing: "-0.06em",
          borderRadius: 96,
          border: "8px solid rgba(243, 199, 122, 0.32)",
        }}
      >
        PD
      </div>
    ),
    size
  );
}
