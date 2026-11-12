/**
 * Outbound email for account flows (#218) and lifecycle templates (#558).
 * The transport is resolved from env at first send:
 *
 *   - `EMAIL_FILE` set → append one JSON line per message to that path.
 *     For the e2e suites (specs read verification/reset links back out — a
 *     console log isn't reachable across the HTTP boundary) and doubles as
 *     a local outbox for debugging. Wins over Resend so setting it always
 *     captures instead of sending.
 *   - `RESEND_API_KEY` set → Resend's HTTP API (plain fetch, no SDK).
 *     `EMAIL_FROM` overrides the sender.
 *   - otherwise → the server log. The self-host/dev default: the link lands
 *     in the console, which is enough to complete signup/reset on your own
 *     box without wiring up an email service.
 *
 * Callers that must not fail the surrounding request (Better Auth's send
 * hooks) catch errors themselves; sendEmail always propagates failures.
 */
import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface EmailTemplate {
  id: string;
  variables?: Record<string, string | number>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional inline HTML body (lifecycle mail). */
  html?: string;
  /** Local metadata (lifecycle alias + render vars). Never sent to Resend. */
  meta?: { alias: string; variables: Record<string, string> };
  /** Resend template. The HTML stays on Resend. Auth mail omits this. */
  template?: EmailTemplate;
  /** Extra Resend headers (List-Unsubscribe on product mail). */
  headers?: Record<string, string>;
  /** Reply-To address (Resend `reply_to`). */
  replyTo?: string;
  /** Files for Resend `attachments`. `content` is base64. */
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string;
}

export type EmailTransport = (message: EmailMessage) => Promise<void>;

const consoleTransport: EmailTransport = async (message) => {
  const template = message.template ? ` template=${message.template.id}` : '';
  console.log(
    `[email → console] to=${message.to} subject="${message.subject}"${template}\n${message.text}`,
  );
};

function appendEmail(path: string, payload: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${payload}\n`);
}

function fileTransport(path: string): EmailTransport {
  return async (message) => appendEmail(path, JSON.stringify(message));
}

/** Body for Resend. A template send must not include text or HTML. */
export function resendPayload(from: string, message: EmailMessage): Record<string, unknown> {
  const headers =
    message.headers && Object.keys(message.headers).length > 0 ? message.headers : undefined;
  const extras = {
    ...(headers ? { headers } : {}),
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
  };
  if (message.template) {
    return {
      from,
      to: message.to,
      template: {
        id: message.template.id,
        variables: message.template.variables ?? {},
      },
      ...extras,
    };
  }
  return {
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...extras,
  };
}

function senderFor(message: EmailMessage): string {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  return message.template ? 'Support <support@readfox.app>' : 'Readfox <no-reply@readfox.app>';
}

const RESEND_TIMEOUT_MS = 15_000;

function postResend(apiKey: string, payload: string, idempotencyKey?: string): Promise<Response> {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: payload,
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
}

function resendTransport(apiKey: string): EmailTransport {
  return async (message) => {
    const res = await postResend(
      apiKey,
      JSON.stringify(resendPayload(senderFor(message), message)),
    );
    if (!res.ok) {
      throw new Error(`Resend rejected email to ${message.to}: ${res.status} ${await res.text()}`);
    }
  };
}

export class ReportEmailError extends Error {
  constructor(readonly uncertain: boolean) {
    super(uncertain ? 'Report delivery could not be confirmed' : 'Report email was not sent');
  }
}

export function prepareReportEmail(message: EmailMessage): string {
  return JSON.stringify(resendPayload(senderFor(message), message));
}

/** Retries reuse the exact serialized request, including the sender and attachment. */
export async function sendPreparedReportEmail(
  payload: string,
  idempotencyKey: string,
): Promise<string | null> {
  const file = process.env.EMAIL_FILE;
  if (file) {
    try {
      appendEmail(file, payload);
      return null;
    } catch {
      throw new ReportEmailError(false);
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new ReportEmailError(false);

  let response: Response;
  try {
    response = await postResend(apiKey, payload, idempotencyKey);
  } catch {
    throw new ReportEmailError(true);
  }
  if (!response.ok) {
    throw new ReportEmailError(
      response.status === 408 || response.status === 409 || response.status >= 500,
    );
  }

  // A successful status is acceptance even if the response body is unavailable.
  const result = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return typeof result?.id === 'string' ? result.id : null;
}

let transport: EmailTransport | null = null;

/** Test seam: inject a capturing transport; pass null to re-resolve from env. */
export function setEmailTransport(t: EmailTransport | null): void {
  transport = t;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!transport) {
    const filePath = process.env.EMAIL_FILE;
    const apiKey = process.env.RESEND_API_KEY;
    transport = filePath
      ? fileTransport(filePath)
      : apiKey
        ? resendTransport(apiKey)
        : consoleTransport;
  }
  await transport(message);
}
