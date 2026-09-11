// The WhatsApp seam — LAN-185, REQ-whatsapp-seam. Pure. No substrate exists yet to answer "was this number on WhatsApp"; wired at supersedeContactPoint with the only honest answer today: false.

export interface WhatsappSeamConsequence {
  readonly warn: boolean;
  readonly message: string | null;
}

export function describeWhatsappSeamConsequence(
  previousRawValue: string,
  seasonLabel: string,
  wasOnWhatsappForActiveSeason: boolean | null,
): WhatsappSeamConsequence {
  if (!wasOnWhatsappForActiveSeason) {
    return { warn: false, message: null };
  }
  return {
    warn: true,
    message:
      `${previousRawValue} is on WhatsApp for ${seasonLabel}. Changing the number ends that. ` +
      `A rejoin will be asked for on the new number, and the person is not reachable on ` +
      `WhatsApp until then.`,
  };
}
