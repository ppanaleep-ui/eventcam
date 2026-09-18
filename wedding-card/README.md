# 💌 E-Wedding Card — Panalee & Saharat

An animated digital version of the printed invitation for **ปณาลี (สุรอยญา) ปิติเศรษฐ**
and **สหรัฐ (ฟาฮัต) พึ่งและ**, 13 December 2569 (2026) at Moonstar Convention Hall.

The concept: **receiving the card should feel like receiving flowers.** A sealed
envelope arrives, the wax seal lifts, petals scatter, and calla lilies bloom out of
the cover as the card opens.

## How it runs

One self-contained file — no build step, no dependencies:

```bash
open wedding-card/index.html          # or serve the folder from any static host
```

The only external requests are Google Fonts (Parisienne, Cormorant Garamond,
Trirong, Sarabun); everything else — artwork, animation, layout — is inline.

## The three scenes

| Scene | What happens |
| --- | --- |
| **Envelope** | Sage-bordered envelope with a copper wax seal (P&S monogram). Tap: the seal lifts away, the flap swings back, the card rises out, petals burst |
| **Cover** | The die-cut ornate frame draws itself in, calla lilies bloom up from the bottom-left, `Panalee & Saharat · #FaFonPorjai` |
| **Inside** | The cover swings open on a real 3D hinge (its reverse carries the P&S monogram), revealing the bifold spread: invitation on the left, wedding timeline on the right |

A canvas layer drifts rose petals across every scene, and each transition
releases a burst of them.

## Faithful to the print

All artwork is hand-built SVG matched to the printed card: the scalloped die-cut
frame with its vine, roses and buds; the calla lily cluster; the ribbon oval and
bouquet on the invitation leaf; and the seven hand-drawn timeline icons
(nikah couple, ring box, place setting, dove, toast, camera, car, cat).
Text, names, times and the embossed damask ground follow the printed card exactly.

## Beyond the paper

Four things paper can't do, kept outside the card face so the card itself stays true:
a live countdown to 11.00 น. on the day, a map link, an add-to-calendar link,
and a share button for passing the card on.

## Notes

- Responsive: the bifold opens as a true two-page spread from 860px up, and stacks
  into one scrolling column on phones.
- `prefers-reduced-motion` is respected — scenes still advance, but the ambient
  petals, bursts and long transitions are switched off.
- Layout is single-theme by design: this is a letterpress invitation, so every
  colour is painted explicitly rather than following the viewer's dark mode.
