import { DocLayout } from "@/components/rendersend/DocLayout";

const Terms = () => (
  <DocLayout
    eyebrow="Legal"
    title="Terms of Service"
    subtitle="By using Rendersend you agree to these terms."
    lastUpdated="May 9, 2026"
  >
    <div className="callout">
      <strong>Important disclaimers up front:</strong> Rendersend is not a
      HIPAA Business Associate and must not be used to share Protected Health
      Information. Rendersend is not a regulated financial services provider and
      makes no compliance guarantees for FINRA, SEC, or other financial
      regulations. Do not use Rendersend as your sole compliance control for
      regulated data.
    </div>

    <h2>1. The service</h2>
    <p>
      Rendersend provides zero-access encrypted hosting for HTML artifacts. You
      encrypt content in your browser; we store the resulting ciphertext and
      serve it to recipients you designate. We cannot read the content you share.
    </p>

    <h2>2. Eligibility</h2>
    <p>
      You must be at least 18 years old and legally capable of entering a binding
      agreement. By using the service you represent that this is the case.
    </p>

    <h2>3. Your responsibilities</h2>
    <ul>
      <li>
        You are responsible for the content you encrypt and share. We cannot
        inspect it, but that does not relieve you of legal responsibility for it.
      </li>
      <li>
        You are responsible for managing who receives your share links. Anyone
        with the full URL (including the key fragment) can decrypt your content.
        Treat share links like passwords.
      </li>
      <li>
        You must not share content that is illegal, infringing, or that you do
        not have the right to distribute.
      </li>
      <li>
        You must not attempt to circumvent rate limits, access controls, or
        security measures.
      </li>
    </ul>

    <h2>4. Explicit non-uses</h2>
    <h3>No HIPAA / Protected Health Information</h3>
    <p>
      Rendersend has not signed a Business Associate Agreement and is not a
      HIPAA-compliant service. Do not use Rendersend to share Protected Health
      Information (PHI) as defined under HIPAA. This includes patient records,
      medical histories, lab results, or any individually identifiable health
      information.
    </p>
    <h3>No regulated financial compliance guarantees</h3>
    <p>
      Rendersend provides encryption infrastructure, not financial compliance
      infrastructure. Use of Rendersend does not satisfy record-keeping
      obligations under FINRA Rule 4511, SEC Rule 17a-4, or equivalent
      regulations. If your organization has regulatory obligations for the
      documents you share, consult your compliance team before using this service.
    </p>
    <h3>No legal advice</h3>
    <p>
      Nothing in this service or its documentation constitutes legal, financial,
      or compliance advice.
    </p>

    <h2>5. Access control limitations</h2>
    <p>
      Email-pinned shares use a soft identity check: recipients enter their email
      and we verify it matches the address the owner specified. This is not
      cryptographic authentication. Anyone who obtains the full URL including the
      key fragment can bypass the email check. Do not rely on email-pinned shares
      as your sole access control for highly sensitive material. Cryptographic
      per-recipient access control is on our roadmap.
    </p>

    <h2>6. Service availability</h2>
    <p>
      We target 99.9% uptime but do not guarantee it. We reserve the right to
      perform maintenance, modify features, or discontinue the service with
      reasonable notice. We are not liable for losses arising from downtime.
    </p>

    <h2>7. Data and encryption</h2>
    <p>
      Shares are stored for the expiry period you select. After expiry, shares
      are deleted and the ciphertext becomes permanently inaccessible. We
      maintain a 7-day soft-delete window before permanent removal from backups.
      We do not guarantee recovery of deleted data.
    </p>

    <h2>8. Limitation of liability</h2>
    <p>
      To the maximum extent permitted by law, Rendersend is provided "as is"
      without warranties of any kind. We are not liable for indirect, incidental,
      special, or consequential damages, including loss of data, revenue, or
      business, even if we have been advised of the possibility of such damages.
      Our total liability to you for any claim is limited to the amount you paid
      us in the 12 months preceding the claim, or $100, whichever is greater.
    </p>

    <h2>9. Termination</h2>
    <p>
      We may suspend or terminate accounts that violate these terms, at our
      discretion. You may delete your account at any time. On termination, your
      shares and associated data are deleted per section 7.
    </p>

    <h2>10. Changes to these terms</h2>
    <p>
      We will post updated terms here and notify registered users by email at
      least 14 days before material changes take effect. Continued use after the
      effective date constitutes acceptance.
    </p>

    <h2>11. Governing law</h2>
    <p>
      These terms are governed by the laws of the State of Delaware, without
      regard to conflict of law principles. Disputes shall be resolved in the
      courts of Delaware.
    </p>

    <h2>12. Contact</h2>
    <p>
      Rendersend · <a href="mailto:legal@rendersend.com">legal@rendersend.com</a>
    </p>
  </DocLayout>
);

export default Terms;
