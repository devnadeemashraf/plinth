import type { BillingViewModel } from "../domain/admin-models.js";
import { rawHtml, safeHtml } from "./escape.js";

export function renderBillingView(
  data: BillingViewModel,
  csrfToken: string,
  mountPath = "/_admin",
): string {
  const subRows = data.subscriptions
    .map((sub) => {
      return safeHtml`
      <tr>
        <td><code>${sub.id}</code></td>
        <td><code>${sub.customerId}</code></td>
        <td><strong>${sub.planId}</strong></td>
        <td><span class="badge badge-success">${sub.status}</span></td>
        <td>${sub.currentPeriodEnd}</td>
      </tr>
    `;
    })
    .join("\n");

  const invRows = data.invoices
    .map((inv) => {
      return safeHtml`
      <tr>
        <td><code>${inv.id}</code></td>
        <td><code>${inv.customerId}</code></td>
        <td>${inv.amount / 100} ${inv.currency.toUpperCase()}</td>
        <td><span class="badge badge-neutral">${inv.status}</span></td>
        <td>${inv.createdAt}</td>
      </tr>
    `;
    })
    .join("\n");

  const simulatorCard = data.isStub
    ? safeHtml`
      <div class="card" style="border: 2px dashed var(--brand-primary);">
        <h2 class="card-title">Billing &amp; Webhook Simulator (Offline Local Dev)</h2>
        <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.9rem;">
          Trigger synthetic payment events or subscriptions to test entitlement lifecycles without real payment gateways.
        </p>
        <form method="POST" action="${mountPath}/billing/simulate" style="display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap;">
          <input type="hidden" name="_csrf" value="${csrfToken}">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="eventType">Simulated Event Type</label>
            <select name="eventType" id="eventType" class="form-control" style="min-width: 200px;">
              <option value="checkout.session.completed">Checkout Session Completed</option>
              <option value="invoice.paid">Invoice Paid</option>
              <option value="customer.subscription.updated">Subscription Renewed</option>
              <option value="customer.subscription.deleted">Subscription Canceled</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="customerId">Customer ID</label>
            <input class="form-control" type="text" id="customerId" name="customerId" placeholder="cus_test_123" required>
          </div>
          <button type="submit" class="btn btn-primary">Fire Test Webhook</button>
        </form>
      </div>
    `
    : "";

  return safeHtml`
    ${rawHtml(simulatorCard)}

    <div class="card">
      <h2 class="card-title">Active Subscriptions</h2>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Subscription ID</th>
              <th>Customer ID</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Period End</th>
            </tr>
          </thead>
          <tbody>
            ${rawHtml(subRows.length > 0 ? subRows : '<tr><td colspan="5" style="text-align:center;">No subscriptions found.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Recent Invoices</h2>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Invoice ID</th>
              <th>Customer ID</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${rawHtml(invRows.length > 0 ? invRows : '<tr><td colspan="5" style="text-align:center;">No invoices found.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
