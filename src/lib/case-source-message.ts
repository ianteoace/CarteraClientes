/** Shared UI/server policy. Body and caption do not determine source eligibility. */
export function isEligibleCaseSourceMessage(message: { direction: string; type: string }) {
  return message.direction === "INBOUND" && (message.type === "TEXT" || message.type === "IMAGE");
}
