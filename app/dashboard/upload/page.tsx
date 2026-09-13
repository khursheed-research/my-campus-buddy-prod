"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DocRow = {
  id: string;
  file_name: string;
  size_bytes: number | null;
  status: string;
  created_at: string;
};

export default function UploadPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadDocs(cid: string) {
    const { data } = await supabase
      .from("documents")
      .select("id, file_name, size_bytes, status, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        loadDocs(profile.company_id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const stillWorking = docs.some((d) => d.status === "uploaded" || d.status === "processing");
    if (!stillWorking) return;

    const interval = setInterval(() => loadDocs(companyId), 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, companyId]);

  async function retryProcessing(docId: string) {
    if (!companyId) return;
    supabase.functions.invoke("process-document", { body: { document_id: docId } });
    setTimeout(() => loadDocs(companyId), 1500);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!companyId || !userId) {
      setErrorMsg(
        "Your account isn't fully set up yet. Please visit the Dashboard page first, then come back here."
      );
      e.target.value = "";
      return;
    }

    setUploading(true);
    setErrorMsg("");

    const path = `${companyId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, file);

    if (uploadError) {
      setErrorMsg(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: insertedDoc, error: insertError } = await supabase
      .from("documents")
      .insert({
        company_id: companyId,
        uploaded_by: userId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      })
      .select("id")
      .single();

    if (insertError) {
      setErrorMsg(insertError.message);
      setUploading(false);
      return;
    }

    // Fire-and-forget: kicks off real text extraction + embedding in the
    // background. The document list below shows status as it progresses
    // (uploaded -> processing -> processed) on next refresh.
    supabase.functions.invoke("process-document", {
      body: { document_id: insertedDoc.id },
    });

    setUploading(false);
    e.target.value = "";
    loadDocs(companyId);
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl">
      <a href="/dashboard" className="text-sm text-zinc-500 underline">
        ← Back to dashboard
      </a>
      <h1 className="text-2xl font-semibold mt-4 mb-1">Upload documents</h1>
      <p className="text-zinc-500 mb-6">
        Real files, stored privately, scoped to your company only.
      </p>

      <label className="block rounded-lg border border-dashed border-zinc-700 p-8 text-center cursor-pointer hover:border-amber-500 transition-colors">
        <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        <span className="text-zinc-400">
          {uploading ? "Uploading…" : "Click to choose a file"}
        </span>
      </label>

      {errorMsg && <p className="text-red-400 text-sm mt-3">{errorMsg}</p>}

      <div className="mt-8 space-y-2">
        {docs.length === 0 && (
          <p className="text-zinc-600 text-sm">No documents uploaded yet.</p>
        )}
        {docs.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3"
          >
            <div>
              <p className="text-sm">{d.file_name}</p>
              <p className="text-xs text-zinc-500">
                {d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB` : ""} ·{" "}
                {new Date(d.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-amber-500">
                {d.status}
              </span>
              {(d.status === "uploaded" || d.status === "error") && (
                <button
                  onClick={() => retryProcessing(d.id)}
                  className="text-xs underline text-zinc-400 hover:text-amber-500"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
