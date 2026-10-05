"use client";

import { useState } from "react";
import {
  startMultipart,
  uploadFileMultipart,
  type MultipartSession,
} from "@/lib/upload-client";

const DEFAULT_PART_BYTES = 5 * 1024 * 1024;

export default function Home() {
  const [log, setLog] = useState<string[]>([]);
  const [session, setSession] = useState<MultipartSession | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const append = (line: string) => setLog((prev) => [...prev, line]);

  async function handleUpload(simulateCut: boolean) {
    if (!file) {
      append("Pick a file first.");
      return;
    }
    setBusy(true);
    try {
      const partSize = DEFAULT_PART_BYTES;
      const active =
        session ??
        (await startMultipart(file.name, partSize));
      if (!session) {
        setSession(active);
        append(`Created upload: ${active.key}`);
      }

      const result = await uploadFileMultipart(file, file.name, active, {
        simulateCutAfterPart: simulateCut ? 2 : undefined,
        onProgress: (done, total) =>
          append(`Parts uploaded: ${done}/${total}`),
      });
      append(`Complete: s3://${result.key} (${result.parts.length} parts)`);
      setSession(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      append(`Error: ${message}`);
      if (message === "SIMULATED_NETWORK_CUT") {
        append("Resume: fix network, then click Resume after cut (ListParts + skip done).");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>S4 multipart prototype (prep)</h1>
      <p>
        Lab-only helper aligned with S0 (Next.js 15 + AWS SDK v3 → MinIO with{" "}
        <code>forcePathStyle</code>). Spike <strong>not executed</strong> until
        run on the Sandbox LAN host.
      </p>
      <p>
        Part size default: {(DEFAULT_PART_BYTES / (1024 * 1024)).toFixed(0)} MiB
        (TODO: tune in lab).
      </p>
      <input
        type="file"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setSession(null);
          setLog([]);
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" disabled={busy} onClick={() => handleUpload(false)}>
          Upload (multipart)
        </button>
        <button type="button" disabled={busy} onClick={() => handleUpload(true)}>
          Upload then simulate cut (part 2)
        </button>
        <button
          type="button"
          disabled={busy || !session || !file}
          onClick={() => handleUpload(false)}
        >
          Resume after cut
        </button>
      </div>
      {session && (
        <pre style={{ marginTop: 12, fontSize: 12 }}>
          {JSON.stringify(session, null, 2)}
        </pre>
      )}
      <pre
        style={{
          marginTop: 16,
          background: "#f4f4f4",
          padding: 12,
          fontSize: 12,
          whiteSpace: "pre-wrap",
        }}
      >
        {log.join("\n") || "Logs appear here."}
      </pre>
    </main>
  );
}
