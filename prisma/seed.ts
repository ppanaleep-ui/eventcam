import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@photowish.app";
  const password = "password123";

  // Idempotent: wipe any previous demo user + cascade.
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      displayName: "Demo Couple",
    },
  });

  const event = await prisma.event.create({
    data: {
      slug: crypto.randomBytes(6).toString("hex"),
      ownerId: user.id,
      brideName: "พลอย",
      groomName: "ภูมิ",
      eventDate: new Date("2026-12-12"),
      venue: "โรงแรมตัวอย่าง แกรนด์บอลรูม",
      welcomeMessage:
        "ขอบคุณที่มาร่วมเป็นส่วนหนึ่งในวันสำคัญของเรา 🤍 ร่วมส่งรูปและคำอวยพรให้เราได้เลย",
      envelopeEnabled: true,
      promptPayId: "0812345678",
      promptPayName: "พลอย & ภูมิ",
      moderateWishes: false,
    },
  });

  await prisma.wish.createMany({
    data: [
      {
        eventId: event.id,
        guestName: "พี่แนน",
        message: "ยินดีกับคู่บ่าวสาวมากๆ นะคะ ขอให้รักกันยืนยาวตลอดไป 💕",
      },
      {
        eventId: event.id,
        guestName: "เพื่อนสมัยเรียน",
        message: "แต่งงานกันซะที! ขอให้มีความสุขมากๆ นะเพื่อน 🎉",
      },
      {
        eventId: event.id,
        guestName: "ครอบครัวฝั่งเจ้าสาว",
        message: "ขอให้ทั้งสองคนครองรักกันจนแก่เฒ่า มีลูกเต็มบ้านหลานเต็มเมืองนะจ๊ะ",
      },
    ],
  });

  await prisma.envelope.createMany({
    data: [
      {
        eventId: event.id,
        guestName: "พี่แนน",
        amount: 2000,
        verifyStatus: "unverified",
        slipUrl: null,
      },
      {
        eventId: event.id,
        guestName: "เพื่อนสมัยเรียน",
        amount: 1000,
        verifyStatus: "verified",
        verifyRef: "DEMO-REF-0001",
        slipUrl: null,
      },
    ],
  });

  console.log("\n✅ Seed complete!");
  console.log("   Login:", email, "/", password);
  console.log("   Event slug:", event.slug);
  console.log(`   Guest page:    /e/${event.slug}`);
  console.log(`   Slideshow:     /e/${event.slug}/slideshow\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
