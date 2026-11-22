import type { BrandConfig } from "@plinth/modules-brand";
import { rawHtml, safeHtml } from "./escape.js";

export interface LoginPageOptions {
  readonly brand: BrandConfig;
  readonly csrfToken: string;
  readonly error?: string | undefined;
  readonly mountPath?: string | undefined;
}

export function renderLoginPage(options: LoginPageOptions): string {
  const mount = options.mountPath ?? "/_admin";
  const { brand, csrfToken, error } = options;

  const errorHtml = error ? safeHtml`<div class="alert alert-danger">${error}</div>` : "";

  return safeHtml`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Login — ${brand.name}</title>
  <style>
    :root {
      --brand-primary: ${rawHtml(brand.primaryColorHex)};
      --brand-secondary: ${rawHtml(brand.secondaryColorHex)};
      --bg-base: #f8fafc;
      --text-main: #0f172a;
      --border-color: #e2e8f0;
      --danger: #ef4444;
      --font-stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-stack); background: var(--bg-base); color: var(--text-main); display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
    .auth-card { background: #ffffff; border: 1px solid var(--border-color); border-radius: 12px; padding: 2.5rem; width: 100%; max-width: 400px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .brand-header { text-align: center; margin-bottom: 2rem; }
    .brand-title { font-size: 1.5rem; font-weight: 700; color: var(--text-main); }
    .brand-subtitle { font-size: 0.875rem; color: #64748b; margin-top: 0.25rem; }
    .form-group { margin-bottom: 1.25rem; }
    .form-label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; }
    .form-control { width: 100%; padding: 0.65rem 0.85rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.95rem; }
    .form-control:focus { outline: none; border-color: var(--brand-primary); }
    .btn { display: block; width: 100%; padding: 0.75rem; font-size: 0.95rem; font-weight: 600; background: var(--brand-primary); color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    .btn:hover { opacity: 0.9; }
    .alert { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.25rem; font-size: 0.875rem; font-weight: 500; }
    .alert-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="brand-header">
      <h1 class="brand-title">${brand.name}</h1>
      <p class="brand-subtitle">Super User Control Plane</p>
    </div>
    ${rawHtml(errorHtml)}
    <form method="POST" action="${mount}/login">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <div class="form-group">
        <label class="form-label" for="email">Admin Email</label>
        <input class="form-control" type="email" id="email" name="email" required autocomplete="email" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label" for="password">Password</label>
        <input class="form-control" type="password" id="password" name="password" required autocomplete="current-password">
      </div>
      <button type="submit" class="btn">Continue with Password</button>
    </form>
  </div>
</body>
</html>`;
}

export interface MfaPageOptions {
  readonly brand: BrandConfig;
  readonly mfaTicket: string;
  readonly csrfToken: string;
  readonly error?: string | undefined;
  readonly mountPath?: string | undefined;
}

export function renderMfaPage(options: MfaPageOptions): string {
  const mount = options.mountPath ?? "/_admin";
  const { brand, mfaTicket, csrfToken, error } = options;

  const errorHtml = error ? safeHtml`<div class="alert alert-danger">${error}</div>` : "";

  return safeHtml`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MFA Verification — ${brand.name}</title>
  <style>
    :root {
      --brand-primary: ${rawHtml(brand.primaryColorHex)};
      --brand-secondary: ${rawHtml(brand.secondaryColorHex)};
      --bg-base: #f8fafc;
      --text-main: #0f172a;
      --border-color: #e2e8f0;
      --danger: #ef4444;
      --font-stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-stack); background: var(--bg-base); color: var(--text-main); display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
    .auth-card { background: #ffffff; border: 1px solid var(--border-color); border-radius: 12px; padding: 2.5rem; width: 100%; max-width: 400px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .brand-header { text-align: center; margin-bottom: 2rem; }
    .brand-title { font-size: 1.5rem; font-weight: 700; color: var(--text-main); }
    .brand-subtitle { font-size: 0.875rem; color: #64748b; margin-top: 0.25rem; }
    .form-group { margin-bottom: 1.25rem; }
    .form-label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; }
    .form-control { width: 100%; padding: 0.65rem 0.85rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 1.25rem; text-align: center; letter-spacing: 4px; font-family: monospace; }
    .form-control:focus { outline: none; border-color: var(--brand-primary); }
    .btn { display: block; width: 100%; padding: 0.75rem; font-size: 0.95rem; font-weight: 600; background: var(--brand-primary); color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    .btn:hover { opacity: 0.9; }
    .alert { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.25rem; font-size: 0.875rem; font-weight: 500; }
    .alert-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="brand-header">
      <h1 class="brand-title">Two-Factor Authentication</h1>
      <p class="brand-subtitle">Enter the 6-digit TOTP code from your authenticator app</p>
    </div>
    ${rawHtml(errorHtml)}
    <form method="POST" action="${mount}/mfa">
      <input type="hidden" name="_csrf" value="${csrfToken}">
      <input type="hidden" name="mfaTicket" value="${mfaTicket}">
      <div class="form-group">
        <label class="form-label" for="totpCode">6-Digit Code</label>
        <input class="form-control" type="text" id="totpCode" name="totpCode" maxlength="6" pattern="\\d{6}" required autofocus inputmode="numeric" autocomplete="one-time-code">
      </div>
      <button type="submit" class="btn">Verify &amp; Sign In</button>
    </form>
  </div>
</body>
</html>`;
}
