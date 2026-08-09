import "server-only";

// LINE Messaging API push-notification integration.
//
// Credentials live per-event (channel access token + destination userId/groupId)
// so each couple wires up their own LINE OA. If an event has no credentials
// configured, we log and no-op instead of throwing — the guest flow must never
// fail because a notification couldn't be sent.

type PushArgs = {
  channelAccessToken?: string | null;
  to?: string | null;
  messages: LineMessage[];
};

type LineMessage =
  | { type: "text"; text: string }
  | {
      type: "flex";
      altText: string;
      contents: unknown;
    };

export async function pushLineMessage({
  channelAccessToken,
  to,
  messages,
}: PushArgs): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!channelAccessToken || !to) {
    console.info("[line] skipped push — event has no LINE credentials configured");
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({ to, messages }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[line] push failed (${res.status}): ${body}`);
      return { ok: false, error: `${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[line] push error", err);
    return { ok: false, error: String(err) };
  }
}

/** Convenience: notify a couple that a new wish arrived. */
export async function notifyNewWish(args: {
  channelAccessToken?: string | null;
  to?: string | null;
  brideName: string;
  groomName: string;
  guestName: string;
  message: string;
  slideshowUrl?: string;
}) {
  const preview =
    args.message.length > 200 ? `${args.message.slice(0, 200)}…` : args.message;
  const text =
    `💌 คำอวยพรใหม่สำหรับ ${args.brideName} & ${args.groomName}\n\n` +
    `จาก: ${args.guestName}\n"${preview}"` +
    (args.slideshowUrl ? `\n\nดูสไลด์โชว์: ${args.slideshowUrl}` : "");
  return pushLineMessage({
    channelAccessToken: args.channelAccessToken,
    to: args.to,
    messages: [{ type: "text", text }],
  });
}

/** Convenience: notify a couple that a new online envelope arrived. */
export async function notifyNewEnvelope(args: {
  channelAccessToken?: string | null;
  to?: string | null;
  brideName: string;
  groomName: string;
  guestName: string;
  amount: number;
  verifyStatus: string;
}) {
  const statusLabel =
    args.verifyStatus === "verified"
      ? "✅ ตรวจสอบสลิปแล้ว"
      : args.verifyStatus === "duplicate"
        ? "⚠️ สลิปซ้ำ"
        : args.verifyStatus === "failed"
          ? "❌ ตรวจสอบสลิปไม่ผ่าน"
          : "⏳ รอตรวจสอบ";
  const text =
    `🧧 มีคนใส่ซองออนไลน์ให้ ${args.brideName} & ${args.groomName}\n\n` +
    `จาก: ${args.guestName}\n` +
    `จำนวน: ${args.amount.toLocaleString("th-TH", {
      style: "currency",
      currency: "THB",
    })}\n` +
    `สถานะ: ${statusLabel}`;
  return pushLineMessage({
    channelAccessToken: args.channelAccessToken,
    to: args.to,
    messages: [{ type: "text", text }],
  });
}
