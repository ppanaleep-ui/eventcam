"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createEventAction, type FormResult } from "@/app/actions/events";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full text-base" disabled={pending}>
      {pending ? "กำลังสร้าง..." : "สร้างงาน"}
    </button>
  );
}

export default function CreateEventForm() {
  const [state, action] = useFormState<FormResult, FormData>(
    createEventAction,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">ชื่อเจ้าสาว</label>
          <input name="brideName" className="input" placeholder="เจ้าสาว" required />
        </div>
        <div>
          <label className="label">ชื่อเจ้าบ่าว</label>
          <input name="groomName" className="input" placeholder="เจ้าบ่าว" required />
        </div>
      </div>
      <div>
        <label className="label">วันจัดงาน (ไม่บังคับ)</label>
        <input name="eventDate" type="date" className="input" />
      </div>
      <div>
        <label className="label">สถานที่ (ไม่บังคับ)</label>
        <input name="venue" className="input" placeholder="เช่น โรงแรม..." />
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}
