# ลดค่า Render ให้เหลือน้อยที่สุด (ฉบับทำตามทีละขั้น)

เป้าหมาย: เก็บแอป EventCam ไว้ใช้ต่อ แต่จ่ายถูกลง

| สถานะ | ค่าใช้จ่าย/เดือน (ประมาณ) |
|---|---|
| เดิม (standard + disk 10GB) | ~$27–28 |
| **ส่วน A** ลดแผนเป็น starter (ทำแล้วในโค้ด) | ~$9.50 |
| **A + B** ย้าย DB ไป Neon + รูปไป R2 แล้วลบ disk | ~$7 หรือต่ำกว่า |

---

## ส่วน A — ลดแผน (✅ แก้โค้ดให้แล้ว)

ใน `render.yaml` เปลี่ยน `plan: standard` → `plan: starter` เรียบร้อย
เหลือแค่ push branch นี้แล้ว Render จะ redeploy เป็น starter ให้เอง (เพราะ `autoDeploy: true`)
หรือจะกดในหน้าเว็บก็ได้: dashboard.render.com → service `eventcam` → **Settings → Instance Type → Starter → Save**

> starter = 512MB RAM พอสำหรับงานเล็ก/ทดลอง ไม่เหมาะงาน 2,000 คนพร้อมกัน
> มีงานใหญ่เมื่อไหร่ค่อยเลื่อนขึ้น standard/pro เฉพาะช่วงงาน แล้วลดกลับ

---

## ส่วน B — เลิกจ่ายค่า disk (ต้องทำเองในหน้าเว็บ เพราะต้องใช้บัญชีของคุณ)

ไอเดีย: ย้าย "ฐานข้อมูล" และ "รูป/วิดีโอ" ออกจาก disk ของ Render ไปไว้ที่บริการฟรี
แล้วค่อยลบ disk — **โค้ดรองรับหมดแล้ว ตั้งแค่ environment variable ไม่ต้องแก้โค้ด**

> ⚠️ อย่าลบ disk จนกว่าจะทำ B1–B4 เสร็จและทดสอบว่าใช้งานได้ ไม่งั้นรูป/ข้อมูลหาย

### B1. ฐานข้อมูลฟรี → Neon (Postgres)

1. สมัคร https://neon.tech (ฟรี) → **Create project**
2. คัดลอก **Connection string** (หน้าตา `postgresql://user:pass@host/dbname?sslmode=require`)
3. ที่ Render → service `eventcam` → แท็บ **Environment** → **Add Environment Variable**:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | connection string ของ Neon |
   | `PGSSL` | `true` |

   พอ `DATABASE_URL` มีค่า โค้ดจะสลับไปใช้ Postgres เองอัตโนมัติ และสร้างตารางให้เองตอนเริ่ม (log จะขึ้น `DB backend: postgres`)

### B2. ที่เก็บรูปฟรี → Cloudflare R2 (ฟรี 10GB)

1. สมัคร Cloudflare → เข้าเมนู **R2** → **Create bucket** (เช่นชื่อ `eventcam`)
2. **เปิดให้อ่านรูปได้แบบ public** (จำเป็น ไม่งั้นรูปจะโหลดไม่ขึ้นในเบราว์เซอร์):
   - ในหน้า bucket → **Settings** → **Public access** → เปิด **R2.dev subdomain**
     จะได้ URL หน้าตา `https://pub-xxxxxxxx.r2.dev` ← จำไว้ใช้ข้อ `S3_PUBLIC_BASE`
   - (ถ้ามีโดเมนตัวเองจะผูก custom domain ก็ได้ ดีกว่าเรื่องความเร็ว)
3. สร้างกุญแจ API: R2 → **Manage R2 API Tokens** → **Create API token** (สิทธิ์ Object Read & Write)
   จะได้ **Access Key ID** + **Secret Access Key** (เก็บไว้ดีๆ โชว์ครั้งเดียว)
4. หา **Account ID** (อยู่ในหน้า R2 overview) เอาไปประกอบ endpoint:
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
5. ที่ Render → Environment → เพิ่ม env ชุดนี้ (ชื่อ key ตรงตามโค้ด `server/config.js`):

   | Key | Value | หมายเหตุ |
   |---|---|---|
   | `S3_BUCKET` | `eventcam` | ชื่อ bucket ที่สร้าง |
   | `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | endpoint สำหรับ "อัปโหลด" |
   | `S3_ACCESS_KEY_ID` | Access Key ID จากข้อ 3 | |
   | `S3_SECRET_ACCESS_KEY` | Secret Access Key จากข้อ 3 | |
   | `S3_REGION` | `auto` | R2 ใช้ `auto` |
   | `S3_PUBLIC_BASE` | `https://pub-xxxxxxxx.r2.dev` | URL public จากข้อ 2 (ที่เบราว์เซอร์ใช้ดึงรูป) |

   > สำคัญ: `S3_ENDPOINT` ใช้ "เขียน/อัปโหลด", ส่วน `S3_PUBLIC_BASE` ใช้ "อ่าน/แสดงรูป"
   > ต้องเป็น URL ที่เปิด public แล้ว (r2.dev หรือ custom domain) — ห้ามใส่ endpoint เดียวกัน
   > ไม่ต้องตั้ง `S3_FORCE_PATH_STYLE` (R2 ไม่ต้องใช้)

   พอ `S3_BUCKET` มีค่า โค้ดจะสลับไปเก็บไฟล์บน R2 เอง (log จะขึ้น `Storage backend: s3`)

### B3. เก็บรูปเดิมก่อนลบ disk (ถ้าเสียดายข้อมูลเก่า)

- ข้อมูลเดิมยังอยู่บน disk ของ Render การตั้ง env ใหม่จะมีผลกับ "ของใหม่" เท่านั้น
- ถ้าอยากเก็บรูปงานเก่า: เข้าแอปในฐานะเจ้าของอีเวนต์ → กดปุ่ม **Download** (โหลดทั้งอัลบั้มเป็น ZIP) เก็บลงเครื่องไว้
- ถ้าเป็นแค่งานทดลอง ไม่เสียดาย → ข้ามข้อนี้

### B4. ทดสอบ แล้วค่อยลบ disk

1. หลังใส่ env ครบ → Render redeploy อัตโนมัติ (หรือกด **Manual Deploy**)
2. เปิดเว็บ ทดสอบ: สร้างอีเวนต์ใหม่ + ถ่าย/อัปโหลดรูป + ดูว่ารูปแสดงขึ้น
   - ถ้ารูปขึ้น = R2 ใช้ได้ / ถ้าสร้างอีเวนต์/ล็อกอินได้ = Neon ใช้ได้
3. ดู Logs ให้เห็น `DB backend: postgres` และ `Storage backend: s3`
4. เมื่อมั่นใจแล้ว **ค่อยลบ disk**:
   - วิธีถาวร: ในโค้ด `render.yaml` ลบ block `disk:` ทั้งก้อน (บอกผมแก้ให้ได้) แล้ว push
   - หรือกดในหน้าเว็บ: Settings → ลบ disk `eventcam-data`
   - ⚠️ ลบแล้วข้อมูลใน disk หายถาวร — ทำหลังยืนยันว่าของใหม่ทำงานแล้วเท่านั้น

---

## หลังทำครบ

- ค่าใช้จ่ายเหลือ ~$7/เดือน (เฉพาะ web starter) — Neon + R2 อยู่ใน free tier
- ถ้างานไม่เยอะมากจริงๆ และรับได้ที่เว็บ "หลับ" ตอนไม่มีคนใช้ ยังมีทางลดต่ออีก (ย้าย web ไป Fly.io/Railway/Render free) — บอกได้ถ้าอยากไปทางนั้น

## เช็กลิสต์สั้น

- [ ] push branch เพื่อให้ plan = starter มีผล (ส่วน A)
- [ ] สมัคร Neon → ตั้ง `DATABASE_URL`, `PGSSL`
- [ ] สมัคร R2 → เปิด public → ตั้ง `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_PUBLIC_BASE`
- [ ] ทดสอบว่าถ่ายรูป/ดูรูป/ล็อกอินได้ + log ขึ้น postgres & s3
- [ ] (ถ้าต้องการ) โหลดรูปเก่าเก็บไว้
- [ ] ลบ disk
