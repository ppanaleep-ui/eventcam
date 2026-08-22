"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { adminEmails } from "@/lib/config";

export type FormState = { error?: string } | undefined;

const AVATARS = ["🦊", "🐼", "🐙", "🦄", "🐝", "🦖", "🐳", "🦁", "🐧", "🐢"];

const signUpSchema = z.object({
  email: z.string().email("Enter a valid e-mail"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(2, "Tell us your name").max(40),
  handle: z
    .string()
    .min(3, "Handle must be at least 3 characters")
    .max(20)
    .regex(/^[a-z0-9_]+$/, "Handle can only use a-z, 0-9 and _"),
});

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    displayName: String(formData.get("displayName") ?? "").trim(),
    handle: String(formData.get("handle") ?? "").trim().toLowerCase(),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const { email, password, displayName, handle } = parsed.data;

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email }, { handle }] },
    select: { email: true },
  });
  if (clash) {
    return { error: clash.email === email ? "That e-mail is already registered" : "That handle is taken" };
  }

  const user = await prisma.user.create({
    data: {
      email,
      handle,
      displayName,
      passwordHash: await hashPassword(password),
      avatarEmoji: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      isAdmin: adminEmails().includes(email),
      // Every account gets a wallet up front, so balances never need a null check.
      wallet: { create: {} },
    },
  });

  await createSession({ userId: user.id, email: user.email });
  redirect("/");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your e-mail and password" };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Wrong e-mail or password" };
  }

  // Admin list lives in the environment; keep the flag in sync on every login.
  const shouldBeAdmin = adminEmails().includes(email);
  if (shouldBeAdmin !== user.isAdmin) {
    await prisma.user.update({ where: { id: user.id }, data: { isAdmin: shouldBeAdmin } });
  }

  await createSession({ userId: user.id, email: user.email });
  redirect("/");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
