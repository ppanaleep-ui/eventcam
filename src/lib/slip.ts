import "server-only";

// Transfer-slip verification.
//
// Real integration with EasySlip (https://easyslip.com) — a Thai service that
// reads a PromptPay/bank transfer slip image and returns the verified amount,
// transaction reference, sender/receiver, and timestamp. Enabled when
// SLIP_VERIFY_PROVIDER="easyslip" and EASYSLIP_API_TOKEN is set.
//
// When no provider is configured we return "unverified" so the couple can still
// review slips manually — the guest flow never blocks on verification.

export type SlipVerifyResult = {
  status: "unverified" | "verified" | "failed" | "duplicate";
  ref?: string;
  amount?: number;
  raw?: unknown;
};

export async function verifySlip(file: File): Promise<SlipVerifyResult> {
  const provider = process.env.SLIP_VERIFY_PROVIDER?.toLowerCase();
  if (provider !== "easyslip") {
    return { status: "unverified" };
  }
  const token = process.env.EASYSLIP_API_TOKEN;
  if (!token) {
    console.warn("[slip] SLIP_VERIFY_PROVIDER=easyslip but EASYSLIP_API_TOKEN is missing");
    return { status: "unverified" };
  }

  try {
    const form = new FormData();
    form.append("file", file, "slip.jpg");

    const res = await fetch("https://developer.easyslip.com/api/v1/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const raw = await res.json().catch(() => ({}));

    if (!res.ok) {
      // EasySlip returns 400 with { status: "duplicate_slip" | ... } on known issues.
      const code = (raw && (raw.status || raw.message)) as string | undefined;
      if (code && String(code).includes("duplicate")) {
        return { status: "duplicate", raw };
      }
      console.error(`[slip] verify failed (${res.status})`, raw);
      return { status: "failed", raw };
    }

    const data = raw?.data ?? {};
    const amount =
      typeof data?.amount === "object" ? data?.amount?.amount : data?.amount;
    const ref = data?.transRef ?? data?.ref ?? data?.transactionId;

    return {
      status: "verified",
      ref: ref ? String(ref) : undefined,
      amount: typeof amount === "number" ? amount : undefined,
      raw,
    };
  } catch (err) {
    console.error("[slip] verify error", err);
    return { status: "failed", raw: { error: String(err) } };
  }
}
