import {
  Camera,
  CheckCircle2,
  ExternalLink,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  friendlyHabatError,
  formatDate,
  formatTime,
  habatApi,
  type HabatAttendanceLocation,
  type HabatAttendancePhoto,
  type HabatLocationAccount,
  type HabatSettings,
} from "./habatAttendanceClient";
import "./habat-mobile.css";

import HabatNumberInput from "@/pages/habat/HabatNumberInput";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";

type Props = {
  onDataChanged?: () => void | Promise<void>;
};

type LocationDraft = {
  id: string | null;
  name: string;
  latitude: number | "";
  longitude: number | "";
  radiusM: number;
};

const emptyDraft = (): LocationDraft => ({
  id: null,
  name: "",
  latitude: "",
  longitude: "",
  radiusM: 100,
});

export default function HabatAttendanceSettings({ onDataChanged }: Props) {
  const { language } = useLanguage();
  const [locations, setLocations] = useState<HabatAttendanceLocation[]>([]);
  const [accounts, setAccounts] = useState<HabatLocationAccount[]>([]);
  const [photos, setPhotos] = useState<HabatAttendancePhoto[]>([]);
  const [settings, setSettings] = useState<HabatSettings | null>(null);
  const [draft, setDraft] = useState<LocationDraft>(emptyDraft);
  const [selectedPhoto, setSelectedPhoto] = useState<HabatAttendancePhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [assignmentBusy, setAssignmentBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [locationPayload, photoPayload, settingsPayload] = await Promise.all([
        habatApi<{
          ok: true;
          locations: HabatAttendanceLocation[];
          accounts: HabatLocationAccount[];
        }>("v2/locations"),
        habatApi<{ ok: true; photos: HabatAttendancePhoto[] }>(
          "v2/attendance-photos?limit=60"
        ),
        habatApi<{ ok: true; settings: HabatSettings }>("v2/settings"),
      ]);
      setLocations(locationPayload.locations || []);
      setAccounts(locationPayload.accounts || []);
      setPhotos(photoPayload.photos || []);
      setSettings(settingsPayload.settings);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeLocations = useMemo(
    () => locations.filter(location => location.isActive),
    [locations]
  );

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError(tr(language, "المتصفح لا يدعم تحديد الموقع.", "This browser does not support geolocation."));
      return;
    }

    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      position => {
        setDraft(current => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));
        setMessage(tr(language, "تم وضع الإحداثيات على موقعك الحالي.", "Coordinates set to your current location."));
        setLocating(false);
      },
      () => {
        setError(tr(language, "تعذر الحصول على الموقع. اسمح للموقع من إعدادات المتصفح.", "Unable to get your location. Allow location access in browser settings."));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function saveLocation(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!draft.name.trim() || draft.latitude === "" || draft.longitude === "") {
      setError(tr(language, "اكتب اسم الموقع وحدد الإحداثيات.", "Enter a location name and coordinates."));
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        name: draft.name.trim(),
        latitude: Number(draft.latitude),
        longitude: Number(draft.longitude),
        radiusM: Number(draft.radiusM),
      };
      if (draft.id) {
        await habatApi(`v2/locations/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await habatApi("v2/locations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setDraft(emptyDraft());
      setMessage(tr(language, "تم حفظ موقع البصمة.", "Attendance location saved."));
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setSaving(false);
    }
  }

  function editLocation(location: HabatAttendanceLocation) {
    setDraft({
      id: location.id,
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusM: location.radiusM,
    });
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deactivateLocation(location: HabatAttendanceLocation) {
    if (!window.confirm(tr(language, `تعطيل موقع «${location.name}»؟ سيتم إلغاء تعيينه من الموظفين.`, `Disable “${location.name}”? It will be unassigned from employees.`))) return;
    setSaving(true);
    setError("");
    try {
      await habatApi(`v2/locations/${encodeURIComponent(location.id)}`, {
        method: "DELETE",
      });
      await refresh();
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAssignment(
    account: HabatLocationAccount,
    locationId: string,
    checked: boolean
  ) {
    if (assignmentBusy) return;
    setAssignmentBusy(account.id);
    setError("");
    const nextIds = checked
      ? Array.from(new Set([...account.locationIds, locationId]))
      : account.locationIds.filter(id => id !== locationId);

    try {
      await habatApi(
        `v2/location-assignments/${encodeURIComponent(account.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ locationIds: nextIds }),
        }
      );
      setAccounts(current =>
        current.map(item =>
          item.id === account.id ? { ...item, locationIds: nextIds } : item
        )
      );
      setMessage(tr(language, "تم تحديث مواقع الموظف المسموحة.", "Employee attendance locations updated."));
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setAssignmentBusy(null);
    }
  }

  async function saveGpsPolicy() {
    if (!settings || saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = await habatApi<{ ok: true; settings: HabatSettings }>(
        "v2/settings",
        {
          method: "PATCH",
          body: JSON.stringify({ maxAccuracyM: settings.maxAccuracyM }),
        }
      );
      setSettings(payload.settings);
      setMessage(tr(language, "تم حفظ سياسة دقة GPS.", "GPS accuracy policy saved."));
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-400" />
        <p className="mt-3 text-sm font-semibold text-slate-500">
          {tr(language, "جاري تحميل مواقع البصمة...", "Loading attendance locations...")}
        </p>
      </section>
    );
  }

  return (
    <div dir={languageDir(language)} className="space-y-6 text-start">
      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black">
              {tr(language, "مواقع البصمة", "Attendance Locations")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {tr(language, "أضف أكثر من موقع وحدد نطاق كل موقع، ثم اربط كل موظف بالمواقع المسموحة له.", "Add multiple locations, set each geofence radius, then assign employees to the locations they may use.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black"
          >
            <RefreshCw size={17} />
            {tr(language, "تحديث", "Refresh")}
          </button>
        </div>

        <form onSubmit={saveLocation} className="mt-6 rounded-2xl bg-slate-50 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-black">
              {draft.id
                ? tr(language, "تعديل موقع البصمة", "Edit Attendance Location")
                : tr(language, "إضافة موقع بصمة", "Add Attendance Location")}
            </h3>
            {draft.id ? (
              <button
                type="button"
                onClick={() => setDraft(emptyDraft())}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"
              >
                <X size={15} /> {tr(language, "إلغاء التعديل", "Cancel Edit")}
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold sm:col-span-2">
              {tr(language, "اسم الموقع", "Location Name")}
              <input
                value={draft.name}
                onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
                placeholder={tr(language, "مثال: الفرع الرئيسي", "Example: Main Branch")}
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-slate-900"
              />
            </label>

            <label className="text-sm font-bold">
              Latitude
              <HabatNumberInput
                inputMode="decimal"
                step="any"
                value={draft.latitude}
                onValueChange={value =>
                  setDraft(current => ({
                    ...current,
                    latitude: value === "" ? "" : Number(value),
                  }))
                }
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-start outline-none focus:border-slate-900"
              />
            </label>

            <label className="text-sm font-bold">
              Longitude
              <HabatNumberInput
                inputMode="decimal"
                step="any"
                value={draft.longitude}
                onValueChange={value =>
                  setDraft(current => ({
                    ...current,
                    longitude: value === "" ? "" : Number(value),
                  }))
                }
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-start outline-none focus:border-slate-900"
              />
            </label>

            <label className="text-sm font-bold sm:col-span-2">
              {tr(language, "نطاق البصمة بالمتر", "Geofence Radius in Meters")}
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={10}
                  value={Math.min(1000, Math.max(10, Number(draft.radiusM || 100)))}
                  onChange={event => setDraft(current => ({ ...current, radiusM: Number(event.target.value) }))}
                  className="min-w-0 flex-1"
                />
                <HabatNumberInput
                  min={10}
                  max={5000}
                  value={draft.radiusM}
                  onValueChange={value =>
                    setDraft(current => ({ ...current, radiusM: Math.min(5000, Math.max(10, Number(value) || 10)) }))
                  }
                  className="h-11 w-24 rounded-xl border border-slate-200 bg-white px-2 text-center"
                />
              </div>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void useCurrentLocation()}
              disabled={locating}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black disabled:opacity-50"
            >
              <LocateFixed size={17} />
              {locating
                ? tr(language, "جاري تحديد الموقع...", "Locating...")
                : tr(language, "استخدام موقعي الحالي", "Use My Current Location")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-black text-white disabled:opacity-50"
            >
              {draft.id ? <Save size={17} /> : <Plus size={17} />}
              {draft.id
                ? tr(language, "حفظ التعديل", "Save Changes")
                : tr(language, "إضافة الموقع", "Add Location")}
            </button>
          </div>
        </form>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {locations.length ? locations.map(location => (
            <article
              key={location.id}
              className={`rounded-2xl border p-4 ${location.isActive ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MapPin size={17} className="shrink-0" />
                    <h4 className="truncate font-black">{location.name}</h4>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    {tr(language, "النطاق", "Radius")}: {Math.round(location.radiusM)} {tr(language, "م", "m")}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${location.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                  {location.isActive ? tr(language, "مفعل", "Active") : tr(language, "معطل", "Disabled")}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => editLocation(location)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-black"
                >
                  <Pencil size={14} /> {tr(language, "تعديل", "Edit")}
                </button>
                <a
                  href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-black"
                >
                  <ExternalLink size={14} /> {tr(language, "فتح بالخريطة", "Open Map")}
                </a>
                {location.isActive ? (
                  <button
                    type="button"
                    onClick={() => void deactivateLocation(location)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700"
                  >
                    <Trash2 size={14} /> {tr(language, "تعطيل", "Disable")}
                  </button>
                ) : null}
              </div>
            </article>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500 lg:col-span-2">
              {tr(language, "لا توجد مواقع بصمة بعد. أضف الموقع الأول بالأعلى.", "No attendance locations yet. Add the first location above.")}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div>
          <h2 className="text-xl font-black">
            {tr(language, "تعيين المواقع للموظفين", "Assign Locations to Employees")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {tr(language, "يمكن ربط الموظف بموقع واحد أو أكثر. البصمة تُقبل فقط داخل أحد المواقع المحددة له.", "An employee can be assigned to one or more locations. Clocking is accepted only inside an assigned location.")}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {accounts.map(account => (
            <article key={account.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <UserRound size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black">{account.displayName || account.email}</p>
                  <p className="truncate text-xs text-slate-500">{account.email}</p>
                </div>
                {account.locationIds.length === 0 ? (
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-black text-red-700">
                    {tr(language, "بدون موقع", "No Location")}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                    {account.locationIds.length} {tr(language, "موقع", "Location")}
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {activeLocations.map(location => {
                  const checked = account.locationIds.includes(location.id);
                  return (
                    <label
                      key={location.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${checked ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={assignmentBusy === account.id}
                        onChange={event =>
                          void toggleAssignment(account, location.id, event.target.checked)
                        }
                        className="h-4 w-4"
                      />
                      <span className="truncate">{location.name}</span>
                    </label>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      {settings ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-black">{tr(language, "دقة GPS", "GPS Accuracy")}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {tr(language, "إذا كانت دقة جهاز الموظف أسوأ من الحد المحدد، تُرفض البصمة حتى تتحسن الإشارة.", "If the employee device accuracy is worse than this limit, clocking is rejected until GPS accuracy improves.")}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-sm font-bold">
              {tr(language, "أقصى دقة مقبولة بالمتر", "Maximum Accepted Accuracy (m)")}
              <HabatNumberInput
                min={10}
                max={1000}
                value={settings.maxAccuracyM}
                onValueChange={value =>
                  setSettings(current =>
                    current
                      ? { ...current, maxAccuracyM: Math.min(1000, Math.max(10, Number(value) || 10)) }
                      : current
                  )
                }
                className="mt-2 h-11 w-40 rounded-xl border border-slate-200 px-3 text-center"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveGpsPolicy()}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-black text-white disabled:opacity-50"
            >
              <Save size={17} /> {tr(language, "حفظ", "Save")}
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">
              {tr(language, "صور الحضور والانصراف", "Attendance Photos")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {tr(language, "الصور محفوظة بشكل خاص في R2 ولا تُعرض إلا من داخل النظام للمستخدم المصرح له.", "Photos are stored privately in R2 and are only served through the authorized system.")}
            </p>
          </div>
          <Camera className="h-6 w-6 shrink-0 text-slate-400" />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {photos.length ? photos.map(photo => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setSelectedPhoto(photo)}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-start transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="aspect-[4/3] bg-slate-100">
                <img
                  src={`/habat-api/v2/attendance-photos/${encodeURIComponent(photo.id)}`}
                  alt={photo.displayName || "attendance"}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-black">{photo.displayName || photo.accountEmail}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {photo.clockType === "check_in"
                    ? tr(language, "حضور", "Check-in")
                    : tr(language, "انصراف", "Check-out")}
                  {" · "}{formatDate(photo.attendanceDate)}{" · "}{formatTime(photo.capturedAt)}
                </p>
                {photo.locationName ? (
                  <p className="mt-1 truncate text-xs font-bold text-slate-600">
                    <MapPin className="me-1 inline h-3.5 w-3.5" />{photo.locationName}
                  </p>
                ) : null}
              </div>
            </button>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500 sm:col-span-2 lg:col-span-3 xl:col-span-4">
              {tr(language, "لا توجد صور بصمات محفوظة حتى الآن.", "No attendance photos have been saved yet.")}
            </div>
          )}
        </div>
      </section>

      {message ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-xl">
          <CheckCircle2 size={17} /> {message}
        </div>
      ) : null}

      {error ? (
        <div className="fixed bottom-5 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-2xl bg-red-700 px-5 py-3 text-center text-sm font-black text-white shadow-xl">
          {error}
        </div>
      ) : null}

      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-h-[94vh] w-full max-w-4xl" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-2 end-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg"
            >
              <X size={20} />
            </button>
            <img
              src={`/habat-api/v2/attendance-photos/${encodeURIComponent(selectedPhoto.id)}`}
              alt={selectedPhoto.displayName || "attendance"}
              className="mx-auto max-h-[82vh] max-w-full rounded-2xl object-contain"
            />
            <div className="mx-auto mt-3 max-w-xl rounded-2xl bg-white p-4 text-center text-slate-900">
              <p className="font-black">{selectedPhoto.displayName || selectedPhoto.accountEmail}</p>
              <p className="mt-1 text-sm text-slate-600">
                {selectedPhoto.clockType === "check_in"
                  ? tr(language, "صورة الحضور", "Check-in Photo")
                  : tr(language, "صورة الانصراف", "Check-out Photo")}
                {" · "}{formatDate(selectedPhoto.attendanceDate)}{" · "}{formatTime(selectedPhoto.capturedAt)}
              </p>
              {selectedPhoto.locationName ? (
                <p className="mt-1 text-sm font-bold">{selectedPhoto.locationName}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
