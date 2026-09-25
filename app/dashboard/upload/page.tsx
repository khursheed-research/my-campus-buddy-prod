"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/components/CompanyContext";

type DocRow = {
  id: string;
  file_name: string;
  description: string | null;
  department: string;
  document_year: number | null;
  author: string | null;
  size_bytes: number | null;
  status: string;
  deletion_status: string;
  created_at: string;
};

const DEPARTMENTS = ["sales", "hr", "operations", "finance", "product", "general"];
const CURRENT_YEAR = new Date().getFullYear();

export default function UploadPage() {
  const supabase = createClient();
  const { userId, companyId, role } = useCompany();
  const isAdmin = ["founder", "cto", "admin"].includes(role ?? "");
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("general");
  const [documentYear, setDocumentYear] = useState(String(CURRENT_YEAR));
  const [author, setAuthor] = useState("");

  async function loadDocs(cid: string) {
    const { data } = await supabase
      .from("documents")
      .select(
        "id, file_name, description, department, document_year, author, size_bytes, status, deletion_status, created_at"
      )
      .eq("company_id", cid)
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  }

  useEffect(() => {
    if (companyId) loadDocs(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setDescription("");
    setDepartment("general");
    setDocumentYear(String(CURRENT_YEAR));
    setAuthor("");
  }

  async function confirmUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingFile || !companyId || !userId) return;

    setUploading(true);
    setErrorMsg("");

    const path = `${companyId}/${Date.now()}-${pendingFile.name}`;

    const { error: uploadError } = await supabase.storage.from("documents").upload(path, pendingFile);
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
        file_name: pendingFile.name,
        mime_type: pendingFile.type || null,
        size_bytes: pendingFile.size,
        description: description.trim() || null,
        department,
        document_year: documentYear ? parseInt(documentYear, 10) : null,
        author: author.trim() || null,
      })
      .select("id")
      .single();

    if (insertError || !insertedDoc) {
      setErrorMsg(insertError?.message ?? "Could not save document");
      setUploading(false);
      return;
    }

    supabase.functions.invoke("process-document", { body: { document_id: insertedDoc.id } });

    setUploading(false);
    setPendingFile(null);
    loadDocs(companyId);
  }

  async function requestDeletion(docId: string) {
    await supabase.rpc("request_document_deletion", { doc_id: docId });
    if (companyId) loadDocs(companyId);
  }

  async function approveDeletion(docId: string) {
    await supabase.rpc("approve_document_deletion", { doc_id: docId });
    if (companyId) loadDocs(companyId);
  }

  async function rejectDeletion(docId: string) {
    await supabase.rpc("reject_document_deletion", { doc_id: docId });
    if (companyId) loadDocs(companyId);
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-2xl mt-4 mb-1">Documents</h1>
      <p className="text-muted mb-6">
        Real files, stored privately, scoped to your company only — tagged so they can actually
        be found later.
      </p>

      {!pendingFile ? (
        <label className="block rounded-lg border border-dashed border-border p-8 text-center cursor-pointer hover:border-brass transition-colors">
          <input type="file" className="hidden" onChange={handleFileSelect} disabled={uploading} />
          <span className="text-muted">Click to choose a file</span>
        </label>
      ) : (
        <form onSubmit={confirmUpload} className="rounded-lg border border-border bg-panel p-5 space-y-3">
          <p className="text-sm text-paper">
            <span className="text-muted">File: </span>
            {pendingFile.name}
          </p>

          <div>
            <label className="block text-xs text-muted mb-1">What is this document about?</label>
            <textarea
              className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm min-h-[60px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description so this is easy to find later"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Department</label>
              <select
                className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d[0].toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Data year</label>
              <input
                type="number"
                className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm"
                value={documentYear}
                onChange={(e) => setDocumentYear(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Author / source</label>
              <input
                className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Who created this?"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={uploading}
              className="rounded bg-brass text-ink text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="text-sm text-muted hover:text-paper px-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {errorMsg && <p className="text-signal-red text-sm mt-3">{errorMsg}</p>}

      <div className="mt-8 space-y-2">
        {docs.length === 0 && <p className="text-muted/70 text-sm">No documents uploaded yet.</p>}
        {docs.map((d) => (
          <div key={d.id} className="rounded-md border border-border bg-panel px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">{d.file_name}</p>
                <p className="text-xs text-muted">
                  {d.department} {d.document_year ? `· ${d.document_year}` : ""}{" "}
                  {d.author ? `· ${d.author}` : ""} ·{" "}
                  {d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB` : ""} ·{" "}
                  {new Date(d.created_at).toLocaleString()}
                </p>
                {d.description && <p className="text-xs text-muted/80 mt-1">{d.description}</p>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs uppercase tracking-wide text-brass">{d.status}</span>
                {(d.status === "uploaded" || d.status === "error") && (
                  <button
                    onClick={() => retryProcessing(d.id)}
                    className="text-xs underline text-muted hover:text-brass"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
              {d.deletion_status === "none" && (
                <button
                  onClick={() => requestDeletion(d.id)}
                  className="text-xs text-muted hover:text-signal-red underline"
                >
                  Request deletion
                </button>
              )}
              {d.deletion_status === "pending" && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-signal-red">Deletion requested — awaiting approval</span>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => approveDeletion(d.id)}
                        className="text-xs underline text-signal-red"
                      >
                        Approve delete
                      </button>
                      <button
                        onClick={() => rejectDeletion(d.id)}
                        className="text-xs underline text-muted"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
