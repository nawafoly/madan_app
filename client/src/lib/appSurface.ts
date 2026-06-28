export type AppSurface = "investment" | "staff";

const STAFF_HOSTS = new Set(["staff.maedin.com"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SHARED_DEPLOYMENT_HOSTS = new Set(["madan-app.vercel.app"]);

function getRuntimeHostname() {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

export function normalizeHostname(hostname = getRuntimeHostname()) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

export function isLocalHost(hostname = getRuntimeHostname()) {
  return LOCAL_HOSTS.has(normalizeHostname(hostname));
}

export function isStaffHost(hostname = getRuntimeHostname()) {
  return STAFF_HOSTS.has(normalizeHostname(hostname));
}

export function isSharedDeploymentHost(hostname = getRuntimeHostname()) {
  return SHARED_DEPLOYMENT_HOSTS.has(normalizeHostname(hostname));
}

export function normalizePathname(pathname: string) {
  const path = String(pathname || "/").split(/[?#]/)[0] || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function getSearchAndHash(pathWithSearch: string) {
  const text = String(pathWithSearch || "");
  const queryIndex = text.indexOf("?");
  const hashIndex = text.indexOf("#");
  const index =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);

  return index === -1 ? "" : text.slice(index);
}

export function mapLegacyStaffPath(pathWithSearch: string) {
  const path = normalizePathname(pathWithSearch);
  const suffix = getSearchAndHash(pathWithSearch);

  if (path === "/admin/recruitment-applications") {
    return `/hr/recruitment${suffix}`;
  }

  if (path === "/admin/employees") {
    return `/hr/employees${suffix}`;
  }

  if (path === "/admin/create-staff") {
    return `/hr/create-staff${suffix}`;
  }

  if (path === "/hr/profile" || path === "/staff" || path === "/staff/profile") {
    return `/employee/profile${suffix}`;
  }

  if (path === "/hr/files" || path === "/staff/files") {
    return `/employee/files${suffix}`;
  }

  if (path === "/hr/messages" || path === "/staff/messages") {
    return `/employee/messages${suffix}`;
  }

  if (path === "/staff/daily-tasks") {
    return `/employee/daily-tasks${suffix}`;
  }

  if (path === "/hr/weekly-reports" || path === "/staff/weekly-reports") {
    return `/employee/weekly-reports${suffix}`;
  }

  return pathWithSearch || "/";
}

export function isLegacyStaffPath(pathname: string) {
  const path = normalizePathname(pathname);
  return (
    path === "/admin/recruitment-applications" ||
    path === "/admin/employees" ||
    path === "/admin/create-staff"
  );
}

export function isStaffPlatformPath(pathname: string) {
  const path = normalizePathname(pathname);
  return (
    path === "/hr" ||
    path.startsWith("/hr/") ||
    path === "/employee" ||
    path.startsWith("/employee/") ||
    path === "/staff" ||
    path.startsWith("/staff/") ||
    isLegacyStaffPath(path)
  );
}

export function isStaffSurfaceAllowedPath(pathname: string) {
  const path = normalizePathname(pathname);
  return path === "/login" || path === "/404" || isStaffPlatformPath(path);
}

export function getCurrentAppSurface(
  pathname =
    typeof window === "undefined" ? "/" : window.location.pathname,
  hostname = getRuntimeHostname()
): AppSurface {
  if (isStaffHost(hostname)) return "staff";
  if (
    (isLocalHost(hostname) || isSharedDeploymentHost(hostname)) &&
    isStaffPlatformPath(pathname)
  ) {
    return "staff";
  }
  return "investment";
}

export function buildStaffPlatformTarget(pathWithSearch: string) {
  const normalizedPath = mapLegacyStaffPath(pathWithSearch);

  if (typeof window === "undefined") return normalizedPath;

  if (isStaffHost() || isLocalHost() || isSharedDeploymentHost()) {
    return normalizedPath;
  }

  const targetUrl = new URL(window.location.href);
  const path = normalizePathname(normalizedPath);
  const suffix = getSearchAndHash(normalizedPath);
  const queryIndex = suffix.indexOf("?");
  const hashIndex = suffix.indexOf("#");

  targetUrl.hostname = "staff.maedin.com";
  targetUrl.pathname = path;
  targetUrl.search = queryIndex === -1 ? "" : suffix.slice(queryIndex).split("#")[0];
  targetUrl.hash = hashIndex === -1 ? "" : suffix.slice(hashIndex);

  return targetUrl.toString();
}
