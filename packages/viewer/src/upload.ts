/**
 * Upload page logic.
 *
 * Encrypts HTML in the browser via WebCrypto, uploads opaque ciphertext
 * to the API, then surfaces the share link with the key in the URL
 * fragment. The recipient-email step uses `mailto:` so the link never
 * leaves the user's machine through our server — the user's own email
 * client transmits it. This preserves the zero-access invariant for
 * the email handoff.
 */
import {
  generateKey,
  exportKeyRaw,
  encrypt,
  packBlob,
  bytesToB64Url,
  encodeUtf8,
} from "@rendersend/crypto";

const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined)
  ?? "http://localhost:8787";

const VIEWER_BASE = window.location.origin;

const MAX_BYTES = 10 * 1024 * 1024;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const form = $<HTMLFormElement>("form");
const htmlInput = $<HTMLTextAreaElement>("html");
const fileInput = $<HTMLInputElement>("file");
const emailInput = $<HTMLInputElement>("email");
const submitBtn = $<HTMLButtonElement>("submit");
const errorEl = $("error");
const resultEl = $("result");
const linkInput = $<HTMLInputElement>("link");
const copyBtn = $<HTMLButtonElement>("copy");
const emailBtn = $<HTMLButtonElement>("email-btn");
const resetBtn = $<HTMLButtonElement>("reset-btn");
const expiresEl = $("expires");
const sizeEl = $("size");

let lastShareUrl = "";

function showError(msg: string): void {
  errorEl.textContent = msg;
  errorEl.classList.add("show");
}

function clearError(): void {
  errorEl.textContent = "";
  errorEl.classList.remove("show");
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > MAX_BYTES) {
    showError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max is 10 MB.`);
    fileInput.value = "";
    return;
  }
  clearError();
  const text = await file.text();
  htmlInput.value = text;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const html = htmlInput.value.trim();
  if (!html) {
    showError("Paste HTML or upload a file before sharing.");
    return;
  }
  const plaintext = encodeUtf8(html);
  if (plaintext.byteLength > MAX_BYTES) {
    showError(`HTML is ${(plaintext.byteLength / 1024 / 1024).toFixed(1)} MB. Max is 10 MB.`);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Encrypting…";

  try {
    const key = await generateKey();
    const blob = await encrypt(key, plaintext);
    const packed = packBlob(blob);

    submitBtn.textContent = "Uploading…";
    const resp = await fetch(`${API_BASE}/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: packed,
    });
    if (!resp.ok) {
      throw new Error(`upload failed: HTTP ${resp.status}`);
    }
    const { id, expiresAt } = (await resp.json()) as { id: string; expiresAt: number };

    const rawKey = await exportKeyRaw(key);
    const keyB64 = bytesToB64Url(rawKey);
    const url = `${VIEWER_BASE}/v/${id}#${keyB64}`;

    lastShareUrl = url;
    linkInput.value = url;

    expiresEl.textContent = `Expires ${new Date(expiresAt).toLocaleString()}`;
    sizeEl.textContent = `${(packed.byteLength / 1024).toFixed(1)} KB encrypted`;

    const recipient = emailInput.value.trim();
    if (recipient) {
      emailBtn.hidden = false;
      emailBtn.dataset.recipient = recipient;
      emailBtn.textContent = `Email link to ${recipient}`;
    } else {
      emailBtn.hidden = true;
    }

    form.style.display = "none";
    resultEl.classList.add("show");
  } catch (err) {
    showError((err as Error).message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Share securely";
  }
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(lastShareUrl);
  copyBtn.textContent = "Copied";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
});

emailBtn.addEventListener("click", () => {
  const recipient = emailBtn.dataset.recipient ?? "";
  const subject = "An encrypted document was shared with you";
  const body = [
    "Someone shared an encrypted HTML document with you via Rendersend.",
    "",
    "Open this link in your browser to decrypt and view it:",
    lastShareUrl,
    "",
    "The decryption key is part of the URL after the # symbol — keep the",
    "full link confidential. Do not paste it into untrusted services.",
  ].join("\n");
  const href = `mailto:${encodeURIComponent(recipient)}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`;
  window.location.href = href;
});

resetBtn.addEventListener("click", () => {
  lastShareUrl = "";
  htmlInput.value = "";
  fileInput.value = "";
  emailInput.value = "";
  resultEl.classList.remove("show");
  form.style.display = "";
  clearError();
});
