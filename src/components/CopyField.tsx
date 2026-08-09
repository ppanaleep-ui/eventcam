"use client";

import { useState } from "react";

export default function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the user can select the text manually
    }
  }

  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="input flex-1 text-sm" />
      <button type="button" onClick={copy} className="btn-secondary shrink-0">
        {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
      </button>
    </div>
  );
}
