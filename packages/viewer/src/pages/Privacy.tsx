import { DocLayout } from "@/components/rendersend/DocLayout";

const Privacy = () => (
  <DocLayout
    eyebrow="Legal"
    title="Privacy Policy"
    subtitle="What we collect, why, and what zero-access encryption means for your privacy."
    lastUpdated="May 9, 2026"
  >
    <div className="callout">
      <strong>The short version:</strong> We store your email address and share
      metadata. We cannot read the content you share — it is encrypted in your
      browser before it reaches our servers, and we never hold the key.
    </div>

    <h2>What we collect</h2>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Why</th>
          <th>How long</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Your email address</strong></td>
          <td>To identify you as the owner of a share and to gate recipient access</td>
          <td>Until you request deletion</td>
        </tr>
        <tr>
          <td><strong>Recipient email addresses</strong></td>
          <td>Soft access check — we verify the recipient entered the email the owner pinned</td>
          <td>Until the share expires or is deleted</td>
        </tr>
        <tr>
          <td><strong>Share metadata</strong></td>
          <td>Expiry, view count, first/last view timestamp, blob size</td>
          <td>Until the share is deleted</td>
        </tr>
        <tr>
          <td><strong>IP address</strong></td>
          <td>Rate-limiting the email verification endpoint (max 5 attempts / 10 min)</td>
          <td>10-minute rolling window, not stored permanently</td>
        </tr>
        <tr>
          <td><strong>Encrypted content blob</strong></td>
          <td>To serve to authorized recipients</td>
          <td>Until the share expires or is deleted</td>
        </tr>
      </tbody>
    </table>

    <h2>What we cannot collect</h2>
    <p>
      The content of your shares is encrypted using AES-256-GCM in your browser
      before it leaves your device. The decryption key is embedded in the URL
      fragment (the part after <code>#</code>), which browsers never transmit to
      servers. We receive and store only opaque ciphertext. This means:
    </p>
    <ul>
      <li>We cannot read your reports, dashboards, or analyses.</li>
      <li>We cannot produce readable content in response to legal demands.</li>
      <li>A breach of our servers exposes only encrypted bytes, not your content.</li>
    </ul>

    <h2>How we use your data</h2>
    <ul>
      <li>To operate the service (store and serve your shares, enforce expiry)</li>
      <li>To let you manage your shares (revoke access, view who accessed)</li>
      <li>To prevent abuse (rate limiting, spam detection)</li>
    </ul>
    <p>
      We do not sell your data. We do not use your data for advertising.
      We do not share your data with third parties except as required to operate
      the service (e.g., cloud infrastructure providers under data processing agreements).
    </p>

    <h2>Your rights (GDPR and CCPA)</h2>
    <p>
      Regardless of where you are, you can request:
    </p>
    <ul>
      <li><strong>Access</strong> — a copy of the data we hold about you</li>
      <li>
        <strong>Deletion</strong> — deletion of your account and all associated
        shares. Because your content is encrypted and we hold no key, deleting
        your shares also makes the underlying ciphertext permanently unreadable.
      </li>
      <li><strong>Correction</strong> — correction of inaccurate personal data</li>
      <li><strong>Portability</strong> — your data in a machine-readable format</li>
      <li>
        <strong>Objection</strong> — you may object to processing based on
        legitimate interests
      </li>
    </ul>
    <p>
      To exercise any of these rights, email{" "}
      <a href="mailto:privacy@rendersend.com">privacy@rendersend.com</a>. We will
      respond within 30 days.
    </p>

    <h2>Data retention</h2>
    <p>
      Shares are deleted at the expiry date you set (24 hours, 7 days, 30 days, or
      1 year). Owner and recipient email addresses are retained until you request
      account deletion. Deleted shares undergo a 7-day soft-delete window before
      permanent removal from backups.
    </p>

    <h2>Cookies and local storage</h2>
    <p>
      We do not use tracking cookies or advertising pixels. We use browser
      localStorage to cache your verified email for a share so you do not have to
      re-enter it on repeat visits. This data stays on your device and is never
      transmitted to our servers.
    </p>

    <h2>Security contact</h2>
    <p>
      To report a security vulnerability, email{" "}
      <a href="mailto:security@rendersend.com">security@rendersend.com</a>. Please
      see our <a href="/security">Security page</a> for our threat model and
      responsible disclosure policy.
    </p>

    <h2>Changes to this policy</h2>
    <p>
      We will post changes here and update the "Last updated" date. Material changes
      affecting how we handle personal data will be communicated by email to
      registered users at least 14 days before they take effect.
    </p>

    <h2>Contact</h2>
    <p>
      Rendersend · <a href="mailto:privacy@rendersend.com">privacy@rendersend.com</a>
    </p>
  </DocLayout>
);

export default Privacy;
