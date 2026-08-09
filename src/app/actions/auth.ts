"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

const credsSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
});

export type AuthState = { error?: string } | undefined;

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "อีเมลนี้ถูกใช้งานแล้ว" };
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(parsed.data.password),
      displayName: String(formData.get("displayName") || "").trim() || null,
    },
  });

  await createSession({ userId: user.id, email: user.email });
  redirect("/dashboard");
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  }
  const email = parsed.data.email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  }

  await createSession({ userId: user.id, email: user.email });
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
