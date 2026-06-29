import {
  fetchEmployeeDirectoryFromWorker,
  type EmployeeDirectoryWorkerEmployee,
} from "@/lib/employeeDirectoryWorker";
import { resolveEmployeeAvatarUrl } from "@/lib/defaultEmployeeAvatars";

export type EmployeeCoworkerOption = EmployeeDirectoryWorkerEmployee;

export async function fetchActiveEmployeeCoworkers() {
  const employees = await fetchEmployeeDirectoryFromWorker();

  return employees
    .map(employee => ({
      uid: String(employee?.uid || "").trim(),
      name: String(employee?.name || "").trim(),
      email: String(employee?.email || "").trim() || null,
      avatarUrl:
        resolveEmployeeAvatarUrl(employee?.avatarUrl, {
          uid: employee?.uid,
          name: employee?.name,
          email: employee?.email,
        }) || null,
      title: String(employee?.title || "").trim() || null,
      department: String(employee?.department || "").trim() || null,
      statusKey: String(employee?.statusKey || "").trim() || "active",
    }))
    .filter(employee => employee.uid && employee.name);
}
