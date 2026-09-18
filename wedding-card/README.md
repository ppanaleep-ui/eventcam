# 💌 E-Wedding Card — Panalee & Saharat

An animated digital version of the printed invitation for **ปณาลี (สุรอยญา) ปิติเศรษฐ**
and **สหรัฐ (ฟาฮัต) พึ่งและ**, 13 December 2569 (2026) at Moonstar Convention Hall.

The concept: **receiving the card should feel like receiving flowers.** A sealed
envelope arrives, the wax seal breaks along the flap, the card slides out, and the
paper calla lilies bloom across the cover.

## The artwork is the real card

Nothing here is redrawn. `art/` holds the couple's own printed artwork, cut out of
the supplied scans and mockups:

| File | Source |
| --- | --- |
| `cover-front.webp`, `cover-back.webp` | the cover scan, split at the fold |
| `inside-left.webp`, `inside-right.webp` | the inside spread, split at the fold |
| `env-body.webp`, `env-flap.webp` | the envelope photo, split along the flap seam so the flap can hinge — the wax seal breaks across that seam exactly as it would in the hand |
| `lily.webp` | the paper calla lily layer, masked out of the mockup photograph |

`art/build.py` regenerates all of them from the original images.

## How it runs

One self-contained page — no build step, no dependencies:

```bash
open wedding-card/index.html          # or serve the folder from any static host
```

The only external requests are the image files beside it and Google Fonts
(Sarabun, Cormorant Garamond, Parisienne) for the interface text around the card.

## The three scenes

| Scene | What happens |
| --- | --- |
| **Envelope** | Tap: the flap swings back on a 3D hinge, splitting the wax seal, and the card slides up out of the envelope |
| **Cover** | The card arrives full size and the calla lilies bloom up from the bottom-left, settling where they sit on the printed card |
| **Inside** | The cover swings open on its spine — its reverse carrying the P&S monogram — revealing the invitation and the wedding timeline |

A canvas layer drifts rose petals through every scene, with a burst at each step.

## Beyond the paper

Four things paper can't do, kept outside the card face so the card itself stays true:
a live countdown to 11.00 น. on the day, a map link, an add-to-calendar link,
and a share button for passing the card on.

## Notes

- Responsive: the bifold opens as a true two-page spread from 880px up, and stacks
  into one scrolling column on phones.
- `prefers-reduced-motion` is respected — scenes still advance, but the petals,
  bursts and long transitions are switched off.
- Single-theme by design: this is a letterpress invitation, so every colour is
  painted explicitly rather than following the viewer's dark mode.
