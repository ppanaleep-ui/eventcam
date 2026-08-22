"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { formatMoney } from "@/lib/money";
import type { FormState } from "@/app/actions/wallet";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function Submit({ label, className = "btn-primary w-full" }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? "Working…" : label}
    </button>
  );
}

function Notice({ state }: { state: FormState }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p
      className={`rounded-xl px-3 py-2 text-sm ${
        state.error ? "bg-hot-500/10 text-hot-400" : "bg-neon-500/10 text-neon-300"
      }`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

const QUICK_AMOUNTS = [20000, 50000, 100000, 300000];

export function TopUpForm({ action }: { action: Action }) {
  const [state, formAction] = useFormState(action, undefined);
  const [amount, setAmount] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <Notice state={state} />
      <div>
        <label className="label" htmlFor="amount">
          Amount (THB)
        </label>
        <input
          className="input"
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="500"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((quick) => (
          <button
            key={quick}
            type="button"
            onClick={() => setAmount((quick / 100).toFixed(2))}
            className="chip hover:bg-white/10"
          >
            {formatMoney(quick)}
          </button>
        ))}
      </div>
      <Submit label="Get PromptPay QR" />
    </form>
  );
}

export function SlipForm({ action, topUpId }: { action: Action; topUpId: string }) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <Notice state={state} />
      <input type="hidden" name="topUpId" value={topUpId} />
      <div>
        <label className="label" htmlFor="slip">
          Upload your transfer slip
        </label>
        <input className="input" id="slip" name="slip" type="file" accept="image/*" required />
      </div>
      <Submit label="Submit slip" />
    </form>
  );
}

export function WithdrawForm({ action, available }: { action: Action; available: number }) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <Notice state={state} />
      <div>
        <label className="label" htmlFor="w-amount">
          Amount (THB) — up to {formatMoney(available)}
        </label>
        <input className="input" id="w-amount" name="amount" inputMode="decimal" placeholder="1000" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="bankName">
            Bank
          </label>
          <input className="input" id="bankName" name="bankName" placeholder="Kasikorn" required />
        </div>
        <div>
          <label className="label" htmlFor="accountNo">
            Account number
          </label>
          <input className="input" id="accountNo" name="accountNo" placeholder="123-4-56789-0" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="accountName">
          Account name
        </label>
        <input className="input" id="accountName" name="accountName" placeholder="Ploy S." required />
      </div>
      <Submit label="Request withdrawal" className="btn-ghost w-full" />
    </form>
  );
}
