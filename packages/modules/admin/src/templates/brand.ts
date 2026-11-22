import type { BrandConfig } from "@plinth/modules-brand";
import { safeHtml } from "./escape.js";

export function renderBrandView(
  brand: BrandConfig,
  csrfToken: string,
  mountPath = "/_admin",
): string {
  return safeHtml`
    <div class="card">
      <h2 class="card-title">Brand Identity &amp; Theming</h2>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.9rem;">
        Changes here immediately re-theme the Admin Panel, API Scalar docs, and transactional email templates.
      </p>

      <form method="POST" action="${mountPath}/brand">
        <input type="hidden" name="_csrf" value="${csrfToken}">

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
          <div class="form-group">
            <label class="form-label" for="name">Brand Name</label>
            <input class="form-control" type="text" id="name" name="name" value="${brand.name}" required>
          </div>

          <div class="form-group">
            <label class="form-label" for="tagline">Tagline</label>
            <input class="form-control" type="text" id="tagline" name="tagline" value="${brand.tagline}">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
          <div class="form-group">
            <label class="form-label" for="primaryColorHex">Primary Color (Hex)</label>
            <input class="form-control" type="text" id="primaryColorHex" name="primaryColorHex" value="${brand.primaryColorHex}" pattern="^#[0-9a-fA-F]{6}$" required>
          </div>

          <div class="form-group">
            <label class="form-label" for="secondaryColorHex">Secondary Color (Hex)</label>
            <input class="form-control" type="text" id="secondaryColorHex" name="secondaryColorHex" value="${brand.secondaryColorHex}" pattern="^#[0-9a-fA-F]{6}$" required>
          </div>

          <div class="form-group">
            <label class="form-label" for="accentColorHex">Accent Color (Hex)</label>
            <input class="form-control" type="text" id="accentColorHex" name="accentColorHex" value="${brand.accentColorHex}" pattern="^#[0-9a-fA-F]{6}$" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
          <div class="form-group">
            <label class="form-label" for="supportEmail">Support Email</label>
            <input class="form-control" type="email" id="supportEmail" name="supportEmail" value="${brand.supportEmail}">
          </div>

          <div class="form-group">
            <label class="form-label" for="emailFooterHtml">Email Footer HTML</label>
            <input class="form-control" type="text" id="emailFooterHtml" name="emailFooterHtml" value="${brand.emailFooterHtml}">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
          <div class="form-group">
            <label class="form-label" for="legalTermsUrl">Terms of Service URL</label>
            <input class="form-control" type="url" id="legalTermsUrl" name="legalTermsUrl" value="${brand.legalTermsUrl}">
          </div>

          <div class="form-group">
            <label class="form-label" for="legalPrivacyUrl">Privacy Policy URL</label>
            <input class="form-control" type="url" id="legalPrivacyUrl" name="legalPrivacyUrl" value="${brand.legalPrivacyUrl}">
          </div>
        </div>

        <div style="margin-top: 1.5rem;">
          <button type="submit" class="btn btn-primary">Save Brand Settings</button>
        </div>
      </form>
    </div>
  `;
}
