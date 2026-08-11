import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import {
  submitFeedback,
  BLINK_API_URL,
  type FeedbackType,
} from "../config/feedback";
import { CheckIcon, FeedbackIcon } from "../components/icons";
import { formatFullTimestamp } from "../utils/timestamps";

type Step = "choose" | "form" | "success";
type FeedbackReport = {
  id: string;
  reportType: string;
  title: string;
  status: string;
  createdAt: string;
};

const inputClass =
  "w-full select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50";

const STATUS_STYLES: Record<string, string> = {
  Submitted: "border-border text-muted",
  Reviewing: "border-accent/40 bg-accent/10 text-accent",
  Planned: "border-warning/40 bg-warning/10 text-warning",
  "In Progress": "border-warning/40 bg-warning/10 text-warning",
  Completed: "border-success/40 bg-success/10 text-success",
  Closed: "border-border text-muted",
};

function osLabel(): string {
  const p = navigator.platform ?? "unknown";
  return p.replace(/x86_64|x64/i, "64-bit");
}

export default function FeedbackPage() {
  const [step, setStep] = useState<Step>("choose");
  const [type, setType] = useState<FeedbackType | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [steps, setSteps] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [history, setHistory] = useState<FeedbackReport[]>([]);
  const [version, setVersion] = useState("0.1.0");

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const reports = await invoke<FeedbackReport[]>("list_feedback_reports");
      setHistory(reports);
    } catch {
      // history is best-effort
    }
  }, []);

  const refreshStatuses = useCallback(
    async (reportName: string) => {
      try {
        const response = await fetch(
          `${BLINK_API_URL}/api/reports?name=${encodeURIComponent(reportName)}`,
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          reports?: { id: string; status: string }[];
        };
        for (const remote of body.reports ?? []) {
          await invoke("update_feedback_status", { id: remote.id, status: remote.status });
        }
        await loadHistory();
      } catch {
        // offline — keep cached statuses
      }
    },
    [loadHistory],
  );

  useEffect(() => {
    void loadHistory();
    void invoke<string | null>("get_setting", { key: "feedback.name" }).then((stored) => {
      if (stored) {
        setName(stored);
        void refreshStatuses(stored);
      }
    });
  }, [loadHistory, refreshStatuses]);

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
    setSubmitError(null);
    setOffline(false);
    setReportId(null);
  };

  const submit = async () => {
    if (!canSubmit || !type) return;
    setBusy(true);
    setSubmitError(null);
    setOffline(false);
    try {
      const result = await submitFeedback({
        name: name.trim(),
        type,
        title: title.trim(),
        description: description.trim(),
        ...(type === "bug"
          ? { expected: expected.trim(), steps: steps.trim() || undefined }
          : {}),
        version,
        os: osLabel(),
      });
      if (result.ok) {
        await invoke("save_feedback_report", {
          id: result.id,
          reportType: type,
          title: title.trim(),
        });
        await invoke("set_setting", { key: "feedback.name", value: name.trim() });
        setReportId(result.id);
        setStep("success");
        void loadHistory();
      } else {
        setOffline(result.offline);
        setSubmitError(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-text">Features / Bugs</h2>
        <p className="text-sm text-muted">
          Request features and report bugs. Only your name and the report are sent —
          notes, tasks, and habits never leave this device.
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
            <button
              type="button"
              onClick={reset}
              className="text-xs text-muted hover:text-text"
            >
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

          {submitError && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 p-3">
              {offline && (
                <p className="text-xs font-semibold text-danger">You're currently offline.</p>
              )}
              <p className="text-xs text-danger">
                Your report could not be submitted{offline ? "" : `: ${submitError}`}.
              </p>
            </div>
          )}

          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="rounded-lg border border-accent/50 bg-accent/15 px-4 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-60"
            >
              {busy ? "Submitting…" : offline ? "Retry" : type === "feature" ? "Submit Feature" : "Submit Bug"}
            </button>
          </div>
        </section>
      )}

      {step === "success" && (
        <section className="glass flex max-w-lg flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-success/40 bg-success/15 text-success">
            <CheckIcon width={22} height={22} />
          </span>
          <h3 className="text-base font-semibold text-text">Submitted!</h3>
          <p className="text-sm text-muted">Thank you for helping improve Blink.</p>
          <p className="text-xs text-muted">
            Report ID:{" "}
            <span className="select-text font-mono font-semibold text-accent">{reportId}</span>
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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text">Your Reports</h3>
          {name.trim() && (
            <button
              type="button"
              onClick={() => void refreshStatuses(name.trim())}
              className="text-xs text-accent hover:underline"
            >
              Refresh statuses
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted">No reports submitted yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {history.map((report) => (
              <li key={report.id} className="flex items-center gap-3 py-2">
                <FeedbackIcon width={14} height={14} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{report.title}</p>
                  <p className="text-[11px] text-muted">
                    <span className="font-mono">{report.id}</span> ·{" "}
                    {report.reportType === "feature" ? "Feature" : "Bug"} ·{" "}
                    {formatFullTimestamp(report.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[report.status] ?? STATUS_STYLES.Submitted}`}
                >
                  {report.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-muted">Server: {BLINK_API_URL}</p>
      </section>
    </div>
  );
}
