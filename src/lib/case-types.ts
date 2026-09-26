export const CASE_TYPE = {
  TICKET: "TICKET",
  INCIDENT: "INCIDENT",
  ORDER: "ORDER",
  FOLLOW_UP: "FOLLOW_UP",
} as const;

export type CaseType = typeof CASE_TYPE[keyof typeof CASE_TYPE];

export const TICKET_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_CUSTOMER: "WAITING_CUSTOMER",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
} as const;

export type TicketStatus = typeof TICKET_STATUS[keyof typeof TICKET_STATUS];

export const CASE_PRIORITY = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;

export type CasePriority = typeof CASE_PRIORITY[keyof typeof CASE_PRIORITY];

const CASE_STATUS_BY_TYPE: Partial<Record<CaseType, readonly string[]>> = {
  [CASE_TYPE.TICKET]: Object.values(TICKET_STATUS),
};

const CASE_INITIAL_STATUS_BY_TYPE: Partial<Record<CaseType, string>> = {
  [CASE_TYPE.TICKET]: TICKET_STATUS.OPEN,
};

const CLOSED_CASE_STATUS_BY_TYPE: Partial<Record<CaseType, ReadonlySet<string>>> = {
  [CASE_TYPE.TICKET]: new Set([TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED]),
};

export function isCaseType(value: unknown): value is CaseType {
  return typeof value === "string" && Object.values(CASE_TYPE).includes(value as CaseType);
}

export function isCasePriority(value: unknown): value is CasePriority {
  return typeof value === "string" && Object.values(CASE_PRIORITY).includes(value as CasePriority);
}

export function isCaseStatusForType(type: CaseType, value: unknown) {
  return typeof value === "string" && (CASE_STATUS_BY_TYPE[type]?.includes(value) ?? false);
}

export function isKnownCaseStatus(value: unknown) {
  return typeof value === "string" && Object.values(CASE_STATUS_BY_TYPE).some((statuses) => statuses?.includes(value));
}

export function getInitialCaseStatus(type: CaseType) {
  return CASE_INITIAL_STATUS_BY_TYPE[type] ?? null;
}

export function isClosedCaseStatus(type: CaseType, status: string) {
  return CLOSED_CASE_STATUS_BY_TYPE[type]?.has(status) ?? false;
}
