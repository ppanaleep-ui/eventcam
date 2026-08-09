"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function WishForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [message, setMessage] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhotoPreview(null);
      return;
    }
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!guestName.trim()) {
      setError("กรุณากรอกชื่อของคุณ");
      return;
    }
    if (!message.trim()) {
      setError("กรุณาเขียนคำอวยพร");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("guestName", guestName.trim());
      form.append("message", message.trim());
      const file = fileRef.current?.files?.[0];
      if (file) form.append("photo", file);

      const res = await fetch(`/api/e/${slug}/wishes`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "ส่งคำอวยพรไม่สำเร็จ กรุณาลองใหม่");
      }
      router.push(`/e/${slug}/thanks?kind=wish`);
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
          placeholder="เช่น พี่หมูจากที่ทำงาน"
          maxLength={80}
        />
      </div>

      <div>
        <label className="label">รูปภาพ (ไม่บังคับ)</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPickPhoto}
          className="hidden"
          id="wish-photo"
        />
        <label
          htmlFor="wish-photo"
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blush-200 bg-white p-4 text-center hover:bg-blush-50"
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt="ตัวอย่างรูป"
              className="max-h-56 rounded-xl object-contain"
            />
          ) : (
            <span className="py-6 text-gray-500">
              📷 แตะเพื่อถ่ายรูป หรือเลือกรูปจากเครื่อง
            </span>
          )}
        </label>
        {photoPreview && (
          <button
            type="button"
            className="mt-2 text-sm text-blush-600 underline"
            onClick={() => {
              setPhotoPreview(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            ลบรูป
          </button>
        )}
      </div>

      <div>
        <label className="label">คำอวยพร</label>
        <textarea
          className="input min-h-[140px] resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="เขียนความปรารถนาดีถึงบ่าวสาว..."
          maxLength={1000}
        />
        <p className="mt-1 text-right text-xs text-gray-400">
          {message.length}/1000
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full text-base" disabled={submitting}>
        {submitting ? "กำลังส่ง..." : "ส่งคำอวยพร 💌"}
      </button>
    </form>
  );
}
