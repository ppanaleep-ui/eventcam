"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Slide =
  | { kind: "photo"; id: string; url: string; caption?: string }
  | { kind: "wish"; id: string; guestName: string; message: string; photoUrl?: string };

const SLIDE_MS = 7000;

export default function Slideshow({
  slug,
  coupleName,
  initialPhotos,
  initialWishes,
}: {
  slug: string;
  coupleName: string;
  initialPhotos: Slide[];
  initialWishes: Slide[];
}) {
  const photosRef = useRef<Slide[]>(initialPhotos);
  const wishesRef = useRef<Slide[]>(initialWishes);
  const photoIdx = useRef(0);
  const wishIdx = useRef(0);
  // Toggle: alternate photo / wish. Start with a photo.
  const showPhotoNext = useRef(true);
  // Newly arrived wishes get shown ASAP.
  const priorityQueue = useRef<Slide[]>([]);

  const [current, setCurrent] = useState<Slide | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [isNew, setIsNew] = useState(false);

  const pickNext = useCallback((): Slide | null => {
    // 1) Any freshly-arrived wish takes priority.
    const fresh = priorityQueue.current.shift();
    if (fresh) {
      showPhotoNext.current = true; // after a fresh wish, go back to a photo
      return fresh;
    }

    const photos = photosRef.current;
    const wishes = wishesRef.current;

    if (photos.length === 0 && wishes.length === 0) return null;

    // 2) Alternate, but gracefully fall back when one pool is empty.
    const wantPhoto = showPhotoNext.current;
    showPhotoNext.current = !showPhotoNext.current;

    if (wantPhoto && photos.length > 0) {
      const slide = photos[photoIdx.current % photos.length];
      photoIdx.current += 1;
      return slide;
    }
    if (!wantPhoto && wishes.length > 0) {
      const slide = wishes[wishIdx.current % wishes.length];
      wishIdx.current += 1;
      return slide;
    }
    // Requested pool empty → use the other.
    if (photos.length > 0) {
      const slide = photos[photoIdx.current % photos.length];
      photoIdx.current += 1;
      return slide;
    }
    const slide = wishes[wishIdx.current % wishes.length];
    wishIdx.current += 1;
    return slide;
  }, []);

  const advance = useCallback(
    (markNew = false) => {
      const next = pickNext();
      if (next) {
        setCurrent(next);
        setIsNew(markNew && next.kind === "wish");
        setRenderKey((k) => k + 1);
      }
    },
    [pickNext],
  );

  // Auto-advance loop.
  useEffect(() => {
    advance();
    const t = setInterval(() => advance(), SLIDE_MS);
    return () => clearInterval(t);
  }, [advance]);

  // Live updates: prioritize incoming wishes and add them to the pool.
  useEffect(() => {
    const es = new EventSource(`/api/e/${slug}/stream`);
    es.addEventListener("wish", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        const slide: Slide = {
          kind: "wish",
          id: data.id,
          guestName: data.guestName,
          message: data.message,
          photoUrl: data.photoUrl ?? undefined,
        };
        wishesRef.current = [slide, ...wishesRef.current];
        priorityQueue.current.push(slide);
        // Show the brand-new wish right away.
        advance(true);
      } catch {
        /* ignore malformed */
      }
    });
    return () => es.close();
  }, [slug, advance]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-950 text-white">
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blush-900/40 via-neutral-950 to-neutral-950" />

      {current ? (
        <div
          key={renderKey}
          className="absolute inset-0 flex items-center justify-center animate-[fade-in_0.8s_ease-out]"
        >
          {current.kind === "photo" ? (
            <PhotoSlide slide={current} />
          ) : (
            <WishSlide slide={current} isNew={isNew} />
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-6xl">💐</div>
          <h1 className="mt-6 font-serif text-4xl">{coupleName}</h1>
          <p className="mt-4 text-white/60">
            รอคำอวยพรและรูปภาพจากแขกผู้มีเกียรติ...
          </p>
        </div>
      )}

      {/* Persistent couple name footer */}
      <div className="absolute bottom-6 left-0 right-0 text-center">
        <p className="font-serif text-lg tracking-wide text-white/70">
          {coupleName}
        </p>
      </div>
    </div>
  );
}

function PhotoSlide({ slide }: { slide: Extract<Slide, { kind: "photo" }> }) {
  return (
    <div className="relative h-full w-full">
      {/* Blurred fill background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slide.url}
        alt=""
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slide.url}
        alt=""
        className="absolute inset-0 m-auto max-h-[88vh] max-w-[92vw] object-contain drop-shadow-2xl"
      />
      {slide.caption && (
        <p className="absolute bottom-16 left-0 right-0 text-center font-serif text-2xl">
          {slide.caption}
        </p>
      )}
    </div>
  );
}

function WishSlide({
  slide,
  isNew,
}: {
  slide: Extract<Slide, { kind: "wish" }>;
  isNew: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center px-10 text-center">
      {isNew && (
        <span className="mb-6 animate-pulse rounded-full bg-blush-500 px-5 py-2 text-sm font-semibold tracking-wide">
          💌 คำอวยพรใหม่!
        </span>
      )}
      {slide.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slide.photoUrl}
          alt=""
          className="mb-8 max-h-[46vh] rounded-3xl object-contain shadow-2xl ring-4 ring-white/10"
        />
      )}
      <blockquote className="font-serif text-3xl leading-relaxed text-white sm:text-4xl">
        “{slide.message}”
      </blockquote>
      <p className="mt-8 text-xl text-blush-200">— {slide.guestName}</p>
    </div>
  );
}
