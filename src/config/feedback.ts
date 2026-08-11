export const BLINK_API_URL: string =
  (import.meta.env.BLINK_API_URL as string | undefined) ?? "http://localhost:4789";

export type FeedbackType = "feature" | "bug";

export type FeedbackPayload = {
  name: string;
  type: FeedbackType;
  title: string;
  description: string;
  expected?: string;
  steps?: string;
  version: string;
  os: string;
};

export type SubmitResult =
  | { ok: true; id: string }
  | { ok: false; offline: boolean; message: string };

export async function submitFeedback(payload: FeedbackPayload): Promise<SubmitResult> {
  try {
    const response = await fetch(`${BLINK_API_URL}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, website: "" }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        ok: false,
        offline: false,
        message: body?.error ?? `server returned ${response.status}`,
      };
    }
    const body = (await response.json()) as { id?: string };
    if (!body.id) return { ok: false, offline: false, message: "invalid server response" };
    return { ok: true, id: body.id };
  } catch {
    return {
      ok: false,
      offline: true,
      message: "could not reach the Blink server",
    };
  }
}
