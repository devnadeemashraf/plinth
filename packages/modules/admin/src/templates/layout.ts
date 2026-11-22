import type { BrandConfig } from "@plinth/modules-brand";
import { rawHtml, safeHtml } from "./escape.js";

export const ADMIN_CSP_HEADER =
  "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export interface AdminLayoutOptions {
  readonly title: string;
  readonly brand: BrandConfig;
  readonly csrfToken: string;
  readonly currentPath: string;
  readonly userEmail: string;
  readonly bodyHtml: string;
  readonly message?: string | undefined;
  readonly error?: string | undefined;
  readonly mountPath?: string | undefined;
}

export function renderAdminLayout(options: AdminLayoutOptions): string {
  const mount = options.mountPath ?? "/_admin";
  const { title, brand, csrfToken, currentPath, userEmail, bodyHtml, message, error } = options;

  const navLinks = [
    { label: "Dashboard", href: `${mount}`, active: currentPath === mount },
    { label: "Brand", href: `${mount}/brand`, active: currentPath.startsWith(`${mount}/brand`) },
    {
      label: "Auth & Config",
      href: `${mount}/auth`,
      active: currentPath.startsWith(`${mount}/auth`),
    },
    { label: "RBAC", href: `${mount}/rbac`, active: currentPath.startsWith(`${mount}/rbac`) },
    {
      label: "Tenants",
      href: `${mount}/tenants`,
      active: currentPath.startsWith(`${mount}/tenants`),
    },
    {
      label: "Billing",
      href: `${mount}/billing`,
      active: currentPath.startsWith(`${mount}/billing`),
    },
    {
      label: "Dev Inspector",
      href: `${mount}/dev`,
      active: currentPath.startsWith(`${mount}/dev`),
    },
  ];

  const navHtml = navLinks
    .map(
      (link) =>
        safeHtml`<a href="${link.href}" class="nav-link ${rawHtml(link.active ? "active" : "")}">${link.label}</a>`,
    )
    .join("\n");

  const alertHtml = error
    ? safeHtml`<div class="alert alert-danger">${error}</div>`
    : message
      ? safeHtml`<div class="alert alert-success">${message}</div>`
      : "";

  return safeHtml`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — ${brand.name} Admin</title>
  <style>
    :root {
      --brand-primary: ${rawHtml(brand.primaryColorHex)};
      --brand-secondary: ${rawHtml(brand.secondaryColorHex)};
      --brand-accent: ${rawHtml(brand.accentColorHex)};
      --bg-base: #f8fafc;
      --bg-surface: #ffffff;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      --danger: #ef4444;
      --success: #10b981;
      --font-stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-stack); background: var(--bg-base); color: var(--text-main); line-height: 1.5; }
    .layout-container { display: flex; min-height: 100vh; }
    .sidebar { width: 240px; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; flex-shrink: 0; }
    .sidebar-header { padding: 1.25rem; border-bottom: 1px solid #1e293b; }
    .sidebar-brand { font-size: 1.15rem; font-weight: 700; color: #ffffff; text-decoration: none; display: flex; align-items: center; gap: 0.5rem; }
    .sidebar-badge { font-size: 0.65rem; background: var(--brand-primary); color: #fff; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .sidebar-nav { padding: 1rem 0; flex: 1; }
    .nav-link { display: block; padding: 0.65rem 1.25rem; color: #94a3b8; text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: all 0.15s; }
    .nav-link:hover { color: #ffffff; background: #1e293b; }
    .nav-link.active { color: #ffffff; background: #1e293b; border-left: 3px solid var(--brand-primary); font-weight: 600; }
    .sidebar-footer { padding: 1rem 1.25rem; border-top: 1px solid #1e293b; font-size: 0.8rem; color: #64748b; }
    .sidebar-user { margin-bottom: 0.5rem; word-break: break-all; color: #cbd5e1; }
    .logout-btn { background: none; border: 1px solid #334155; color: #cbd5e1; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; width: 100%; }
    .logout-btn:hover { background: #1e293b; color: #ffffff; }
    .main-content { flex: 1; display: flex; flex-direction: column; }
    .topbar { background: var(--bg-surface); padding: 1rem 2rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
    .topbar-title { font-size: 1.25rem; font-weight: 700; }
    .page-body { padding: 2rem; flex: 1; max-width: 1280px; width: 100%; margin: 0 auto; }
    .card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
    .card-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-main); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .stat-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; padding: 1.25rem; }
    .stat-label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; }
    .stat-value { font-size: 1.75rem; font-weight: 700; color: var(--text-main); margin-top: 0.25rem; }
    .table-responsive { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
    th { padding: 0.75rem 1rem; background: var(--bg-base); color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--border-color); }
    td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-neutral { background: #f1f5f9; color: #475569; }
    .form-group { margin-bottom: 1rem; }
    .form-label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--text-main); }
    .form-control { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.9rem; background: #fff; }
    .form-control:focus { outline: none; border-color: var(--brand-primary); ring: 2px var(--brand-primary); }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 600; border-radius: 6px; cursor: pointer; border: none; text-decoration: none; transition: background 0.15s; }
    .btn-primary { background: var(--brand-primary); color: #fff; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
    .btn-danger { background: var(--danger); color: #fff; }
    .alert { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-size: 0.9rem; font-weight: 500; }
    .alert-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .alert-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="layout-container">
    <aside class="sidebar">
      <div class="sidebar-header">
        <a href="${mount}" class="sidebar-brand">
          <span>${brand.name}</span>
          <span class="sidebar-badge">Admin</span>
        </a>
      </div>
      <nav class="sidebar-nav">
        ${rawHtml(navHtml)}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">${userEmail}</div>
        <form method="POST" action="${mount}/logout">
          <input type="hidden" name="_csrf" value="${csrfToken}">
          <button type="submit" class="logout-btn">Log Out</button>
        </form>
      </div>
    </aside>
    <div class="main-content">
      <header class="topbar">
        <h1 class="topbar-title">${title}</h1>
        <div>${brand.tagline}</div>
      </header>
      <main class="page-body">
        ${rawHtml(alertHtml)}
        ${rawHtml(bodyHtml)}
      </main>
    </div>
  </div>
</body>
</html>`;
}
