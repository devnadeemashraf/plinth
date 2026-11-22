import type { DashboardViewModel } from "../domain/admin-models.js";
import { rawHtml, safeHtml } from "./escape.js";

export function renderDashboardView(data: DashboardViewModel): string {
  const dbStatusBadge = data.dbHealthy
    ? safeHtml`<span class="badge badge-success">Connected</span>`
    : safeHtml`<span class="badge badge-danger">Unreachable</span>`;

  return safeHtml`
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Tenants</div>
        <div class="stat-value">${data.tenantCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Users</div>
        <div class="stat-value">${data.userCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Configured Roles</div>
        <div class="stat-value">${data.roleCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Audit Log Events</div>
        <div class="stat-value">${data.auditEventCount}</div>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">System &amp; Runtime Overview</h2>
      <div class="table-responsive">
        <table>
          <tbody>
            <tr>
              <th>Node.js Version</th>
              <td><code>${data.nodeVersion}</code></td>
            </tr>
            <tr>
              <th>Process Uptime</th>
              <td>${Math.floor(data.uptimeSec)} seconds</td>
            </tr>
            <tr>
              <th>Memory (RSS)</th>
              <td>${data.memoryMb} MB</td>
            </tr>
            <tr>
              <th>Database Health</th>
              <td>${rawHtml(dbStatusBadge)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}
