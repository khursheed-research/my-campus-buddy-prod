"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/components/CompanyContext";

type Paper = {
  id: string;
  title: string;
  abstract: string;
  introduction: string | null;
  methodology: string | null;
  findings: string | null;
  conclusion: string | null;
  references_text: string | null;
  department: string;
  status: string;
  author_id: string;
  authorName: string;
  created_at: string;
  submitted_at: string | null;
  published_at: string | null;
};

type Review = { id: string; reviewer_id: string; reviewerName: string; comment: string; created_at: string };

const DEPARTMENTS = ["sales", "hr", "operations", "finance", "product", "general"];
const TABS = ["published", "under_review", "my_drafts"] as const;

export default function PapersPage() {
  const supabase = createClient();
  const { userId, companyId, role } = useCompany();
  const isAdmin = ["founder", "cto", "admin"].includes(role ?? "");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("published");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review[]>>({});
  const [commentDraft, setCommentDraft] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [methodology, setMethodology] = useState("");
  const [findings, setFindings] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [referencesText, setReferencesText] = useState("");
  const [department, setDepartment] = useState("general");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadPapers(cid: string) {
    const { data } = await supabase
      .from("research_papers")
      .select(
        "id, title, abstract, introduction, methodology, findings, conclusion, references_text, department, status, author_id, created_at, submitted_at, published_at, profiles(full_name)"
      )
      .eq("company_id", cid)
      .order("created_at", { ascending: false });

    setPapers(
      (data ?? []).map((p) => ({
        ...p,
        // @ts-expect-error - joined relation shape
        authorName: p.profiles?.full_name ?? "Unknown",
      }))
    );
  }

  useEffect(() => {
    if (companyId) loadPapers(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function loadReviews(paperId: string) {
    const { data } = await supabase
      .from("paper_reviews")
      .select("id, reviewer_id, comment, created_at, profiles(full_name)")
      .eq("paper_id", paperId)
      .order("created_at", { ascending: true });

    setReviews((prev) => ({
      ...prev,
      [paperId]: (data ?? []).map((r) => ({
        ...r,
        // @ts-expect-error - joined relation shape
        reviewerName: r.profiles?.full_name ?? "Unknown",
      })),
    }));
  }

  function toggleExpand(paperId: string) {
    if (expandedId === paperId) {
      setExpandedId(null);
    } else {
      setExpandedId(paperId);
      loadReviews(paperId);
    }
  }

  async function submitComment(paperId: string) {
    if (!commentDraft.trim()) return;
    await supabase.from("paper_reviews").insert({
      paper_id: paperId,
      company_id: companyId,
      reviewer_id: userId,
      comment: commentDraft.trim(),
    });
    setCommentDraft("");
    loadReviews(paperId);
  }

  async function createDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !userId || !title.trim() || !abstract.trim()) return;

    setSaving(true);
    setErrorMsg("");

    const { error } = await supabase.from("research_papers").insert({
      company_id: companyId,
      author_id: userId,
      title: title.trim(),
      abstract: abstract.trim(),
      introduction: introduction.trim() || null,
      methodology: methodology.trim() || null,
      findings: findings.trim() || null,
      conclusion: conclusion.trim() || null,
      references_text: referencesText.trim() || null,
      department,
    });

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setTitle("");
    setAbstract("");
    setIntroduction("");
    setMethodology("");
    setFindings("");
    setConclusion("");
    setReferencesText("");
    setShowForm(false);
    if (companyId) loadPapers(companyId);
    setTab("my_drafts");
  }

  async function submitForReview(paperId: string) {
    await supabase.rpc("submit_paper", { paper_id: paperId });
    if (companyId) loadPapers(companyId);
    setTab("under_review");
  }

  async function publish(paperId: string) {
    const { error } = await supabase.functions.invoke("publish-paper", { body: { paper_id: paperId } });
    if (!error && companyId) loadPapers(companyId);
  }

  async function reject(paperId: string) {
    await supabase.rpc("reject_paper", { paper_id: paperId });
    if (companyId) loadPapers(companyId);
  }

  const filtered = papers.filter((p) => {
    if (tab === "published") return p.status === "published";
    if (tab === "under_review") return p.status === "submitted";
    return p.author_id === userId && (p.status === "draft" || p.status === "rejected");
  });

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl mt-4">Research Papers</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded bg-brass text-ink text-sm font-medium px-4 py-2 mt-4"
        >
          {showForm ? "Cancel" : "+ New Paper"}
        </button>
      </div>
      <p className="text-muted mb-6">
        Publish original research or analysis for company-wide review — structured, peer-commented,
        and admin-approved before it becomes part of the permanent knowledge base.
      </p>

      {showForm && (
        <form onSubmit={createDraft} className="rounded border border-border bg-panel p-5 space-y-3 mb-8">
          <input
            required
            placeholder="Title"
            className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            required
            placeholder="Abstract — a short summary of what this paper covers and why it matters"
            className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm min-h-[60px]"
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
          />
          <textarea
            placeholder="Introduction / background"
            className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm min-h-[60px]"
            value={introduction}
            onChange={(e) => setIntroduction(e.target.value)}
          />
          <textarea
            placeholder="Methodology / approach"
            className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm min-h-[60px]"
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
          />
          <textarea
            placeholder="Findings / results"
            className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm min-h-[60px]"
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
          />
          <textarea
            placeholder="Conclusion / recommendations"
            className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm min-h-[60px]"
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
          />
          <textarea
            placeholder="References (optional)"
            className="w-full rounded bg-panel-raised border border-border px-3 py-2 text-sm min-h-[40px]"
            value={referencesText}
            onChange={(e) => setReferencesText(e.target.value)}
          />
          <select
            className="rounded bg-panel-raised border border-border px-3 py-2 text-sm"
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
            disabled={saving}
            className="rounded bg-brass text-ink text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save as draft"}
          </button>
          {errorMsg && <p className="text-signal-red text-sm">{errorMsg}</p>}
        </form>
      )}

      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "text-xs px-3 py-1.5 rounded-full border " +
              (tab === t ? "bg-brass text-ink border-brass" : "border-border text-muted")
            }
          >
            {t === "published" ? "Published" : t === "under_review" ? "Under Review" : "My Drafts"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <p className="text-muted/70 text-sm">Nothing here yet.</p>}
        {filtered.map((p) => (
          <div key={p.id} className="rounded-md border border-border bg-panel px-4 py-3">
            <div className="cursor-pointer" onClick={() => toggleExpand(p.id)}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-paper">{p.title}</p>
                <span className="text-xs uppercase tracking-wide text-brass">{p.status}</span>
              </div>
              <p className="text-xs text-muted mt-1">
                {p.authorName} · {p.department} · {new Date(p.created_at).toLocaleDateString()}
              </p>
              <p className="text-sm text-muted mt-2">{p.abstract}</p>
            </div>

            {expandedId === p.id && (
              <div className="mt-3 pt-3 border-t border-border space-y-3 text-sm">
                {p.introduction && (
                  <div>
                    <p className="text-xs text-muted mb-1">Introduction</p>
                    <p className="text-paper/90">{p.introduction}</p>
                  </div>
                )}
                {p.methodology && (
                  <div>
                    <p className="text-xs text-muted mb-1">Methodology</p>
                    <p className="text-paper/90">{p.methodology}</p>
                  </div>
                )}
                {p.findings && (
                  <div>
                    <p className="text-xs text-muted mb-1">Findings</p>
                    <p className="text-paper/90">{p.findings}</p>
                  </div>
                )}
                {p.conclusion && (
                  <div>
                    <p className="text-xs text-muted mb-1">Conclusion</p>
                    <p className="text-paper/90">{p.conclusion}</p>
                  </div>
                )}
                {p.references_text && (
                  <div>
                    <p className="text-xs text-muted mb-1">References</p>
                    <p className="text-paper/90">{p.references_text}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {p.status === "draft" && p.author_id === userId && (
                    <button
                      onClick={() => submitForReview(p.id)}
                      className="text-xs rounded bg-brass text-ink px-3 py-1.5"
                    >
                      Submit for review
                    </button>
                  )}
                  {p.status === "submitted" && isAdmin && (
                    <>
                      <button
                        onClick={() => publish(p.id)}
                        className="text-xs rounded bg-brass text-ink px-3 py-1.5"
                      >
                        Publish
                      </button>
                      <button
                        onClick={() => reject(p.id)}
                        className="text-xs rounded border border-signal-red text-signal-red px-3 py-1.5"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>

                {(p.status === "submitted" || p.status === "published") && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted mb-2">Peer review</p>
                    <div className="space-y-2 mb-3">
                      {(reviews[p.id] ?? []).map((r) => (
                        <div key={r.id} className="text-xs">
                          <span className="text-brass">{r.reviewerName}</span>{" "}
                          <span className="text-muted">
                            · {new Date(r.created_at).toLocaleDateString()}
                          </span>
                          <p className="text-paper/90 mt-0.5">{r.comment}</p>
                        </div>
                      ))}
                      {(reviews[p.id] ?? []).length === 0 && (
                        <p className="text-xs text-muted/70">No comments yet.</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded bg-panel-raised border border-border px-2 py-1.5 text-xs"
                        placeholder="Add a comment or suggestion…"
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                      />
                      <button
                        onClick={() => submitComment(p.id)}
                        className="text-xs rounded bg-panel-raised border border-border px-3 py-1.5 hover:border-brass"
                      >
                        Comment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
