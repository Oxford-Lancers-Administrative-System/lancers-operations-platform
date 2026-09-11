"use server";

import { requireCapability } from "@/lib/auth/guards";
import { notImplemented } from "./not-implemented";

// The slice's privileged server actions — LAN-73's guard-parity harness.

export async function activateMembership(): Promise<never> {
  await requireCapability("membership_activation");
  notImplemented("LAN-75", "activate a season membership");
}

export async function approveEvent(): Promise<never> {
  await requireCapability("event_approval");
  notImplemented("LAN-77", "approve an event and release its invitations");
}

export async function recordAttendance(): Promise<never> {
  await requireCapability("attendance_recording");
  notImplemented("LAN-80", "record attendance for an occurred event");
}

export async function manageRoles(): Promise<never> {
  await requireCapability("role_management");
  notImplemented("none yet", "manage operator accounts and role assignments");
}

export async function administerDelivery(): Promise<never> {
  await requireCapability("delivery_administration");
  notImplemented("LAN-78", "administer WhatsApp delivery, retries and revocation");
}
