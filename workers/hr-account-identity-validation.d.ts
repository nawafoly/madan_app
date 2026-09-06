export type AccountIdentityState = {
  role: string;
  employeeProfileEnabled: boolean;
  linkedEmployeeId: string | null;
};

export type AccountIdentityMutationArgs = {
  uid?: unknown;
  before?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  linkedEmployee?: Record<string, unknown> | null;
  employeeByAuthUid?: Record<string, unknown> | null;
};

export type AccountIdentityMutationResult =
  | { ok: true; next: AccountIdentityState }
  | { ok: false; status: number; message: string };

export function resolveNextAccountIdentityState(args?: {
  before?: Record<string, unknown>;
  patch?: Record<string, unknown>;
}): AccountIdentityState;

export function validateAccountIdentityMutation(
  args?: AccountIdentityMutationArgs
): AccountIdentityMutationResult;
