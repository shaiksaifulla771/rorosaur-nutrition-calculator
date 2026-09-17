import { z } from "zod";

export const DOMAIN_ERROR = "Access restricted to @rorosaur.com domains.";
export const GENERIC_ERROR = "Unable to process request. Try again.";
export const CREDENTIALS_ERROR = "Invalid email or password";
export const UNKNOWN_ACCOUNT_ERROR = "No account found for this email address.";
/** Deliberately identical to CREDENTIALS_ERROR so a wrong password never
 * reveals that the address exists. */
export const WRONG_PASSWORD_ERROR = "Invalid email or password";
export const NO_PASSWORD_NOTICE =
  "No password set for this account yet — we've emailed you a code.";
export const OTP_ERROR = "Invalid or expired OTP";
/** Shown when the email service refuses or fails to accept the code email. */
export const EMAIL_ERROR = "We could not send the code — try again.";
export const REQUEST_ERROR = "Invalid or expired request";
/** Shown when a first-time password does not meet the policy below. */
export const PASSWORD_POLICY_ERROR =
  "Choose a password of 8–12 characters with an uppercase letter, a lowercase letter, a number and a symbol.";
export const FIRST_SIGNIN_NOTICE =
  "First sign-in — we've emailed you a code. Your account is created once it's verified.";

export const ADMIN_EMAILS = [
  "sandeep@rorosaur.com",
  "pranathimaddimsetti@gmail.com",
  "shaiksaifulla771@gmail.com",
  "developer@lywo.in",
] as const;

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .transform((value) => value.toLowerCase())
  .refine(
    (value) =>
      (ADMIN_EMAILS as readonly string[]).includes(value) || value.endsWith("@rorosaur.com"),
    DOMAIN_ERROR,
  );

export const passwordSchema = z
  .string()
  .min(8, "Password must be 8–12 characters")
  .max(12, "Password must be 8–12 characters")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[0-9]/, "Add a number")
  .regex(/[^A-Za-z0-9]/, "Add a special character");

export const emailInputSchema = z.object({ email: z.string().trim().email().max(320) });

export const deviceInputSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{16,128}$/, GENERIC_ERROR),
});

/**
 * Accepted at sign-in: only shape and length are checked here so existing
 * credentials keep working. The stricter `passwordSchema` applies whenever a
 * password is being set.
 */
export const loginPasswordSchema = z.string().min(8, CREDENTIALS_ERROR).max(72, CREDENTIALS_ERROR);

/** In-app destinations only: a single leading slash, no protocol, no host. */
export const redirectPathSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/);

export const loginInputSchema = deviceInputSchema.extend({
  email: z.string().trim().max(320),
  password: loginPasswordSchema,
  redirect: redirectPathSchema.optional(),
});

export const completeLoginInputSchema = deviceInputSchema.extend({
  // Absent when the browser was verified by tapping the emailed link.
  password: loginPasswordSchema.optional(),
});

export const otpInputSchema = deviceInputSchema.extend({
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, OTP_ERROR),
});
