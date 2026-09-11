import fs from "node:fs";
import path from "node:path";
export function submittedPreview(directory, capture, parameterNames = []) {
  if (capture?.channel === "email")
    return { body: capture.payload?.text ?? "", buttons: [], warnings: [] };
  if (!capture?.payload?.template) return null;
  const file = path.join(directory, "template-submissions.json");
  if (!fs.existsSync(file))
    return { body: null, buttons: [], warnings: ["Submission records are not loaded."] };
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  const template = document.templates.find((t) => t.name === capture.payload.template.name);
  if (!template)
    return {
      body: null,
      buttons: [],
      warnings: ["This template is not in the supplied submission records."],
    };
  const components = capture.payload.template.components ?? [];
  const values = components.find((c) => c.type === "body")?.parameters?.map((p) => p.text) ?? [];
  const warnings = [];
  const expected = template.samples.map((s) => s.meaning);
  if (JSON.stringify(expected) !== JSON.stringify(parameterNames))
    warnings.push(
      "Sender field order differs from the submitted template. Application correction: LAN-286.",
    );
  const buttons = components
    .filter((c) => c.type === "button")
    .map((button) => {
      const definition = template.buttons[Number(button.index)];
      if (!definition) {
        warnings.push(
          "The sender includes an extra button absent from the submitted template. Onboarding correction: LAN-263.",
        );
        return { label: "Unexpected extra button", url: null };
      }
      return {
        label: definition.label,
        url: definition.url.replace(
          /\{\{1\}\}/g,
          button.parameters?.[0]?.text ?? "[missing value]",
        ),
      };
    });
  if (
    buttons.length !== template.buttons.length &&
    !warnings.some((w) => w.includes("extra button"))
  )
    warnings.push("The submitted and captured button counts differ.");
  return {
    body: template.body.replace(
      /\{\{(\d+)\}\}/g,
      (_, n) => values[Number(n) - 1] ?? "[missing value]",
    ),
    buttons,
    warnings,
    source: document.source,
    approvalVerified: document.approvalVerified,
  };
}
