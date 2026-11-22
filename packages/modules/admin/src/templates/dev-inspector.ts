import type { DevInspectorViewModel } from "../domain/admin-models.js";
import { rawHtml, safeHtml } from "./escape.js";

export function renderDevInspectorView(
  data: DevInspectorViewModel,
  csrfToken: string,
  mountPath = "/_admin",
): string {
  const auditRows = data.auditLogs
    .map((entry) => {
      const diffString = entry.payloadDiff ? JSON.stringify(entry.payloadDiff, null, 2) : "-";
      return safeHtml`
      <tr>
        <td><small>${entry.createdAt}</small></td>
        <td><strong>${entry.action}</strong></td>
        <td><code>${entry.actorId ?? "-"}</code></td>
        <td><code>${entry.tenantId ?? "-"}</code></td>
        <td><pre style="max-height: 80px; overflow-y: auto; font-size: 0.75rem; background: var(--bg-base); padding: 4px; border-radius: 4px;">${diffString}</pre></td>
      </tr>
    `;
    })
    .join("\n");

  const outboxRows = data.outboxJobs
    .map((job) => {
      const statusBadge =
        job.status === "completed"
          ? safeHtml`<span class="badge badge-success">Completed</span>`
          : job.status === "failed"
            ? safeHtml`<span class="badge badge-danger">Failed (DLQ)</span>`
            : safeHtml`<span class="badge badge-neutral">${job.status}</span>`;

      const retryBtn =
        job.status === "failed"
          ? safeHtml`
          <form method="POST" action="${mountPath}/dev/queue/retry" style="display: inline;">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="jobId" value="${job.id}">
            <button type="submit" class="btn btn-sm btn-primary">Retry</button>
          </form>
        `
          : "-";

      return safeHtml`
      <tr>
        <td><code>${job.id}</code></td>
        <td><strong>${job.eventType}</strong></td>
        <td>${rawHtml(statusBadge)}</td>
        <td>${job.retryCount}</td>
        <td><small style="color: var(--danger);">${job.lastError ?? "-"}</small></td>
        <td>${rawHtml(retryBtn)}</td>
      </tr>
    `;
    })
    .join("\n");

  const emailRows = data.caughtEmails
    .map((email) => {
      return safeHtml`
      <tr>
        <td><small>${email.sentAt}</small></td>
        <td><code>${email.to}</code></td>
        <td><strong>${email.subject}</strong></td>
        <td>
          <details>
            <summary style="cursor: pointer; color: var(--brand-primary); font-size: 0.8rem;">View HTML Body</summary>
            <div style="margin-top: 0.5rem; padding: 1rem; border: 1px solid var(--border-color); border-radius: 6px; background: #fff;">
              ${rawHtml(email.html ?? "<p>No HTML body</p>")}
            </div>
          </details>
        </td>
      </tr>
    `;
    })
    .join("\n");

  return safeHtml`
    <div class="card">
      <h2 class="card-title">Dead-Letter Queue (DLQ) &amp; Outbox Events</h2>
      <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.9rem;">
        Monitor asynchronous worker events, failed tasks, and trigger immediate manual retries.
      </p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Event Type</th>
              <th>Status</th>
              <th>Retries</th>
              <th>Error Details</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rawHtml(outboxRows.length > 0 ? outboxRows : '<tr><td colspan="6" style="text-align:center;">No outbox jobs found.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Local Email Catcher (Development Inbox)</h2>
      <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.9rem;">
        Captured outbound emails for testing verification codes and transactional notifications without external SMTP.
      </p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Recipient (To)</th>
              <th>Subject</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            ${rawHtml(emailRows.length > 0 ? emailRows : '<tr><td colspan="4" style="text-align:center;">No emails caught in this session.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Append-Only Audit Logs</h2>
      <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.9rem;">
        Immutable administrative actions and security mutations with dual-layer PII masking applied.
      </p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Actor ID</th>
              <th>Tenant ID</th>
              <th>Masked Payload Diff</th>
            </tr>
          </thead>
          <tbody>
            ${rawHtml(auditRows.length > 0 ? auditRows : '<tr><td colspan="5" style="text-align:center;">No audit records found.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
