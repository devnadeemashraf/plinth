import type { AuthConfigViewModel } from "../domain/admin-models.js";
import { rawHtml, safeHtml } from "./escape.js";

export function renderAuthConfigView(
  data: AuthConfigViewModel,
  csrfToken: string,
  mountPath = "/_admin",
): string {
  const flagsRows = data.flags
    .map((flag) => {
      const statusBadge = flag.enabled
        ? safeHtml`<span class="badge badge-success">Enabled</span>`
        : safeHtml`<span class="badge badge-neutral">Disabled</span>`;
      const actionLabel = flag.enabled ? "Disable" : "Enable";
      const nextVal = flag.enabled ? "false" : "true";

      return safeHtml`
      <tr>
        <td><strong><code>${flag.key}</code></strong></td>
        <td>${flag.description ?? ""}</td>
        <td>${rawHtml(statusBadge)}</td>
        <td>
          <form method="POST" action="${mountPath}/auth/toggle" style="display: inline;">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="key" value="${flag.key}">
            <input type="hidden" name="enabled" value="${nextVal}">
            <button type="submit" class="btn btn-sm ${rawHtml(flag.enabled ? "btn-danger" : "btn-primary")}">${actionLabel}</button>
          </form>
        </td>
      </tr>
    `;
    })
    .join("\n");

  const secretsRows = data.secrets
    .map((secret) => {
      return safeHtml`
      <tr>
        <td><strong><code>${secret.key}</code></strong></td>
        <td>${secret.description ?? ""}</td>
        <td><code style="color: var(--text-muted);">${secret.maskedValue}</code></td>
        <td>
          <form method="POST" action="${mountPath}/auth/secret" style="display: flex; gap: 0.5rem; align-items: center;">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="key" value="${secret.key}">
            <input class="form-control" type="password" name="value" placeholder="New Secret Value" required style="max-width: 200px; padding: 2px 6px; font-size: 0.8rem;">
            <button type="submit" class="btn btn-sm btn-primary">Update</button>
          </form>
        </td>
      </tr>
    `;
    })
    .join("\n");

  return safeHtml`
    <div class="card">
      <h2 class="card-title">Runtime Feature Flags</h2>
      <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.9rem;">
        Toggle live authentication methods without restarting backend processes.
      </p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Feature Flag Key</th>
              <th>Description</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rawHtml(flagsRows.length > 0 ? flagsRows : '<tr><td colspan="4" style="text-align:center;">No feature flags registered.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Encrypted Secrets (ConfigStore)</h2>
      <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.9rem;">
        Encrypted at rest using AES-256-GCM envelope encryption. Plaintext is never displayed.
      </p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Secret Key</th>
              <th>Description</th>
              <th>Stored Value</th>
              <th>Set New Value</th>
            </tr>
          </thead>
          <tbody>
            ${rawHtml(secretsRows.length > 0 ? secretsRows : '<tr><td colspan="4" style="text-align:center;">No encrypted secrets registered.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
