import { describe, expect, it } from "vitest";

import {
  buildAttendanceLocationFeedback,
  buildGeolocationErrorFeedback,
  formatAttendanceDistance,
} from "./attendanceLocationFeedback";

describe("attendance location feedback", () => {
  it("formats large distances in kilometers", () => {
    expect(formatAttendanceDistance(10601)).toBe("10.6 كم");
  });

  it("prioritizes out-of-range messaging over low accuracy", () => {
    const feedback = buildAttendanceLocationFeedback({
      result: "rejected",
      rejectionReason: "poor_accuracy",
      distanceMeters: 10601,
      allowedRadiusMeters: 100,
      accuracy: 109,
    });

    expect(feedback).toMatchObject({
      type: "out_of_range",
      statusLabel: "خارج النطاق",
      title: "خارج نطاق تسجيل الحضور",
      message: "موقعك الحالي يبعد 10.6 كم عن موقع العمل.",
      distanceLabel: "10.6 كم",
      allowedRadiusLabel: "100 م",
      accuracyLabel: "109 م",
    });
  });

  it("prioritizes missing radius setup before out-of-range and low accuracy", () => {
    const feedback = buildAttendanceLocationFeedback({
      result: "rejected",
      rejectionReason: "zone_invalid",
      distanceMeters: 10601,
      allowedRadiusMeters: 0,
      accuracy: 116,
    });

    expect(feedback).toMatchObject({
      type: "missing_attendance_radius",
      statusLabel: "نطاق الحضور غير مضبوط",
      title: "لم يتم ضبط نطاق الحضور",
      message:
        "لم يتم ضبط نطاق الحضور لهذا الموظف أو الفرع. يرجى مراجعة الموارد البشرية.",
      distanceLabel: "10.6 كم",
      allowedRadiusLabel: null,
      accuracyLabel: "116 م",
    });
  });

  it("does not report missing radius when the worker rejected only GPS accuracy", () => {
    const feedback = buildAttendanceLocationFeedback({
      result: "rejected",
      rejectionReason: "poor_accuracy",
      distanceMeters: 80,
      allowedRadiusMeters: null,
      accuracy: 131,
    });

    expect(feedback).toMatchObject({
      type: "low_accuracy",
      allowedRadiusLabel: null,
    });
    expect(feedback?.distanceLabel).toContain("80");
    expect(feedback?.accuracyLabel).toContain("131");
  });

  it("treats a missing radius value as an attendance setup issue for location failures", () => {
    const feedback = buildAttendanceLocationFeedback({
      result: "rejected",
      rejectionReason: "outside_zone",
      distanceMeters: 10601,
      allowedRadiusMeters: null,
      accuracy: 40,
    });

    expect(feedback).toMatchObject({
      type: "missing_attendance_radius",
      allowedRadiusLabel: null,
    });
  });

  it("does not turn non-location rejections into radius setup errors", () => {
    expect(
      buildAttendanceLocationFeedback({
        result: "rejected",
        rejectionReason: "duplicate_check_in",
      })
    ).toBeNull();
  });

  it("shows low accuracy only when the employee is not outside range", () => {
    const feedback = buildAttendanceLocationFeedback({
      result: "rejected",
      rejectionReason: "poor_accuracy",
      distanceMeters: 20,
      allowedRadiusMeters: 100,
      accuracy: 109,
    });

    expect(feedback).toMatchObject({
      type: "low_accuracy",
      statusLabel: "دقة ضعيفة",
      message:
        "دقة الموقع ضعيفة: 109 م. حاول من مكان مفتوح أو فعّل GPS عالي الدقة.",
    });
  });

  it("classifies browser permission denial separately", () => {
    const feedback = buildGeolocationErrorFeedback({ code: 1 });

    expect(feedback).toMatchObject({
      type: "permission_denied",
      message:
        "تم رفض إذن الوصول للموقع. فعّل إذن الموقع من إعدادات المتصفح ثم حاول مرة أخرى.",
    });
  });
});
