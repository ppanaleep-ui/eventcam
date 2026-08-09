import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

/**
 * Builds a PromptPay QR code (as a PNG data URL) for a given account and
 * optional amount. `target` is a Thai mobile number or 13-digit national ID.
 *
 * This is a fully self-contained, standards-based integration (EMVCo / Thai
 * PromptPay) — no external service or credentials required.
 */
export async function promptPayQrDataUrl(
  target: string,
  amount?: number,
): Promise<string> {
  const sanitized = target.replace(/[^0-9]/g, "");
  const payload = generatePayload(sanitized, amount ? { amount } : {});
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** Builds the raw EMVCo payload string (useful for tests / custom rendering). */
export function promptPayPayload(target: string, amount?: number): string {
  const sanitized = target.replace(/[^0-9]/g, "");
  return generatePayload(sanitized, amount ? { amount } : {});
}
