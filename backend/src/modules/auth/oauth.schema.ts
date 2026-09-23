import { z } from "zod";

import { OAUTH_PROVIDERS } from "../../lib/oauth/identity.js";

const provider = z.enum(OAUTH_PROVIDERS);

export const providerParamsSchema = z.object({ provider });

// `next` is screened again by lib/nextPath.ts before it is used. The cap here
// only keeps an absurd value out of the signed cookie.
export const oauthStartSchema = z.object({
  next: z.string().max(512).optional(),
});

// Nothing is required: the provider sends `error` instead of `code` when the
// person cancels, and a bare callback with neither is a stray request. All
// three shapes have to reach the handler so it can redirect rather than 400
// into a blank page mid-navigation.
export const oauthCallbackSchema = z.object({
  code: z.string().max(2048).optional(),
  state: z.string().max(2048).optional(),
  error: z.string().max(256).optional(),
});

export const linkStartSchema = z.object({ provider });

export const linkConfirmSchema = z.object({ token: z.string().min(1).max(512) });

export const connectionParamsSchema = z.object({ id: z.uuid() });

export type ProviderParams = z.infer<typeof providerParamsSchema>;
export type OAuthStartQuery = z.infer<typeof oauthStartSchema>;
export type OAuthCallbackQuery = z.infer<typeof oauthCallbackSchema>;
export type LinkStartInput = z.infer<typeof linkStartSchema>;
export type LinkConfirmInput = z.infer<typeof linkConfirmSchema>;
export type ConnectionParams = z.infer<typeof connectionParamsSchema>;
