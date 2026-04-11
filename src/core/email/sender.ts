import nodemailer, { type SentMessageInfo, type Transporter } from "nodemailer";
import { env } from "@/core/env";
import { logError } from "@/core/observability/logger";

const EMAIL_PROVIDER = "GMAIL_SMTP";

type EmailHeaderMap = Record<string, string>;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: EmailHeaderMap;
};

export type SendEmailResult = {
  success: boolean;
  provider: string;
  responseCode?: string;
  responseMessage?: string;
  messageId?: string;
};

let transporter: Transporter | null = null;

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isEmailConfigured() {
  return Boolean(
    normalizeOptionalText(env.GMAIL_SMTP_USER) &&
      normalizeOptionalText(env.GMAIL_SMTP_APP_PASSWORD),
  );
}

function getTransporter() {
  if (!isEmailConfigured()) {
    return null;
  }

  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_SMTP_USER,
      pass: env.GMAIL_SMTP_APP_PASSWORD,
    },
  });

  return transporter;
}

function resolveFromAddress() {
  return normalizeOptionalText(env.EMAIL_FROM_ADDRESS) ?? normalizeOptionalText(env.GMAIL_SMTP_USER);
}

function resolveFromName() {
  return normalizeOptionalText(env.EMAIL_FROM_NAME) ?? "Dinkinesh - EEMS";
}

function buildSuccessResult(info: SentMessageInfo): SendEmailResult {
  const responseCode = Array.isArray(info.accepted) && info.accepted.length > 0 ? "SENT" : "QUEUED";

  return {
    success: true,
    provider: EMAIL_PROVIDER,
    responseCode,
    responseMessage: normalizeOptionalText(info.response) ?? "Email accepted by SMTP provider.",
    messageId: normalizeOptionalText(info.messageId),
  };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const smtpTransport = getTransporter();
  const fromAddress = resolveFromAddress();

  if (!smtpTransport || !fromAddress) {
    return {
      success: false,
      provider: EMAIL_PROVIDER,
      responseCode: "EMAIL_NOT_CONFIGURED",
      responseMessage:
        "Gmail SMTP credentials are missing. Configure GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.",
    };
  }

  try {
    const info = await smtpTransport.sendMail({
      from: {
        name: resolveFromName(),
        address: fromAddress,
      },
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: normalizeOptionalText(input.text),
      replyTo: normalizeOptionalText(input.replyTo) ?? normalizeOptionalText(env.EMAIL_REPLY_TO),
      headers: input.headers,
    });

    return buildSuccessResult(info);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";

    logError("notifications.email.send_failed", {
      provider: EMAIL_PROVIDER,
      to: input.to,
      subject: input.subject,
      message,
    });

    return {
      success: false,
      provider: EMAIL_PROVIDER,
      responseCode: "EMAIL_SEND_FAILED",
      responseMessage: message,
    };
  }
}
