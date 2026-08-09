"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary print:hidden">
      🖨️ พิมพ์ / บันทึกเป็น PDF
    </button>
  );
}
