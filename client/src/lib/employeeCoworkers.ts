import { httpsCallable } from "firebase/functions";

import { firebaseFunctions } from "@/_core/firebase";

export type EmployeeCoworkerOption = {
  uid: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  statusKey: string;
};

type EmployeeDirectoryResponse = {
  employees?: EmployeeCoworkerOption[] | null;
};

const listActiveEmployeeDirectory = httpsCallable<
  Record<string, never>,
  EmployeeDirectoryResponse
>(firebaseFunctions, "listActiveEmployeeDirectory");

export async function fetchActiveEmployeeCoworkers() {
  const result = await listActiveEmployeeDirectory({});
  const employees = Array.isArray(result.data?.employees)
    ? result.data?.employees
    : [];

  return employees
    .map(employee => ({
      uid: String(employee?.uid || "").trim(),
      name: String(employee?.name || "").trim(),
      email: String(employee?.email || "").trim() || null,
      avatarUrl: String(employee?.avatarUrl || "").trim() || null,
      title: String(employee?.title || "").trim() || null,
      department: String(employee?.department || "").trim() || null,
      statusKey: String(employee?.statusKey || "").trim() || "active",
    }))
    .filter(employee => employee.uid && employee.name);
}
