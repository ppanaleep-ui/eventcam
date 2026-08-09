import QRCode from "qrcode";

/** Renders an arbitrary URL/string to a PNG data URL QR code. */
export async function qrDataUrl(
  text: string,
  size = 512,
): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: size,
    color: { dark: "#761f3d", light: "#ffffff" },
  });
}
