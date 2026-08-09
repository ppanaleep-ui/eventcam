"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateEventAction, type FormResult } from "@/app/actions/events";

type EventData = {
  id: string;
  brideName: string;
  groomName: string;
  eventDate: Date | null;
  venue: string | null;
  welcomeMessage: string | null;
  envelopeEnabled: boolean;
  moderateWishes: boolean;
  promptPayId: string | null;
  promptPayName: string | null;
  lineChannelAccessToken: string | null;
  lineUserId: string | null;
};

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
    </button>
  );
}

export default function SettingsForm({ event }: { event: EventData }) {
  const [state, action] = useFormState<FormResult, FormData>(
    updateEventAction.bind(null, event.id),
    undefined,
  );

  const dateValue = event.eventDate
    ? new Date(event.eventDate).toISOString().slice(0, 10)
    : "";

  return (
    <form action={action} className="flex flex-col gap-8">
      {/* Basic details */}
      <section className="card flex flex-col gap-4">
        <h3 className="font-semibold text-gray-900">รายละเอียดงาน</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">ชื่อเจ้าสาว</label>
            <input name="brideName" defaultValue={event.brideName} className="input" required />
          </div>
          <div>
            <label className="label">ชื่อเจ้าบ่าว</label>
            <input name="groomName" defaultValue={event.groomName} className="input" required />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">วันจัดงาน</label>
            <input name="eventDate" type="date" defaultValue={dateValue} className="input" />
          </div>
          <div>
            <label className="label">สถานที่</label>
            <input name="venue" defaultValue={event.venue ?? ""} className="input" />
          </div>
        </div>
        <div>
          <label className="label">ข้อความต้อนรับแขก</label>
          <textarea
            name="welcomeMessage"
            defaultValue={event.welcomeMessage ?? ""}
            className="input min-h-[80px] resize-y"
            placeholder="ข้อความที่แขกจะเห็นเมื่อสแกน QR"
          />
        </div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="moderateWishes"
            defaultChecked={event.moderateWishes}
            className="h-5 w-5 rounded border-blush-300 text-blush-600"
          />
          <span className="text-sm text-gray-700">
            ตรวจสอบคำอวยพรก่อนแสดงบนสไลด์โชว์ (โหมดกลั่นกรอง)
          </span>
        </label>
      </section>

      {/* Online envelope */}
      <section className="card flex flex-col gap-4">
        <h3 className="font-semibold text-gray-900">🧧 ซองออนไลน์ (PromptPay)</h3>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="envelopeEnabled"
            defaultChecked={event.envelopeEnabled}
            className="h-5 w-5 rounded border-blush-300 text-blush-600"
          />
          <span className="text-sm text-gray-700">เปิดรับซองออนไลน์</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">PromptPay (เบอร์มือถือ หรือเลขบัตรประชาชน)</label>
            <input
              name="promptPayId"
              defaultValue={event.promptPayId ?? ""}
              className="input"
              placeholder="0812345678"
            />
          </div>
          <div>
            <label className="label">ชื่อบัญชี (แสดงให้แขกเห็น)</label>
            <input
              name="promptPayName"
              defaultValue={event.promptPayName ?? ""}
              className="input"
              placeholder="ชื่อ-นามสกุล"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          ระบบจะสร้าง QR PromptPay ให้แขกสแกนโอนเข้าบัญชีนี้โดยตรง
          หากเปิดใช้บริการตรวจสอบสลิป (ตั้งค่าฝั่งเซิร์ฟเวอร์) ระบบจะตรวจสอบให้อัตโนมัติ
          มิฉะนั้นสามารถยืนยันเองได้ในหน้าซองออนไลน์
        </p>
      </section>

      {/* LINE notifications */}
      <section className="card flex flex-col gap-4">
        <h3 className="font-semibold text-gray-900">💬 แจ้งเตือนเข้า LINE</h3>
        <p className="text-sm text-gray-500">
          กรอก Channel access token และ userId/groupId ปลายทางจาก LINE Official Account
          เพื่อรับแจ้งเตือนคำอวยพรและซองแบบเรียลไทม์ (เว้นว่างได้ถ้ายังไม่ใช้)
        </p>
        <div>
          <label className="label">LINE Channel Access Token</label>
          <input
            name="lineChannelAccessToken"
            defaultValue={event.lineChannelAccessToken ?? ""}
            className="input"
            placeholder="วาง token ที่นี่"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label">ปลายทาง (userId / groupId)</label>
          <input
            name="lineUserId"
            defaultValue={event.lineUserId ?? ""}
            className="input"
            placeholder="Uxxxxxxxx..."
            autoComplete="off"
          />
        </div>
      </section>

      <div className="flex items-center gap-4">
        <Save />
        {state?.ok && <span className="text-sm text-green-600">บันทึกแล้ว ✓</span>}
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
