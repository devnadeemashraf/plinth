import type { TenantsViewModel } from "../domain/admin-models.js";
import { rawHtml, safeHtml } from "./escape.js";

export function renderTenantsView(
  data: TenantsViewModel,
  csrfToken: string,
  mountPath = "/_admin",
): string {
  const tenantRows = data.tenants
    .map((t) => {
      const statusBadge =
        t.status === "active"
          ? safeHtml`<span class="badge badge-success">Active</span>`
          : safeHtml`<span class="badge badge-danger">Suspended</span>`;

      const statusAction = t.status === "active" ? "Suspend" : "Activate";
      const nextStatus = t.status === "active" ? "suspended" : "active";

      return safeHtml`
      <tr>
        <td><strong>${t.name}</strong><br><small style="color: var(--text-muted);">${t.id}</small></td>
        <td><code>${t.slug}</code></td>
        <td>
          <form method="POST" action="${mountPath}/tenants/plan" style="display: flex; gap: 0.25rem; align-items: center;">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="tenantId" value="${t.id}">
            <select name="plan" class="form-control" style="padding: 2px 4px; font-size: 0.8rem; width: auto;">
              <option value="free" ${rawHtml(t.plan === "free" ? "selected" : "")}>Free</option>
              <option value="pro" ${rawHtml(t.plan === "pro" ? "selected" : "")}>Pro</option>
              <option value="enterprise" ${rawHtml(t.plan === "enterprise" ? "selected" : "")}>Enterprise</option>
            </select>
            <button type="submit" class="btn btn-sm btn-primary">Save</button>
          </form>
        </td>
        <td>${rawHtml(statusBadge)}</td>
        <td>
          <form method="POST" action="${mountPath}/tenants/status" style="display: inline;">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="tenantId" value="${t.id}">
            <input type="hidden" name="status" value="${nextStatus}">
            <button type="submit" class="btn btn-sm ${rawHtml(t.status === "active" ? "btn-danger" : "btn-primary")}">${statusAction}</button>
          </form>
        </td>
      </tr>
    `;
    })
    .join("\n");

  return safeHtml`
    <div class="card">
      <h2 class="card-title">Tenant Organizations</h2>
      <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.9rem;">
        Multi-tenancy isolation and subscription plan enforcement.
      </p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Slug</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rawHtml(tenantRows.length > 0 ? tenantRows : '<tr><td colspan="5" style="text-align:center;">No tenants found.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
