import { useEffect, useState, type FormEvent } from "react";
import { exchangeAccessToken, signInWithUsername } from "@/lib/access.functions";
import type { AuthState } from "@/types/wall";

/**
 * Drives the wall's auth gate and login fallback.
 *
 * On mount: an existing Supabase session → `authed`; else a magic `?k=` token is
 * exchanged for a viewer session (and stripped from the URL, on success or
 * failure); otherwise → `denied` (show the login form). Also exposes the
 * username/password fallback used by that form.
 */
export function useWallAuth() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [username, setUsername] = useState("viewer");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // Remove the one-time magic token from the URL + history once we've used it
    // (on success OR failure), so it isn't left visible on screen.
    const stripTokenParam = (params: URLSearchParams) => {
      params.delete("k");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    };

    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (!cancelled) setAuthState("authed");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const k = params.get("k");
      if (!k) {
        if (!cancelled) setAuthState("denied");
        return;
      }

      try {
        const tokens = await exchangeAccessToken({ data: { token: k } });
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        if (error) throw error;

        stripTokenParam(params);
        if (!cancelled) setAuthState("authed");
      } catch (err) {
        console.error("Access token exchange failed", err);
        stripTokenParam(params);
        if (!cancelled) setAuthState("denied");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const tokens = await signInWithUsername({ data: { username, password } });
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (error) throw error;
      setAuthState("authed");
    } catch {
      setLoginError("Invalid username or password");
    } finally {
      setIsLoggingIn(false);
    }
  }

  return {
    authState,
    username,
    setUsername,
    password,
    setPassword,
    loginError,
    isLoggingIn,
    handleLogin,
  };
}
