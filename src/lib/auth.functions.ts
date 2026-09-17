import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createHash, randomBytes } from "node:crypto";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_EMAILS, GENERIC_ERROR, REQUEST_ERROR, emailInputSchema } from "@/lib/auth-schema";

export const requestPasswordRecovery = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => emailInputSchema.parse(input))
  .handler(async ({ data }) => {
    const normalized = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const target = users.users.find(
      (user) => user.email?.toLowerCase() === normalized && Boolean(user.email_confirmed_at),
    );
    if (!target) return { accepted: true };

    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("password_reset_approvals")
      .select("id")
      .eq("target_user_id", target.id)
      .gte("created_at", cutoff)
      .limit(1);
    if (recent?.length) return { accepted: true };

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("password_reset_approvals")
      .delete()
      .eq("target_user_id", target.id)
      .is("approved_at", null)
      .is("consumed_at", null);
    const { error } = await supabaseAdmin.from("password_reset_approvals").insert({
      target_user_id: target.id,
      target_email: normalized,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (error) return { accepted: true };

    // The approval link goes only to the fixed administrators — never to the
    // requester — so a reset always passes through a human approval step. The
    // email names who asked and when; the token alone authorises the approval.
    const origin = new URL(getRequest().url).origin;
    const approveUrl =
      `${origin}/approve-recovery?token=${token}` +
      `&for=${encodeURIComponent(normalized)}&at=${encodeURIComponent(new Date().toISOString())}`;
    const { sendBrevoEmail } = await import("@/lib/brevo.server");
    for (const admin of ADMIN_EMAILS) {
      await sendBrevoEmail(
        admin,
        "Approve a password reset request",
        `A password reset was requested for ${normalized}.\n\n` +
          `If you want to allow it, open this link within 15 minutes (you will need to be signed in as an administrator):\n${approveUrl}\n\n` +
          `If you do not want to allow it, ignore this email — nothing changes.`,
      );
    }
    return { accepted: true };
  });

export const approvePasswordRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object" || !("token" in input)) throw new Error(REQUEST_ERROR);
    const token = String(input.token);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error(REQUEST_ERROR);
    return { token };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error(REQUEST_ERROR);
    const tokenHash = createHash("sha256").update(data.token).digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: request } = await supabaseAdmin
      .from("password_reset_approvals")
      .select("id, target_email, expires_at, approved_at, consumed_at, attempts")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!request || request.approved_at || request.consumed_at || new Date(request.expires_at) <= new Date()) {
      throw new Error(REQUEST_ERROR);
    }
    const approvedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("password_reset_approvals")
      .update({ approved_at: approvedAt, approved_by: context.userId, attempts: request.attempts + 1 })
      .eq("id", request.id)
      .is("approved_at", null)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) throw new Error(REQUEST_ERROR);

    const req = getRequest();
    const origin = new URL(req.url).origin;
    // Build the reset link ourselves and send it through Brevo, so every email
    // comes from the same verified sender and no link email is sent by the
    // platform default mailer.
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: request.target_email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    let sendError: Error | null = null;
    if (linkError) {
      sendError = new Error(linkError.message);
    } else {
      try {
        const { sendBrevoEmail } = await import("@/lib/brevo.server");
        await sendBrevoEmail(
          request.target_email,
          "Set a new password",
          `Your administrator approved a password reset for your account.\n\n` +
            `Open this link to choose a new password (it expires in 15 minutes and works once):\n` +
            `${link.properties.action_link}\n\n` +
            `If you did not ask for this, ignore this email — your password stays the same.`,
        );
      } catch (cause) {
        sendError = cause as Error;
      }
    }
    if (sendError) {
      await supabaseAdmin
        .from("password_reset_approvals")
        .update({ approved_at: null, approved_by: null })
        .eq("id", request.id)
        .eq("approved_at", approvedAt);
      throw new Error(GENERIC_ERROR);
    }
    return { approved: true };
  });

export const completePasswordRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("password_reset_approvals")
      .update({ consumed_at: new Date().toISOString() })
      .eq("target_user_id", context.userId)
      .not("approved_at", "is", null)
      .is("consumed_at", null);
    return { completed: true };
  });

export const reconcileMyAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("ensure_access_role");
    if (error) throw new Error(GENERIC_ERROR);
    return { role: data };
  });