import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { CheckIcon, FeedbackIcon } from "../components/icons";
import { formatFullTimestamp, localDateString } from "../utils/timestamps";

const WEB_API_URL =
  (import.meta.env.BLINK_API_URL as string | undefined) ??
  "https://blink-production-e083.up.railway.app";

const WEB_QUEUE_KEY = "blink.feedback.reports";
const NAME_KEY = "blink.feedback.name";

type WebReport = {
  id: string;
  reportType: string;
  title: string;
  status: "sent" | "failed";
  createdAt: string;
};

function readWebQueue(): WebReport[] {
  try {
    return JSON.parse(localStorage.getItem(WEB_QUEUE_KEY) ?? "[]") as WebReport[];
  } catch {
    return [];
  }
}

type Step = "choose" | "form" | "success";
type FeedbackType = "feature" | "bug";

type SubmitOutcome = { status: "sent" | "queued"; id: string };
type QueuedReport = {
  id: number;
  reportType: string;
  title: string;
  status: "pending" | "sent" | "failed";
  serverId: string | null;
  attempts: number;
  createdAt: string;
};

const inputClass =
  "w-full select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50";

const QUEUE_STYLES: Record<string, string> = {
  sent: "border-success/40 bg-success/10 text-success",
  pending: "border-warning/40 bg-warning/10 text-warning",
  failed: "border-danger/40 bg-danger/10 text-danger",
};

const RETRY_INTERVAL_MS = 60_000;

export default function FeedbackPage() {
  const [step, setStep] = useState<Step>("choose");
  const [type, setType] = useState<FeedbackType | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [steps, setSteps] = useState("");
  const [email, setEmail] = useState("");
  const [includeDeviceInfo, setIncludeDeviceInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [queue, setQueue] = useState<QueuedReport[]>([]);

  const loadQueue = useCallback(async () => {
    if (!isTauri()) {
      setQueue(
        readWebQueue().map((r) => ({
          id: 0,
          reportType: r.reportType,
          title: r.title,
          status: r.status,
          serverId: r.id,
          attempts: 1,
          createdAt: r.createdAt,
        })),
      );
      return;
    }
    try {
      setQueue(await invoke<QueuedReport[]>("list_queued_reports"));
    } catch {
      // queue display is best-effort
    }
  }, []);

  const retryQueue = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const summary = await invoke<{ sent: number }>("retry_pending_reports");
      if (summary.sent > 0) await loadQueue();
    } catch {
      // offline — reports stay queued
    }
  }, [loadQueue]);

  useEffect(() => {
    void loadQueue();
    void retryQueue();
    if (isTauri()) {
      void invoke<string | null>("get_setting", { key: "feedback.name" }).then((stored) => {
        if (stored) setName(stored);
      });
    } else {
      const stored = localStorage.getItem(NAME_KEY);
      if (stored) setName(stored);
    }
    const interval = setInterval(() => void retryQueue(), RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadQueue, retryQueue]);

  const missing: string[] = [];
  if (!name.trim()) missing.push("name");
  if (!title.trim()) missing.push("title");
  if (!description.trim()) missing.push(type === "bug" ? "what happened" : "description");
  if (type === "bug" && !expected.trim()) missing.push("expected behavior");
  const canSubmit = type !== null && missing.length === 0 && !busy;

  const reset = () => {
    setStep("choose");
    setType(null);
    setTitle("");
    setDescription("");
    setExpected("");
    setSteps("");
    setEmail("");
    setIncludeDeviceInfo(false);
    setSubmitError(null);
    setOutcome(null);
  };

  const submit = async () => {
    if (!canSubmit || !type) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const body = [
        `Report from ${name.trim()}`,
        "",
        description.trim(),
        ...(type === "bug"
          ? ["", "Expected behavior:", expected.trim(), ...(steps.trim() ? ["", "Steps to reproduce:", steps.trim()] : [])]
          : []),
      ].join("\n");

      if (isTauri()) {
        const result = await invoke<SubmitOutcome>("submit_feedback_report", {
          reportType: type,
          title: title.trim(),
          description: body,
          contactEmail: email.trim() || null,
          includeDeviceInfo,
        });
        await invoke("set_setting", { key: "feedback.name", value: name.trim() });
        setOutcome(result);
      } else {
        const response = await fetch(`${WEB_API_URL}/api/reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            title: title.trim(),
            description: body,
            ...(email.trim() ? { contactEmail: email.trim() } : {}),
            ...(includeDeviceInfo ? { appVersion: "web", os: navigator.platform } : {}),
          }),
        });
        const responseBody = (await response.json().catch(() => null)) as
          | { id?: string; error?: string }
          | null;
        const reports = readWebQueue();
        if (response.ok && responseBody?.id) {
          reports.unshift({
            id: responseBody.id,
            reportType: type,
            title: title.trim(),
            status: "sent",
            createdAt: `${localDateString()} 00:00:00`,
          });
          setOutcome({ status: "sent", id: responseBody.id });
        } else {
          const message = responseBody?.error ?? "could not reach the Blink server";
          reports.unshift({
            id: `local-${Date.now()}`,
            reportType: type,
            title: title.trim(),
            status: "failed",
            createdAt: `${localDateString()} 00:00:00`,
          });
          setOutcome({ status: "queued", id: `local-${Date.now()}` });
          setSubmitError(message);
        }
        localStorage.setItem(WEB_QUEUE_KEY, JSON.stringify(reports.slice(0, 50)));
        localStorage.setItem(NAME_KEY, name.trim());
      }
      setStep("success");
      void loadQueue();
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-text">Features / Bugs</h2>
        <p className="text-sm text-muted">
          Request features and report bugs. Only your name and what you write here are
          sent — notes, tasks, and habits never leave this device.
        </p>
      </header>

      {step === "choose" && (
        <section className="glass flex max-w-lg flex-col gap-4 p-6">
          <h3 className="text-sm font-medium text-text">What would you like to submit?</h3>
          <div className="flex gap-3">
            {(["feature", "bug"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setType(option);
                  setStep("form");
                }}
                className="glass-sm glass-hover flex-1 px-4 py-3 text-sm font-medium text-text transition-colors hover:border-accent/50"
              >
                {option === "feature" ? "Feature Request" : "Bug Report"}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "form" && type && (
        <section className="glass flex max-w-lg flex-col gap-3 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text">
              {type === "feature" ? "Feature Request" : "Bug Report"}
            </h3>
            <button type="button" onClick={reset} className="text-xs text-muted hover:text-text">
              Back
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Your Name *</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Required to submit feedback"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Title *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {type === "feature" ? "Description *" : "What happened? *"}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </label>
          {type === "bug" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">What did you expect to happen? *</span>
                <textarea
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Steps to reproduce</span>
                <textarea
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </label>
            </>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Contact email (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Only if you'd like a follow-up"
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-text">
            <input
              type="checkbox"
              checked={includeDeviceInfo}
              onChange={(e) => setIncludeDeviceInfo(e.target.checked)}
              className="accent-accent"
            />
            Include app version and OS (helps with bug triage)
          </label>

          {submitError && (
            <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              {submitError}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-muted">
            Submitting a report sends this information to our server over the internet.
            If you're offline, the report is saved locally and sent automatically when
            you're back online.
          </p>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="rounded-lg border border-accent/50 bg-accent/15 px-4 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-60"
            >
              {busy ? "Submitting…" : type === "feature" ? "Submit Feature" : "Submit Bug"}
            </button>
          </div>
        </section>
      )}

      {step === "success" && outcome && (
        <section className="glass flex max-w-lg flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-success/40 bg-success/15 text-success">
            <CheckIcon width={22} height={22} />
          </span>
          <h3 className="text-base font-semibold text-text">
            {outcome.status === "sent" ? "Submitted!" : "Queued"}
          </h3>
          <p className="text-sm text-muted">
            {outcome.status === "sent"
              ? "Thank you for helping improve Blink."
              : "You're offline or the server is unreachable — your report is saved locally and will be sent automatically."}
          </p>
          <p className="text-xs text-muted">
            Report ID:{" "}
            <span className="select-text font-mono font-semibold text-accent">{outcome.id}</span>
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-lg border border-accent/50 bg-accent/15 px-4 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
          >
            Done
          </button>
        </section>
      )}

      <section className="glass flex max-w-lg flex-col gap-2 p-5">
        <h3 className="text-sm font-medium text-text">Your Reports</h3>
        {queue.length === 0 ? (
          <p className="text-sm text-muted">No reports submitted yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {queue.map((report) => (
              <li key={report.id} className="flex items-center gap-3 py-2">
                <FeedbackIcon width={14} height={14} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{report.title}</p>
                  <p className="text-[11px] text-muted">
                    <span className="font-mono">{report.serverId ?? `#${report.id}`}</span> ·{" "}
                    {report.reportType === "feature" ? "Feature" : "Bug"} ·{" "}
                    {formatFullTimestamp(report.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${QUEUE_STYLES[report.status]}`}
                >
                  {report.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
