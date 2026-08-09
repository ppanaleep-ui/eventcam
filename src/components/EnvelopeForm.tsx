"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function EnvelopeForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onPickSlip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSlipPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountNum = Number(amount);
    if (!guestName.trim()) return setError("กรุณากรอกชื่อของคุณ");
    if (!amountNum || amountNum <= 0) return setError("กรุณากรอกจำนวนเงินให้ถูกต้อง");
    if (!fileRef.current?.files?.[0]) return setError("กรุณาแนบสลิปการโอนเงิน");

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("guestName", guestName.trim());
      form.append("amount", String(amountNum));
      form.append("message", message.trim());
      form.append("slip", fileRef.current.files[0]);

      const res = await fetch(`/api/e/${slug}/envelopes`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "ส่งซองไม่สำเร็จ กรุณาลองใหม่");
      }
      router.push(`/e/${slug}/thanks?kind=envelope`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      <div>
        <label className="label">ชื่อของคุณ</label>
        <input
          className="input"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="ชื่อผู้ให้ซอง"
          maxLength={80}
        />
      </div>

      <div>
        <label className="label">จำนวนเงิน (บาท)</label>
        <input
          className="input"
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="เช่น 1000"
        />
      </div>

      <div>
        <label className="label">แนบสลิปการโอน</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickSlip}
          className="hidden"
          id="slip-photo"
        />
        <label
          htmlFor="slip-photo"
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blush-200 bg-white p-4 text-center hover:bg-blush-50"
        >
          {slipPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slipPreview}
              alt="ตัวอย่างสลิป"
              className="max-h-64 rounded-xl object-contain"
            />
          ) : (
            <span className="py-6 text-gray-500">🧾 แตะเพื่อแนบสลิปการโอน</span>
          )}
        </label>
      </div>

      <div>
        <label className="label">ข้อความถึงบ่าวสาว (ไม่บังคับ)</label>
        <textarea
          className="input min-h-[90px] resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="ยินดีด้วยนะ..."
          maxLength={500}
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      <button type="submit" className="btn-primary w-full text-base" disabled={submitting}>
        {submitting ? "กำลังส่ง..." : "ส่งซอง 🧧"}
      </button>
    </form>
  );
}
