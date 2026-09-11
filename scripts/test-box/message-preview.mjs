/**
 * LAN-330: a text carries its whole body, so the preview is the body itself.
 * Links are listed separately so the panel can offer them as buttons.
 */
export function submittedPreview(directory, capture) {
  if (capture?.channel === "email")
    return { body: capture.payload?.text ?? "", buttons: [], warnings: [], sender: null };
  if (capture?.channel !== "sms" || typeof capture.payload?.Body !== "string") return null;
  const body = capture.payload.Body;
  const buttons = [...body.matchAll(/(?:^|\n)([^\n:]{1,40}): (https?:\/\/\S+)/g)].map((m) => ({
    label: m[1].trim(),
    url: m[2],
  }));
  return {
    body,
    buttons,
    warnings: [],
    sender: capture.payload.From ?? null,
    characters: [...body].length,
  };
}
