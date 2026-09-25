"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/components/CompanyContext";

type InteractionRow = {
  id: string;
  raw_content: string;
  summary: string | null;
  sentiment: string | null;
  next_step: string | null;
  status: string;
  department: string;
  occurred_at: string;
};

const DEPARTMENTS = ["sales", "hr", "operations", "finance", "product", "general"];

const sentimentColor: Record<string, string> = {
  positive: "text-signal-green",
  neutral: "text-muted",
  negative: "text-signal-red",
};

export default function NotesPage() {
  const supabase = createClient();
  const { userId, companyId } = useCompany();
  const [notes, setNotes] = useState<InteractionRow[]>([]);
  const [content, setContent] = useState("");
  const [department, setDepartment] = useState("general");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useState<{ current: MediaRecorder | null }>({ current: null })[0];
  const chunksRef = useState<{ current: BlobPart[] }>({ current: [] })[0];

  async function loadNotes(cid: string) {
    const { data } = await supabase
      .from("interactions")
      .select("id, raw_content, summary, sentiment, next_step, status, department, occurred_at")
      .eq("company_id", cid)
      .eq("type", "note")
      .order("occurred_at", { ascending: false });
    setNotes(data ?? []);
  }

  useEffect(() => {
    if (companyId) loadNotes(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    const stillWorking = notes.some((n) => n.status === "raw" || n.status === "processing");
    if (!stillWorking) return;
    const interval = setInterval(() => loadNotes(companyId), 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, companyId]);

  async function startRecording() {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setTranscribing(true);
        const { data, error } = await supabase.functions.invoke("transcribe-audio", {
          body: blob,
        });
        setTranscribing(false);
        if (error) {
          setErrorMsg(error.message ?? "Transcription failed");
          return;
        }
        setContent((prev) => (prev ? prev + " " + data.text : data.text));
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setErrorMsg("Couldn't access your microphone — check your browser's permission for this site.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !companyId || !userId) return;

    setSubmitting(true);
    setErrorMsg("");

    const { data: inserted, error: insertError } = await supabase
      .from("interactions")
      .insert({
        company_id: companyId,
        department,
        type: "note",
        source: "manual",
        raw_content: content.trim(),
        created_by: userId,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setErrorMsg(insertError?.message ?? "Could not save note");
      setSubmitting(false);
      return;
    }

    supabase.functions.invoke("process-interaction", {
      body: { interaction_id: inserted.id },
    });

    setContent("");
    setSubmitting(false);
    loadNotes(companyId);
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-2xl mt-4 mb-1">Notes</h1>
      <p className="text-muted mb-6">
        Type or speak what happened. It gets read, summarized, and made searchable automatically.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 mb-10">
        <div className="relative">
          <textarea
            className="w-full rounded-md bg-panel border border-border px-3 py-2 pr-14 min-h-[120px]"
            placeholder="What happened? e.g. 'Talked to the vendor about renewal, they want a 10% price increase, need to decide by Friday.' Or just record it instead."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            title={recording ? "Stop recording" : "Record a voice note"}
            className={
              "absolute top-2 right-2 w-10 h-10 rounded-full flex items-center justify-center transition-all " +
              (recording
                ? "bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.3)] animate-pulse"
                : "bg-brass shadow-[0_0_0_3px_rgba(245,158,11,0.25)] hover:shadow-[0_0_0_5px_rgba(245,158,11,0.35)] hover:scale-105")
            }
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={recording ? "white" : "black"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        </div>
        {recording && <p className="text-xs text-signal-red">Recording… click the mic to stop.</p>}
        {transcribing && <p className="text-xs text-muted">Transcribing your recording…</p>}
        <div className="flex items-center justify-between gap-3">
          <select
            className="rounded-md bg-panel border border-border px-3 py-2 text-sm"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brass text-black text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save note"}
          </button>
        </div>
        {errorMsg && <p className="text-signal-red text-sm">{errorMsg}</p>}
      </form>

      <div className="space-y-3">
        {notes.length === 0 && <p className="text-muted/70 text-sm">No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="rounded-md border border-border bg-panel px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-muted">
                {n.department} · {new Date(n.occurred_at).toLocaleString()}
              </span>
              <span className="text-xs uppercase tracking-wide text-brass">{n.status}</span>
            </div>
            <p className="text-sm text-paper/90 mb-2">{n.raw_content}</p>
            {n.summary && (
              <div className="text-sm border-t border-border pt-2 mt-2 space-y-1">
                <p>
                  <span className="text-muted">Summary: </span>
                  {n.summary}
                </p>
                {n.sentiment && (
                  <p>
                    <span className="text-muted">Sentiment: </span>
                    <span className={sentimentColor[n.sentiment] ?? ""}>{n.sentiment}</span>
                  </p>
                )}
                {n.next_step && (
                  <p>
                    <span className="text-muted">Next step: </span>
                    {n.next_step}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
