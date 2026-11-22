import { toCanonicalHex } from "@plinth/core";
import type { RbacViewModel } from "../domain/admin-models.js";
import { rawHtml, safeHtml } from "./escape.js";

export function renderRbacView(
  data: RbacViewModel,
  csrfToken: string,
  mountPath = "/_admin",
): string {
  const customRolesStatus = data.allowCustomRoles
    ? safeHtml`<span class="badge badge-success">Allowed</span>`
    : safeHtml`<span class="badge badge-neutral">Disabled (Standard Roles Only)</span>`;

  const toggleActionLabel = data.allowCustomRoles ? "Disable Custom Roles" : "Allow Custom Roles";
  const nextVal = data.allowCustomRoles ? "false" : "true";

  const roleRows = data.roles
    .map((role) => {
      const perms =
        typeof role.permissions === "bigint"
          ? role.permissions
          : role.permissions
            ? BigInt(role.permissions)
            : 0n;
      const hex = toCanonicalHex(perms);
      const colorStyle = role.metadata?.colorHex
        ? `background-color: ${role.metadata.colorHex};`
        : "";
      const badgeLabel = role.metadata?.badgeLabel ?? role.name;

      return safeHtml`
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${rawHtml(
              role.metadata?.colorHex
                ? `<span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; ${colorStyle}"></span>`
                : "",
            )}
            <strong>${role.name}</strong>
            ${rawHtml(role.isSystem ? '<span class="badge badge-neutral" style="font-size: 0.65rem;">System</span>' : "")}
          </div>
        </td>
        <td><span class="badge badge-neutral">${badgeLabel}</span></td>
        <td><code>${role.position}</code></td>
        <td><code>${hex}</code></td>
        <td>${role.metadata?.description ?? ""}</td>
      </tr>
    `;
    })
    .join("\n");

  return safeHtml`
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <h2 class="card-title" style="margin-bottom: 0.25rem;">RBAC Discord-Style Engine</h2>
          <p style="color: var(--text-muted); font-size: 0.9rem;">
            O(1) BigInt bitmask resolution with rank hierarchy anti-escalation.
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div>Custom Roles: ${rawHtml(customRolesStatus)}</div>
          <form method="POST" action="${mountPath}/rbac/toggle-custom" style="display: inline;">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="allowCustomRoles" value="${nextVal}">
            <button type="submit" class="btn btn-sm btn-primary">${toggleActionLabel}</button>
          </form>
        </div>
      </div>

      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Badge Label</th>
              <th>Rank (Position)</th>
              <th>Bitmask (Hex)</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${rawHtml(roleRows.length > 0 ? roleRows : '<tr><td colspan="5" style="text-align:center;">No roles configured.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
