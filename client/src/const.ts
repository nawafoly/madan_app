import { isStaffPlatformPath } from "@/lib/appSurface";
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// ✅ مؤقتًا: لا OAuth خارجي
// الدخول من مسار HR يرجع إلى /hr، وباقي المسارات إلى /login
export const getLoginUrl = (pathname = typeof window === "undefined" ? "/" : window.location.pathname) => {
  return isStaffPlatformPath(pathname) ? "/hr" : "/login";
};
