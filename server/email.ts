import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | undefined;

function getTransporter(): { client: Transporter; from: string } {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const username = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_HOST, SMTP_PORT, and SMTP_FROM must be configured.");
  }
  if (Boolean(username) !== Boolean(password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must either both be set or both be empty.");
  }

  transporter ??= nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    ...(username && password ? { auth: { user: username, pass: password } } : {}),
  });
  return { client: transporter, from };
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const { client, from } = getTransporter();
  await client.sendMail({
    from,
    to,
    subject: "Your ReJenga verification code",
    text: `Your ReJenga verification code is ${code}. It expires in 15 minutes. If you did not request this code, you can ignore this email.`,
    html: `<p>Your ReJenga verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${code}</p><p>This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>`,
  });
}
