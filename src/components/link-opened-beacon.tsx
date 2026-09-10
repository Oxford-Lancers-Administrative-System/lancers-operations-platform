"use client";

import { useEffect, useRef } from "react";

/**
 * Says that a person, not a crawler, opened this page — LAN-269.
 *
 * ## The problem it solves
 *
 * The links this club sends are pasted into WhatsApp and iMessage, and both
 * fetch the URL to build a preview card the moment the message is composed —
 * before the recipient has seen it, and again for every other person in the
 * chat. Those fetches are ordinary `GET`s and are indistinguishable, at the
 * request, from the player finally tapping the link.
 *
 * So the `GET` writes nothing. Everything that used to be stamped during a
 * render is stamped from here instead: this component mounts only in a browser
 * that ran the page's JavaScript, which no preview crawler does. WhatsApp,
 * Apple and Facebook all fetch, parse the `<head>`, and stop.
 *
 * ## What it deliberately is not
 *
 * **Not a user-agent test.** A blocklist of crawler names is a list somebody has
 * to keep, and it is wrong on the day a new one appears — which is the day it
 * matters. Whether JavaScript ran is a property of the client, not a claim it
 * makes about itself.
 *
 * **Not analytics, and not a tracker.** It reports one bit — this link was
 * opened — to the club's own database, against the link, never against the
 * person. It sets no cookie, reads no storage and takes no fingerprint.
 *
 * **Not something a reader may be made to wait for, or ever see fail.** It
 * renders nothing, runs after paint, and swallows every error: the counter
 * exists so the club can ask whether links are still being used, and a player
 * shown an error because a counter did not move would be a far worse outcome
 * than an undercount.
 *
 * `record` is a bound server action. The strict-mode double-invoke in
 * development is held off by the ref, so one mount is one stamp.
 */
export function LinkOpenedBeacon({ record }: { record: () => Promise<unknown> }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void Promise.resolve()
      .then(record)
      .catch(() => {});
  }, [record]);

  return null;
}
