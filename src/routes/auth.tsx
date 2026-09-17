import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Salad } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordRecovery } from "@/lib/auth.functions";
import { beginLogin, completeLogin, getSessionVerification, verifyLoginOtp } from "@/lib/otp.functions";
import { getDeviceId } from "@/lib/device";
import {
  CREDENTIALS_ERROR,
  DOMAIN_ERROR,
  GENERIC_ERROR,
  OTP_ERROR,
  emailSchema,
  loginPasswordSchema,
} from "@/lib/auth-schema";
import { errorMessage } from "@/components/RouteStates";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in | Rorosaur Nutrition Calculator" },
      {
        name: "description",
        content: "Sign in to the Rorosaur nutrition calculator workspace.",
      },
      { property: "og:title", content: "Sign in | Rorosaur Nutrition Calculator" },
      {
        property: "og:description",
        content: "Sign in to the Rorosaur nutrition calculator workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
  validateSearch: (search: Record<string, unknown>): { redirect: string } => {
    const redirect =
      typeof search["redirect"] === "string" && /^\/(?!\/)/.test(search["redirect"])
        ? search["redirect"]
        : "/dashboard";
    return { redirect };
  },
});

type View = "signin" | "signing-in" | "otp" | "forgot" | "check-email";



function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const requestRecovery = useServerFn(requestPasswordRecovery);
  const startLogin = useServerFn(beginLogin);
  const finishLogin = useServerFn(completeLogin);
  const verifyCode = useServerFn(verifyLoginOtp);
  const checkVerification = useServerFn(getSessionVerification);
  // Starts on the quiet loading card so an already-verified browser never
  // flashes the sign-in form before the dashboard opens.
  const [view, setView] = useState<View>("signing-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // getSession is read from local storage, so a signed-out visitor sees the
    // form immediately instead of waiting for a round trip.
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (cancelled) return;
        if (!data.session?.user) {
          setView("signin");
          return;
        }
        try {
          const result = await checkVerification();
          if (cancelled) return;
          if (result.verified) {
            navigate({ to: search.redirect, replace: true });
            return;
          }
          setView("signin");
        } catch (cause) {
          if (cancelled) return;
          setError(errorMessage(cause, GENERIC_ERROR));
          setView("signin");
        }
      })
      .catch(() => {
        if (!cancelled) setView("signin");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, search.redirect, checkVerification]);

  /** Signs in with the password and finalises verification for this browser. */
  const finish = async (address: string) => {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: address,
      password,
    });
    if (signInError) {
      setError(CREDENTIALS_ERROR);
      setView("signin");
      return;
    }
    try {
      await finishLogin({ data: { deviceId: getDeviceId(), password } });
      navigate({ to: search.redirect, replace: true });
    } catch (cause) {
      await supabase.auth.signOut();
      setError(errorMessage(cause, GENERIC_ERROR));
      setView("signin");
    }
  };

  const signIn = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(DOMAIN_ERROR);
      setBusy(false);
      return;
    }
    if (!loginPasswordSchema.safeParse(password).success) {
      setError(CREDENTIALS_ERROR);
      setBusy(false);
      return;
    }
    try {
      const result = await startLogin({
        data: {
          email: parsed.data,
          password,
          deviceId: getDeviceId(),
          redirect: search.redirect,
        },
      });
      if (result.mode === "refused") {
        setError(result.message);
        return;
      }
      if (result.mode === "password") {
        // Trusted browser: no code, but never a silent jump — show the
        // "Signing you in…" card while the session is established.
        setView("signing-in");
        await finish(parsed.data);
        return;
      }
      setCode("");
      setNotice(result.notice ?? "Verification code sent to your email");
      setView("otp");
    } catch (cause) {
      setError(errorMessage(cause, CREDENTIALS_ERROR));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(DOMAIN_ERROR);
      setBusy(false);
      return;
    }
    try {
      const result = await verifyCode({
        data: { email: parsed.data, code: code.trim(), deviceId: getDeviceId(), password },
      });
      if (!result.verified) {
        setError(result.message);
        return;
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (sessionError) {
        setError(OTP_ERROR);
        return;
      }
      await finishLogin({ data: { deviceId: getDeviceId(), password } });
      navigate({ to: search.redirect, replace: true });
    } catch (cause) {
      setError(errorMessage(cause, OTP_ERROR));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(DOMAIN_ERROR);
      setBusy(false);
      return;
    }
    try {
      const result = await startLogin({
        data: {
          email: parsed.data,
          password,
          deviceId: getDeviceId(),
          redirect: search.redirect,
        },
      });
      if (result.mode === "refused") setError(result.message);
      else if (result.mode === "password") {
        setView("signing-in");
        await finish(parsed.data);
      } else
        setNotice(
          result.sent
            ? "A new code is on its way."
            : "The last code is still valid. You can ask again in a minute.",
        );
    } catch (cause) {
      setError(errorMessage(cause, GENERIC_ERROR));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (view === "forgot") {
      try {
        await requestRecovery({ data: { email: email.trim().toLowerCase() } });
        setView("check-email");
      } catch {
        setError(GENERIC_ERROR);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (view === "otp") {
      await verify();
      return;
    }
    await signIn();
  };

  const changeView = (next: View) => {
    setView(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setCode("");
    
  };

  const backToSignIn = async () => {
    await supabase.auth.signOut();
    changeView("signin");
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-sm">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Salad className="size-5" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold">Rorosaur Nutrition Calculator</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {view === "signin" && "Sign in to continue"}
          {view === "signing-in" && "Signing you in…"}
          {view === "otp" && "Enter the verification code sent to your email"}
          {view === "forgot" && "Request administrator-approved recovery"}
          {view === "check-email" && "Check your email to continue"}
        </p>
        {view === "otp" && email && (
          <p className="mt-1 text-sm font-medium text-foreground">{email}</p>
        )}

        {view === "signing-in" ? (
          <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span>One moment while we open your workspace.</span>
          </div>
        ) : view === "check-email" ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              If the address is eligible, the next step will arrive by email.
            </p>
            <Button variant="outline" className="w-full" onClick={() => changeView("signin")}>
              <ArrowLeft className="size-4" /> Back to sign in
            </Button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            {view !== "otp" && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            )}
            {view === "signin" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            )}
            {view === "otp" && (
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  className="text-center text-lg tracking-[0.6em]"
                />
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {view === "signin" ? "Sign In" : view === "otp" ? "Verify" : "Request recovery"}
            </Button>
          </form>
        )}

        {notice && !error && view !== "check-email" && (
          <p className="mt-3 text-sm text-muted-foreground">{notice}</p>
        )}
        {error && view !== "check-email" && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {view === "signin" && (
          <div className="mt-5 text-right text-sm">
            <button
              className="text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => changeView("forgot")}
            >
              Forgot password?
            </button>
          </div>
        )}
        {view === "otp" && (
          <div className="mt-5 flex items-center justify-between text-sm">
            <button
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => void backToSignIn()}
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <button
              className="text-primary hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={() => void resend()}
            >
              Resend code
            </button>
          </div>
        )}
        {view === "forgot" && (
          <button
            className="mt-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => changeView("signin")}
          >
            <ArrowLeft className="size-4" /> Back to sign in
          </button>
        )}
      </div>
    </main>
  );
}
