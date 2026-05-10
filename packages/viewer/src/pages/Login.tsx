import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/rendersend/BrandMark";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const VIEWER_BASE =
  (import.meta.env.VITE_VIEWER_BASE as string | undefined) ?? window.location.origin;

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 6.294C4.672 4.167 6.656 3.58 9 3.58Z"/>
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "auth_failed" ? "Sign-in failed. Please try again." : null,
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/upload", { replace: true });
    });
  }, [navigate]);

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${VIEWER_BASE}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <BrandMark className="size-10" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Sign in to Rendersend
          </h1>
          <p className="text-center text-sm text-muted-foreground">
            Encrypt and share documents securely.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <Button
            className="w-full gap-3"
            variant="outline"
            size="lg"
            onClick={signInWithGoogle}
            disabled={loading}
          >
            <GoogleIcon />
            {loading ? "Redirecting…" : "Continue with Google"}
          </Button>

          {error && (
            <p
              className="mt-4 rounded-[10px] px-3 py-2 text-center text-xs"
              style={{
                background: "hsl(var(--destructive) / 0.1)",
                color: "hsl(var(--destructive))",
              }}
            >
              {error}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By signing in you agree to our{" "}
          <a href="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default Login;
