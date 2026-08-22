import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

/**
 * Builds a PromptPay QR (PNG data URL) for a wallet top-up. `target` is a Thai
 * mobile number or 13-digit national ID, `amountBaht` a decimal amount.
 *
 * Standards-based (EMVCo / Thai PromptPay) and fully self-contained — no
 * external service or credentials required.
 */
export async function promptPayQrDataUrl(target: string, amountBaht?: number): Promise<string> {
  const sanitized = target.replace(/[^0-9]/g, "");
  const payload = generatePayload(sanitized, amountBaht ? { amount: amountBaht } : {});
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
    color: { dark: "#08080c", light: "#ffffff" },
  });
}
