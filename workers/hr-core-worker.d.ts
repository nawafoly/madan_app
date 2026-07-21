export type HrWorkerResponseResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

export function computeEffectivePermissions(
  defaults: unknown[],
  overrides: Array<{
    permission_key?: unknown;
    permissionKey?: unknown;
    effect?: unknown;
  }>
): string[];

export function normalizeEmployeePayload(
  raw: unknown,
  options?: { partial?: boolean; imported?: boolean }
): HrWorkerResponseResult<Record<string, any>>;

export function validateFirebaseTokenClaims(
  header: Record<string, any>,
  payload: Record<string, any>,
  projectId: string,
  now?: number
): true;

export function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<Record<string, any>>;

export function resolveEffectivePermissions(
  db: any,
  uid: string
): Promise<string[]>;

export default {
  fetch(request: Request, env: Record<string, any>): Promise<Response>;
};

export function computeLeaveCancellationState(
  row: Record<string, any>,
  dateKey: string
): {
  cancelledDateKeys: string[];
  activeDateKeys: string[];
  status: "approved" | "cancelled";
  restoreDays: number;
  balanceRestoredDays: number;
};

export function normalizeImportedLeaveRequest(
  raw: unknown
): Record<string, any> | null;

export function normalizeImportedAbsence(
  raw: unknown
): Record<string, any> | null;

export function normalizeImportedServiceRequest(
  raw: unknown
): Record<string, any> | null;

export function normalizeImportedPayrollRecord(
  raw: unknown
): Record<string, any> | null;

export function computePayrollFinancialTotals(input: Record<string, any>): {
  manualAbsenceDeduction: number;
  totalSalaryDeductions: number;
  grossSalary: number;
  finalSalary: number;
};

export function buildPayrollInsertStatement(
  db: any,
  row: Record<string, any>,
  now: string,
  actorUid?: string | null,
  actorEmail?: string | null,
  source?: string
): any;

export function normalizeNotificationType(value: unknown):
  | "leave"
  | "file"
  | "message"
  | "system";

export function normalizeOperationalPayload(
  raw: Record<string, any>,
  kind: "daily_task" | "weekly_report",
  requester: { uid: string },
  existing?: Record<string, any> | null
): {
  payload: Record<string, any>;
  createdByUid: string;
  receiverUid: string | null;
  dateKey: string | null;
  status: "draft" | "sent";
  now: string;
};
