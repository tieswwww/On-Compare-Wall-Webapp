import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VIEWER_EMAIL = "viewer@local.app";
const NODE_RED_EMAIL = "node-red@local.app";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function ensureUser(email: string, password: string) {
  // IMPORTANT: do NOT call updateUserById with a password on every login.
  // Supabase revokes all existing refresh tokens whenever a user's password
  // changes, which would invalidate sessions stored in other browsers/tabs
  // and force users to log in again. Only create the user if missing.
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existing = list?.users.find((u) => u.email === email);
  if (existing) return;

  await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
}


/**
 * Exchange the shared access token for a Supabase session.
 * On success, returns access + refresh tokens the client can persist.
 */
export const exchangeAccessToken = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().min(1).max(512) }).parse(input),
  )
  .handler(async ({ data }) => {
    const expected = process.env.VIEWER_ACCESS_TOKEN;
    const viewerPassword = process.env.VIEWER_PASSWORD;
    const nodeRedPassword = process.env.NODE_RED_PASSWORD;

    if (!expected || !viewerPassword || !nodeRedPassword) {
      throw new Error("Server not configured");
    }
    if (!safeEqual(data.token, expected)) {
      throw new Error("Invalid access token");
    }

    // Ensure both service users exist with current passwords.
    await ensureUser(VIEWER_EMAIL, viewerPassword);
    await ensureUser(NODE_RED_EMAIL, nodeRedPassword);

    // Mint a session for the viewer.
    const { data: session, error } =
      await supabaseAdmin.auth.signInWithPassword({
        email: VIEWER_EMAIL,
        password: viewerPassword,
      });
    if (error || !session.session) {
      throw new Error(error?.message ?? "Sign-in failed");
    }

    return {
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      expires_at: session.session.expires_at,
    };
  });

export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        username: z.string().trim().min(1).max(64),
        password: z.string().min(1).max(512),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const viewerPassword = process.env.VIEWER_PASSWORD;
    const nodeRedPassword = process.env.NODE_RED_PASSWORD;
    if (!viewerPassword || !nodeRedPassword) {
      throw new Error("Server not configured");
    }

    const normalizedUsername = data.username.trim().toLowerCase();
    if (normalizedUsername !== "viewer" && normalizedUsername !== "user") {
      throw new Error("Invalid username or password");
    }

    await ensureUser(VIEWER_EMAIL, viewerPassword);
    await ensureUser(NODE_RED_EMAIL, nodeRedPassword);

    const { data: session, error } =
      await supabaseAdmin.auth.signInWithPassword({
        email: VIEWER_EMAIL,
        password: data.password,
      });
    if (error || !session.session) {
      throw new Error("Invalid username or password");
    }

    return {
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      expires_at: session.session.expires_at,
    };
  });
