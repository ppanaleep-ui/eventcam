// Shapes shared between the server (SSE payloads / page props) and the client
// components in the live room. Kept free of server imports on purpose.

export type ListingWire = {
  id: string;
  title: string;
  emoji: string;
  photoUrl: string | null;
  type: string; // AUCTION | BUY_NOW
  status: string; // QUEUED | ACTIVE | SOLD | UNSOLD | CANCELLED
  startPrice: number;
  buyNowPrice: number | null;
  minIncrement: number;
  shippingFee: number;
  topBid: number;
  topBidderHandle: string | null;
  nextBid: number;
  endsAt: string | null;
  soldPrice: number | null;
};

export type ChatWire = {
  id: string;
  kind: "CHAT" | "SYSTEM";
  text: string;
  handle: string | null;
  displayName: string | null;
  avatarEmoji: string | null;
  createdAt: string;
};

export type WalletWire = {
  available: number;
  held: number;
  pending: number;
};
