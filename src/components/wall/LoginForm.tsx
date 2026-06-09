import type { FormEvent } from "react";

type LoginFormProps = {
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  loginError: string;
  isLoggingIn: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Username/password fallback, shown when there's no session and no magic token. */
export function LoginForm({
  username,
  setUsername,
  password,
  setPassword,
  loginError,
  isLoggingIn,
  onSubmit,
}: LoginFormProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-xl font-semibold">Sign in</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              autoComplete="username"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              type="password"
              autoComplete="current-password"
            />
          </label>
          {loginError ? <p className="text-sm text-destructive">{loginError}</p> : null}
          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {isLoggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
