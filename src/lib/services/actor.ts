import { ConstraintViolated } from "@/lib/db";

export function actorRequirement(message: string): (actorPersonId: string) => void {
  return (actorPersonId: string): void => {
    if (typeof actorPersonId !== "string" || actorPersonId.trim() === "") {
      throw new ConstraintViolated(message, { rule: "audit_events_has_an_actor" });
    }
  };
}
