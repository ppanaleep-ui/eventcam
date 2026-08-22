"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions/shows";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
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

export function CreateShowForm({ action }: { action: Action }) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <Notice state={state} />
      <div className="grid gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor="coverEmoji">
            Cover
          </label>
          <input className="input text-center text-xl" id="coverEmoji" name="coverEmoji" defaultValue="📦" maxLength={8} />
        </div>
        <div>
          <label className="label" htmlFor="title">
            Show title
          </label>
          <input className="input" id="title" name="title" placeholder="Friday night sneaker drop" required />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <input className="input" id="category" name="category" defaultValue="Collectibles" />
        </div>
        <div>
          <label className="label" htmlFor="scheduledAt">
            Starts at (optional)
          </label>
          <input className="input" id="scheduledAt" name="scheduledAt" type="datetime-local" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="streamUrl">
          Stream embed URL (optional)
        </label>
        <input
          className="input"
          id="streamUrl"
          name="streamUrl"
          placeholder="https://www.youtube.com/embed/…"
        />
      </div>
      <div>
        <label className="label" htmlFor="description">
          What are you selling?
        </label>
        <textarea className="input" id="description" name="description" rows={2} />
      </div>
      <Submit label="Create show" />
    </form>
  );
}

export function AddListingForm({ action, showId }: { action: Action; showId: string }) {
  const [state, formAction] = useFormState(action, undefined);
  const [type, setType] = useState("AUCTION");

  return (
    <form action={formAction} className="space-y-3">
      <Notice state={state} />
      <input type="hidden" name="showId" value={showId} />

      <div className="flex gap-2">
        {[
          { value: "AUCTION", label: "🔨 Auction" },
          { value: "BUY_NOW", label: "🛒 Buy now" },
        ].map((option) => (
          <label
            key={option.value}
            className={`btn cursor-pointer ${type === option.value ? "bg-neon-500 text-ink-900" : "border border-white/15 bg-white/5"}`}
          >
            <input
              className="sr-only"
              type="radio"
              name="type"
              value={option.value}
              checked={type === option.value}
              onChange={() => setType(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor="emoji">
            Icon
          </label>
          <input className="input text-center text-xl" id="emoji" name="emoji" defaultValue="🎁" maxLength={8} />
        </div>
        <div>
          <label className="label" htmlFor="item-title">
            Item name
          </label>
          <input className="input" id="item-title" name="title" placeholder="1999 holo card, PSA 9" required />
        </div>
      </div>

      {type === "AUCTION" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="startPrice">
              Opening bid ฿
            </label>
            <input className="input" id="startPrice" name="startPrice" defaultValue="100" inputMode="decimal" />
          </div>
          <div>
            <label className="label" htmlFor="minIncrement">
              Increment ฿
            </label>
            <input className="input" id="minIncrement" name="minIncrement" defaultValue="20" inputMode="decimal" />
          </div>
          <div>
            <label className="label" htmlFor="durationSec">
              Timer (sec)
            </label>
            <input className="input" id="durationSec" name="durationSec" defaultValue="30" type="number" min={10} max={600} />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="buyNowPrice">
              Price ฿
            </label>
            <input className="input" id="buyNowPrice" name="buyNowPrice" defaultValue="500" inputMode="decimal" />
          </div>
          <input type="hidden" name="startPrice" value="1" />
          <input type="hidden" name="minIncrement" value="1" />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="shippingFee">
            Shipping ฿
          </label>
          <input className="input" id="shippingFee" name="shippingFee" defaultValue="0" inputMode="decimal" />
        </div>
        <div>
          <label className="label" htmlFor="photo">
            Photo (optional)
          </label>
          <input className="input" id="photo" name="photo" type="file" accept="image/*" />
        </div>
      </div>

      <Submit label="Add to queue" />
    </form>
  );
}
