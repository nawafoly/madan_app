// client/src/pages/admin/DebugAuth.tsx
import { useAuth } from "@/_core/hooks/useAuth";

export default function DebugAuthPage() {
  const { user, loading } = useAuth();

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Debug Auth</h2>
      <p style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
        صفحة داخلية لتشخيص الجلسة والدور بسرعة.
      </p>

      <div
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "rgba(255,255,255,0.96)",
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          <b>ENV:</b> {import.meta.env.DEV ? "DEV" : "PROD"}
        </div>

        {loading ? (
          <div style={{ fontSize: 13 }}>Loading...</div>
        ) : user ? (
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 12,
              lineHeight: 1.5,
              opacity: 0.9,
            }}
          >
{JSON.stringify(user, null, 2)}
          </pre>
        ) : (
          <div style={{ fontSize: 13 }}>
            لا يوجد مستخدم مسجل دخول. اذهب إلى <b>/login</b>
          </div>
        )}
      </div>
    </div>
  );
}
