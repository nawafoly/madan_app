import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "@/_core/firebase";
import {
  createDefaultSiteContentSettings,
  normalizeSiteContentSettings,
  type SiteContentSettings,
} from "@/lib/siteContent";

type SiteContentContextValue = {
  content: SiteContentSettings;
  loading: boolean;
  error: string;
};

const SiteContentContext = createContext<SiteContentContextValue | null>(null);

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<SiteContentSettings>(
    createDefaultSiteContentSettings
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "content"),
      snapshot => {
        setContent(
          snapshot.exists()
            ? normalizeSiteContentSettings(snapshot.data())
            : createDefaultSiteContentSettings()
        );
        setError("");
        setLoading(false);
      },
      snapshotError => {
        console.error("site content snapshot error:", snapshotError);
        setContent(createDefaultSiteContentSettings());
        setError(
          snapshotError instanceof Error
            ? snapshotError.message
            : "site_content_snapshot_failed"
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({ content, loading, error }),
    [content, error, loading]
  );

  return (
    <SiteContentContext.Provider value={value}>
      {children}
    </SiteContentContext.Provider>
  );
}

export function useSiteContent() {
  const value = useContext(SiteContentContext);
  if (value) return value;

  return {
    content: createDefaultSiteContentSettings(),
    loading: false,
    error: "",
  };
}
