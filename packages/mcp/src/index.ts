#!/usr/bin/env node
/**
 * Rendersend local MCP server.
 *
 * Exposes share_html. Owner email can be provided per-call as a tool
 * argument or via the RENDERSEND_OWNER_EMAIL env var (set in the
 * Claude Desktop MCP config). Per-call argument wins if both are set.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { shareHtml } from "./share.ts";

const API_BASE = process.env.RENDERSEND_API ?? "http://localhost:8787";
const VIEWER_BASE = process.env.RENDERSEND_VIEWER ?? "http://localhost:5173";
const DEFAULT_OWNER_EMAIL = process.env.RENDERSEND_OWNER_EMAIL ?? "";

const server = new Server(
  { name: "rendersend", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "share_html",
      description:
        "Encrypt an HTML artifact and upload it to Rendersend. Returns a "
        + "shareable link. The decryption key lives only in the URL fragment "
        + "and is never sent to the server.",
      inputSchema: {
        type: "object",
        properties: {
          html: {
            type: "string",
            description: "The HTML content to share. Up to 10 MB.",
          },
          owner_email: {
            type: "string",
            description:
              "Your email — used to identify and manage your shares. "
              + "If omitted, falls back to the RENDERSEND_OWNER_EMAIL env var.",
          },
          recipient_emails: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional. One or more recipient email addresses. When set, each "
              + "recipient must enter their email at the viewer before the content "
              + "is decrypted (soft cross-check, not cryptographic enforcement).",
          },
          expires_in_seconds: {
            type: "number",
            description:
              "Optional. Share TTL in seconds. Allowed values: 86400 (24 h), "
              + "604800 (7 days, default), 2592000 (30 days), 31536000 (1 year).",
          },
        },
        required: ["html"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "share_html") {
    throw new Error(`unknown tool: ${request.params.name}`);
  }
  const args = request.params.arguments as {
    html?: string;
    owner_email?: string;
    recipient_emails?: string[];
    expires_in_seconds?: number;
  };
  if (!args?.html) {
    throw new Error("missing required argument: html");
  }

  const ownerEmail = (args.owner_email ?? DEFAULT_OWNER_EMAIL).trim();
  if (!ownerEmail) {
    throw new Error(
      "owner_email is required (pass as an argument or set "
      + "RENDERSEND_OWNER_EMAIL in the MCP server env)",
    );
  }

  const recipientEmails = args.recipient_emails
    ?.map((e) => e.trim().toLowerCase())
    .filter(Boolean) ?? null;

  const result = await shareHtml(args.html, {
    apiBase: API_BASE,
    viewerBase: VIEWER_BASE,
    ownerEmail,
    recipientEmails: recipientEmails?.length ? recipientEmails : null,
    expiresInSeconds: args.expires_in_seconds,
  });

  const expiresIso = new Date(result.expiresAt).toISOString();
  const lines = [
    `Shared. Link: ${result.url}`,
    `Expires: ${expiresIso}`,
    `Size: ${(result.byteLength / 1024).toFixed(1)} KB encrypted`,
  ];
  if (result.requiresVerify && recipientEmails?.length) {
    const list = recipientEmails.join(", ");
    lines.push(
      ``,
      `This share is pinned to: ${list}`,
      `Each recipient will be prompted to enter their email at the viewer.`,
    );
  } else {
    lines.push(
      ``,
      `The decryption key is in the URL fragment (after #). It was`,
      `generated locally and never sent to the server. Anyone with`,
      `the full URL can decrypt and view the content.`,
    );
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
