/**
 * LAN-336. The approved Yes and No WhatsApp buttons carry `/a/yes/` and
 * `/a/no/` as their fixed prefixes — Meta refuses two dynamic buttons that
 * share one base URL — and the adapter sends only the token as each button's
 * suffix. The token already encodes which button was pressed
 * (`player-answer-tokens.ts`), so this route is a pass-through: it renders
 * exactly what `/a/[token]` renders and adds no logic of its own.
 */
export { default } from "@/app/a/[token]/page";
export const dynamic = "force-dynamic";
