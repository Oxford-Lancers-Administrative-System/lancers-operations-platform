"use client";

import { useEffect, useRef } from "react";

/**
 * Says that a person, not a crawler, opened this page — LAN-269. Mounts only
 * in a browser that ran the page's JavaScript, which no WhatsApp/Apple/
 * Facebook preview crawler does, so the `GET` itself can stay side-effect
 * free. Not analytics: reports one bit against the link, never the person, no
 * cookie or storage. `record` is a bound server action; swallows every error
 * (an undercount beats a player seeing a failure) and fires once per mount.
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
