import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

const features = [
  {
    icon: "📱",
    title: "อวยพรผ่านมือถือ",
    desc: "แขกสแกน QR หน้างาน อัปโหลดรูปตัวเอง แล้วพิมพ์คำอวยพรได้ทันที มีเวลาเรียบเรียงความรู้สึกเต็มที่",
  },
  {
    icon: "🔗",
    title: "แขกที่มาไม่ได้ก็ร่วมได้",
    desc: "ส่งลิงก์อวยพรออนไลน์ให้เพื่อนหรือญาติที่ติดธุระ ให้ร่วมส่งความปรารถนาดีเข้ามาในงาน",
  },
  {
    icon: "💬",
    title: "แจ้งเตือนเข้า LINE ทันที",
    desc: "ทุกคำอวยพรและซองออนไลน์ที่ส่งเข้ามา แจ้งเตือนเข้า LINE ของบ่าวสาวแบบเรียลไทม์",
  },
  {
    icon: "🖥️",
    title: "สไลด์โชว์หน้างาน",
    desc: "ฉายรูป Pre-wedding สลับกับคำอวยพรที่เพิ่งส่งเข้ามาขึ้นจอใหญ่แบบเรียลไทม์ เพียงส่งลิงก์ให้โรงแรมเปิด",
  },
  {
    icon: "🧧",
    title: "ใส่ซองออนไลน์",
    desc: "แขกโอนเข้าบัญชีบ่าวสาวผ่าน PromptPay แล้วแนบสลิป ระบบสรุปยอดให้อัตโนมัติอย่างเป็นระเบียบ",
  },
  {
    icon: "📖",
    title: "หนังสือที่ระลึกเล่มจริง",
    desc: "รวมคำอวยพร รูปแขก ภาพ Pre-wedding และบรรยากาศในงาน จัดเลย์เอาต์ตีพิมพ์เป็น Photobook เล่มสวย",
  },
];

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-xl font-bold text-blush-700">
          <span aria-hidden>💐</span> PhotoWish
        </div>
        <nav className="flex items-center gap-3">
          {user ? (
            <Link href="/dashboard" className="btn-primary">
              แดชบอร์ด
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                เข้าสู่ระบบ
              </Link>
              <Link href="/signup" className="btn-primary">
                เริ่มต้นใช้งาน
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="mb-4 inline-block rounded-full bg-blush-100 px-4 py-1.5 text-sm font-medium text-blush-700">
          สมุดอวยพรงานแต่งงานยุคใหม่
        </p>
        <h1 className="font-serif text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">
          เก็บทุกคำอวยพรและความทรงจำในวันสำคัญ
          <br />
          <span className="text-blush-600">ไว้เป็นหนังสือเล่มจริง</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
          PhotoWish ผสานระบบดิจิทัลเข้ากับของที่ระลึกที่จับต้องได้ — แขกส่งรูปและคำอวยพรผ่านมือถือ
          ขึ้นจอสไลด์โชว์หน้างานแบบเรียลไทม์ ใส่ซองออนไลน์ได้ และจบงานด้วยหนังสืออวยพรเล่มสวย
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={user ? "/dashboard" : "/signup"} className="btn-primary text-base">
            สร้างงานของคุณ
          </Link>
          <Link href="#features" className="btn-secondary text-base">
            ดูฟีเจอร์ทั้งหมด
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card">
              <div className="mb-3 text-3xl" aria-hidden>
                {f.icon}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">{f.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-10 text-center font-serif text-3xl font-bold text-gray-900">
          ใช้งานง่ายใน 3 ขั้นตอน
        </h2>
        <ol className="grid gap-8 sm:grid-cols-3">
          {[
            {
              n: "1",
              t: "เตรียมงาน",
              d: "บ่าวสาวสร้างงาน ตั้งค่าชื่อคู่บ่าวสาว บัญชี PromptPay และเชื่อม LINE แล้วพิมพ์ QR ไปวางหน้างาน",
            },
            {
              n: "2",
              t: "ระหว่างงาน",
              d: "แขกสแกน QR ส่งรูป+คำอวยพร และใส่ซองออนไลน์ คำอวยพรขึ้นจอสไลด์โชว์ทันที บ่าวสาวรับแจ้งเตือนเข้า LINE",
            },
            {
              n: "3",
              t: "หลังงาน",
              d: "ดูสรุปยอดซองออนไลน์ และรับหนังสืออวยพรเล่มจริงที่รวมทุกความทรงจำจากงาน",
            },
          ].map((s) => (
            <li key={s.n} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blush-600 text-lg font-bold text-white">
                {s.n}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">{s.t}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-blush-100 py-8 text-center text-sm text-gray-500">
        <p>💐 PhotoWish — ทุกคำอวยพร คือความทรงจำ</p>
      </footer>
    </main>
  );
}
