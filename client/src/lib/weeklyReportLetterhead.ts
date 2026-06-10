const publicBase = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");

export const WEEKLY_REPORT_LETTERHEAD_SRC = `${publicBase}/background22.png`;

export async function loadWeeklyReportLetterhead() {
  try {
    const response = await fetch(WEEKLY_REPORT_LETTERHEAD_SRC, {
      cache: "force-cache",
    });

    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch (error) {
    console.warn("weekly_report_letterhead_load_failed", error);
    return null;
  }
}
