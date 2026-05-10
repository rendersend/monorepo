import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      // PKCE flow
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          navigate(error ? "/login?error=auth_failed" : "/upload", { replace: true });
        });
    } else {
      // Implicit flow — Supabase client processes hash tokens automatically
      supabase.auth.getSession().then(({ data: { session } }) => {
        navigate(session ? "/upload" : "/login?error=auth_failed", { replace: true });
      });
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <span
        aria-hidden="true"
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-border"
        style={{ borderTopColor: "hsl(var(--accent))", animationTimingFunction: "linear" }}
      />
    </div>
  );
};

export default AuthCallback;
