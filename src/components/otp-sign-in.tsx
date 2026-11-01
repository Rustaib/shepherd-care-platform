"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Email + 6-digit code sign-in. Codes (not magic links) are used on purpose:
 *  on iPhone a magic link opens in Safari rather than the home-screen app,
 *  which would leave the installed app signed out. */
export function OtpSignIn({
  next = "/dashboard",
  lockedEmail,
  allowNewUsers = false,
  cta = "Send sign-in code",
}: {
  next?: string;
  lockedEmail?: string;
  allowNewUsers?: boolean;
  cta?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const supabase = createClient();

  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: allowNewUsers },
      });
      if (error) {
        setError(
          error.message.includes("Signups not allowed")
            ? "We couldn't find an account for that email. Ask your administrator for an invitation."
            : error.message,
        );
        return;
      }
      setStep("code");
    });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (error) return setError("That code didn't work. Check it, or request a new one.");
      router.replace(next);
      router.refresh();
    });
  };

  if (step === "code") {
    return (
      <form onSubmit={verify} className="space-y-4">
        <p className="text-sm text-muted">
          We sent a 6-digit code to <strong className="text-ink">{email}</strong>.
        </p>
        <div>
          <label htmlFor="code" className="label">Code</label>
          <input id="code" className="field text-center text-2xl tracking-[0.4em]" inputMode="numeric"
            autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required autoFocus
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full" disabled={pending || code.length !== 6}>
          {pending ? "Checking…" : "Sign in"}
        </button>
        <button type="button" className="w-full text-sm text-muted underline" onClick={() => { setStep("email"); setCode(""); }}>
          Use a different email or resend
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" type="email" className="field" autoComplete="email" required
          readOnly={!!lockedEmail} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Sending…" : cta}</button>
    </form>
  );
}
