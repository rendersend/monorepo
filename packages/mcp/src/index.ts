#!/usr/bin/env node
/**
 * Rendersend local MCP server.
 *
 * Runs on the user's machine, exposes a `share_html` tool. Designed to
 * preserve the zero-access invariant: encryption happens here, in the
 * user's process; only ciphertext leaves.
 *
 * Prototype: link-share mode only. MVP will add private-share with
 * per-recipient X25519 wrapping.
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
            description: "The HTML content to share. Up to 10MB.",
          },
          title: {
            type: "string",
            description: "Optional human-readable title (not encrypted; for owner dashboard only).",
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
  const args = request.params.arguments as { html?: string };
  if (!args?.html) {
    throw new Error("missing required argument: html");
  }

  const result = await shareHtml(args.html, {
    apiBase: API_BASE,
    viewerBase: VIEWER_BASE,
  });

  const expiresIso = new Date(result.expiresAt).toISOString();
  return {
    content: [
      {
        type: "text",
        text: [
          `Shared. Link: ${result.url}`,
          `Expires: ${expiresIso}`,
          `Size: ${(result.byteLength / 1024).toFixed(1)} KB encrypted`,
          ``,
          `The decryption key is in the URL fragment (after #). It was`,
          `generated locally and never sent to the server. Anyone with the`,
          `full URL can decrypt and view the content; treat it accordingly.`,
        ].join("\n"),
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
