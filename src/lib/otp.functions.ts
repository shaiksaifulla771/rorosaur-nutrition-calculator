import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt } from "node:crypto";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendBrevoEmail } from "@/lib/brevo.server";
import {
  ADMIN_EMAILS,
  DOMAIN_ERROR,
  EMAIL_ERROR,
  FIRST_SIGNIN_NOTICE,
  GENERIC_ERROR,
  NO_PASSWORD_NOTICE,
  OTP_ERROR,
  PASSWORD_POLICY_ERROR,
  UNKNOWN_ACCOUNT_ERROR,
  WRONG_PASSWORD_ERROR,
  completeLoginInputSchema,
  deviceInputSchema,
  emailSchema,
  loginInputSchema,
  passwordSchema,
} from "@/lib/auth-schema";

const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function deviceHash(userId: string, deviceId: string): string {
  return sha256(`${userId}:${deviceId}`);
}

/**
 * Used before an account exists: the code row is keyed by the address instead
 * of the account id, so the same browser can verify its first code.
 */
function pendingDeviceHash(email: string, deviceId: string): string {
  return sha256(`${email}:${deviceId}`);
}

function sessionIdOf(claims: Record<string, unknown>): string {
  const value = claims["session_id"];
  return typeof value === "string" ? value : "";
}

function emailOf(claims: Record<string, unknown>): string {
  return String(claims["email"] ?? "").toLowerCase();
}

/** Resolves an account by email address using the admin API (no SQL involved). */
async function findUserByEmail(admin: AdminClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(GENERIC_ERROR);
    const match = data.users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * A short-lived client that talks to the auth service directly. Used for
 * password checks and for turning a server-minted token into a session — no
 * session is ever persisted server-side.
 */
async function ephemeralClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Verifies a password server-side without keeping any session. */
async function passwordMatches(email: string, password: string): Promise<boolean> {
  const client = await ephemeralClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await client.auth.signOut();
  return true;
}

/** Creates a fresh single-use code row and emails the digits via Brevo. */
async function issueCode(
  admin: AdminClient,
  email: string,
  device: string,
): Promise<{ sent: boolean }> {
  const { data: pending } = await admin
    .from("otp_codes")
    .select("id, created_at")
    .eq("email", email)
    .eq("device_hash", device)
    .is("consumed_at", null)
    .maybeSingle();
  if (pending && Date.now() - new Date(pending.created_at).getTime() < RESEND_COOLDOWN_MS) {
    return { sent: false };
  }

  await admin
    .from("otp_codes")
    .delete()
    .eq("email", email)
    .eq("device_hash", device)
    .is("consumed_at", null);

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const { data: inserted, error: insertError } = await admin
    .from("otp_codes")
    .insert({
      email,
      device_hash: device,
      otp_hash: sha256(`${email}:${code}`),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (insertError) throw new Error(GENERIC_ERROR);

  try {
    await sendBrevoEmail(
      email,
      "Rorosaur Login Verification",
      `Your OTP is ${code}. It expires in 15 minutes. Do not share this code.`,
    );
  } catch (cause) {
    // Nothing was delivered, so leave no half-issued code behind: the next
    // attempt starts clean instead of hitting the resend cooldown.
    if (inserted) await admin.from("otp_codes").delete().eq("id", inserted.id);
    console.error(`Sign-in code email failed for ${email}:`, cause);
    throw new Error(EMAIL_ERROR);
  }
  return { sent: true };
}

async function markSessionVerified(
  admin: AdminClient,
  userId: string,
  sessionId: string,
  device: string,
) {
  await admin.from("auth_verified_session").upsert(
    {
      user_id: userId,
      session_id: sessionId,
      device_hash: device,
      verified_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + TRUST_TTL_MS).toISOString(),
    },
    { onConflict: "user_id,session_id" },
  );
}

/**
 * First step of sign-in. Validates the address against the allow list and the
 * password shape, then either clears the browser as already trusted
 * (`mode: "password"`) or emails a six-digit code via Brevo (`mode: "code"`).
 */
export const beginLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginInputSchema.parse(input))
  .handler(async ({ data }) => {
    // Expected refusals are returned, not thrown, so a wrong entry stays a
    // message on screen instead of an application error.
    const parsedEmail = emailSchema.safeParse(data.email);
    if (!parsedEmail.success) return { mode: "refused" as const, message: DOMAIN_ERROR };
    const email = parsedEmail.data;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const user = await findUserByEmail(supabaseAdmin, email);
    if (!user) {
      // Administrators are pre-created only: never conjure one from a sign-in.
      if ((ADMIN_EMAILS as readonly string[]).includes(email)) {
        return { mode: "refused" as const, message: UNKNOWN_ACCOUNT_ERROR };
      }
      // First sign-in for an allowed workspace address: no account lookup gate.
      // The typed password becomes the real password, so it must meet policy.
      if (!passwordSchema.safeParse(data.password).success) {
        return { mode: "refused" as const, message: PASSWORD_POLICY_ERROR };
      }
      const newDevice = pendingDeviceHash(email, data.deviceId);
      try {
        const { sent } = await issueCode(supabaseAdmin, email, newDevice);
        return { mode: "code" as const, sent, notice: FIRST_SIGNIN_NOTICE };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : GENERIC_ERROR;
        return {
          mode: "refused" as const,
          message: message === EMAIL_ERROR ? EMAIL_ERROR : GENERIC_ERROR,
        };
      }
    }
    const device = deviceHash(user.id, data.deviceId);

    // When the account already has a password, check it here so a wrong password
    // never triggers an email.
    const { data: hasPassword, error: hasPasswordError } = await supabaseAdmin.rpc(
      "account_has_password",
      { _email: email },
    );
    if (hasPasswordError) return { mode: "refused" as const, message: GENERIC_ERROR };
    if (hasPassword && !(await passwordMatches(email, data.password))) {
      return { mode: "refused" as const, message: WRONG_PASSWORD_ERROR };
    }

    // Accounts with no password yet get a plain explanation with the code.
    const notice = hasPassword ? undefined : NO_PASSWORD_NOTICE;

    const { data: required } = await supabaseAdmin.rpc("otp_required");
    if (!required) return { mode: "password" as const };

    const { data: trusted } = await supabaseAdmin
      .from("auth_trusted_device")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .eq("device_hash", device)
      .maybeSingle();
    if (trusted && new Date(trusted.expires_at) > new Date()) {
      return { mode: "password" as const };
    }

    let sent: boolean;
    try {
      ({ sent } = await issueCode(supabaseAdmin, email, device));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : GENERIC_ERROR;
      return {
        mode: "refused" as const,
        message: message === EMAIL_ERROR ? EMAIL_ERROR : GENERIC_ERROR,
      };
    }
    return { mode: "code" as const, sent, notice };
  });

const verifyLoginInputSchema = deviceInputSchema.extend({
  email: z.string().trim().max(320),
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, OTP_ERROR),
  // Only used when this code creates the account: the typed password becomes
  // the real password, so it is stored at creation time.
  password: z.string().max(72).optional(),
});

/**
 * Checks the emailed code and, when it matches, mints a session server-side
 * (no login link is ever sent) and hands the tokens to the browser. The code
 * is single-use, expires after 15 minutes and allows 5 attempts.
 */
export const verifyLoginOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => verifyLoginInputSchema.parse(input))
  .handler(async ({ data }) => {
    const parsedEmail = emailSchema.safeParse(data.email);
    if (!parsedEmail.success) return { verified: false as const, message: DOMAIN_ERROR };
    const email = parsedEmail.data;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const user = await findUserByEmail(supabaseAdmin, email);
    // Administrators must already exist; a workspace address may be verifying
    // its very first code, in which case the account is created just below.
    if (!user && (ADMIN_EMAILS as readonly string[]).includes(email)) {
      return { verified: false as const, message: UNKNOWN_ACCOUNT_ERROR };
    }
    const device = user
      ? deviceHash(user.id, data.deviceId)
      : pendingDeviceHash(email, data.deviceId);

    const { data: challenge } = await supabaseAdmin
      .from("otp_codes")
      .select("id, otp_hash, expires_at, attempts")
      .eq("email", email)
      .eq("device_hash", device)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!challenge || new Date(challenge.expires_at) <= new Date()) {
      return { verified: false as const, message: OTP_ERROR };
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      await supabaseAdmin
        .from("otp_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", challenge.id);
      return { verified: false as const, message: OTP_ERROR };
    }

    if (challenge.otp_hash !== sha256(`${email}:${data.code}`)) {
      await supabaseAdmin
        .from("otp_codes")
        .update({ attempts: challenge.attempts + 1 })
        .eq("id", challenge.id);
      return { verified: false as const, message: OTP_ERROR };
    }

    const { data: consumed } = await supabaseAdmin
      .from("otp_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challenge.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (!consumed) return { verified: false as const, message: OTP_ERROR };

    // The verified code proves the address, so the account can be created now.
    // The typed password is stored here: an account created without one gets an
    // unusable hash, which would leave the person unable to sign in next time.
    if (!user) {
      const chosen = data.password ?? "";
      if (!passwordSchema.safeParse(chosen).success) {
        return { verified: false as const, message: PASSWORD_POLICY_ERROR };
      }
      const { error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: chosen,
        email_confirm: true,
      });
      if (createError && !(await findUserByEmail(supabaseAdmin, email))) {
        return { verified: false as const, message: GENERIC_ERROR };
      }
    }

    // Mint a session without emailing anything: the code above is the proof.
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError) return { verified: false as const, message: GENERIC_ERROR };
    const client = await ephemeralClient();
    const { data: sessionData, error: sessionError } = await client.auth.verifyOtp({
      type: "email",
      token_hash: link.properties.hashed_token,
    });
    if (sessionError || !sessionData.session) {
      return { verified: false as const, message: GENERIC_ERROR };
    }

    return {
      verified: true as const,
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
    };
  });

/**
 * Final step of sign-in, called once a session exists (either from the password
 * on a trusted browser, or from a verified one-time code). Stores the submitted
 * password when the account has none yet, trusts the browser for 30 days and
 * marks this session as verified.
 */
export const completeLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => completeLoginInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const claims = context.claims as Record<string, unknown>;
    const sessionId = sessionIdOf(claims);
    if (!sessionId) throw new Error(GENERIC_ERROR);
    const email = emailOf(claims);
    if (!emailSchema.safeParse(email).success) throw new Error(DOMAIN_ERROR);

    const device = deviceHash(context.userId, data.deviceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: hasPassword } = await supabaseAdmin.rpc("account_has_password", {
      _email: email,
    });
    if (!hasPassword) {
      const chosen = data.password ?? "";
      if (!passwordSchema.safeParse(chosen).success) {
        throw new Error(
          "Choose a password of 8–12 characters with an uppercase letter, a lowercase letter, a number and a symbol.",
        );
      }
      const { error: setError } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        password: chosen,
      });
      if (setError) throw new Error(GENERIC_ERROR);
    }

    await supabaseAdmin
      .from("otp_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("email", email)
      .eq("device_hash", device)
      .is("consumed_at", null);

    const expiresAt = new Date(Date.now() + TRUST_TTL_MS).toISOString();
    await supabaseAdmin.from("auth_trusted_device").upsert(
      {
        user_id: context.userId,
        device_hash: device,
        last_verified_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: "user_id,device_hash" },
    );
    await markSessionVerified(supabaseAdmin, context.userId, sessionId, device);
    await context.supabase.rpc("ensure_access_role");
    return { verified: true as const };
  });

/** Whether the current session already passed the code step. */
export const getSessionVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("session_verified");
    if (error) throw new Error(OTP_ERROR);
    return { verified: Boolean(data) };
  });

/**
 * Ends the verification for this session on sign-out. The browser stays trusted
 * for its 30 days, so signing back in needs the password only.
 */
export const endVerifiedSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deviceInputSchema.parse(input))
  .handler(async ({ context }) => {
    const sessionId = sessionIdOf(context.claims as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("auth_verified_session")
      .delete()
      .eq("user_id", context.userId)
      .eq("session_id", sessionId);
    return { ended: true as const };
  });
