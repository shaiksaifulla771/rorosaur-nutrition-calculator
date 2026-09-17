const SENDER_NAME = "Rorosaur Nutrition Calculator";
// Codes must come from a Brevo-verified address: rorosaur.com's SPF (-all) does not
// authorise Brevo yet, so sending as contact@rorosaur.com is junked as spoofed by
// Microsoft 365. Until the domain is authenticated in Brevo, send from the account's
// brevosend.com address (DKIM/SPF pass) and route replies to contact@rorosaur.com.
// Override without a code change by setting BREVO_SENDER_EMAIL.
const SENDER_EMAIL = process.env["BREVO_SENDER_EMAIL"] ?? "contact@11874355.brevosend.com";
const REPLY_TO_EMAIL = "contact@rorosaur.com";
const REPLY_TO_NAME = "Rorosaur Support";

/**
 * Sends a plain transactional email through Brevo. Server-only: the API key
 * never leaves the backend. Throws on failure so callers can surface a short
 * on-screen message instead of pretending the email went out.
 */
export async function sendBrevoEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env["BREVO_API_KEY"];
  if (!apiKey) throw new Error("EMAIL_SEND_FAILED");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      replyTo: { email: REPLY_TO_EMAIL, name: REPLY_TO_NAME },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(`Brevo send failed [${response.status}]: ${body}`);
    throw new Error("EMAIL_SEND_FAILED");
  }
}
