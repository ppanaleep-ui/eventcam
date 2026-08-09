import { prisma } from "@/lib/db";
import SettingsForm from "@/components/SettingsForm";
import {
  uploadCoverAction,
  addMediaAction,
  deleteMediaAction,
} from "@/app/actions/events";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: { eventId: string };
}) {
  const { eventId } = params;
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const media = await prisma.media.findMany({
    where: { eventId },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
  });

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-lg font-semibold text-gray-900">ตั้งค่างาน</h2>

      <SettingsForm event={event} />

      {/* Cover image */}
      <section className="card flex flex-col gap-4">
        <h3 className="font-semibold text-gray-900">รูปหน้าปก</h3>
        <div className="flex items-center gap-4">
          {event.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.coverImageUrl}
              alt="cover"
              className="h-24 w-40 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-24 w-40 items-center justify-center rounded-xl bg-blush-100 text-2xl">
              💐
            </div>
          )}
          <form
            action={uploadCoverAction.bind(null, eventId)}
            className="flex items-center gap-2"
          >
            <input
              type="file"
              name="cover"
              accept="image/*"
              required
              className="text-sm"
            />
            <button className="btn-secondary">อัปโหลด</button>
          </form>
        </div>
      </section>

      {/* Prewedding / atmosphere media */}
      <section className="card flex flex-col gap-4">
        <h3 className="font-semibold text-gray-900">
          รูป Pre-wedding &amp; บรรยากาศงาน
        </h3>
        <p className="text-sm text-gray-500">
          รูปเหล่านี้จะฉายสลับกับคำอวยพรบนสไลด์โชว์ และใช้จัดหนังสือที่ระลึก
        </p>
        <form
          action={addMediaAction.bind(null, eventId)}
          className="flex flex-wrap items-center gap-2"
        >
          <select name="kind" className="input w-auto py-2">
            <option value="prewedding">Pre-wedding</option>
            <option value="atmosphere">บรรยากาศงาน</option>
          </select>
          <input
            type="file"
            name="files"
            accept="image/*"
            multiple
            required
            className="text-sm"
          />
          <button className="btn-secondary">เพิ่มรูป</button>
        </form>

        {media.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {media.map((m) => (
              <div key={m.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt={m.kind}
                  className="aspect-square w-full rounded-xl object-cover"
                />
                <span className="absolute left-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                  {m.kind === "prewedding" ? "Pre-wedding" : "บรรยากาศ"}
                </span>
                <form
                  action={deleteMediaAction.bind(null, eventId, m.id)}
                  className="absolute right-1 top-1"
                >
                  <button
                    className="rounded-full bg-black/50 px-2 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
                    title="ลบรูป"
                  >
                    ✕
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
