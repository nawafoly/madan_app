export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// ✅ مؤقتًا: لا OAuth خارجي
// أي محاولة تسجيل دخول ترجع مباشرة لصفحة /login
export const getLoginUrl = () => {
  return "/login";
};
