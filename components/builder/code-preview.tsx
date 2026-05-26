"use client";

import dynamic from "next/dynamic";
import { Copy, Download } from "lucide-react";
import JSZip from "jszip";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GeneratedFile } from "@/lib/types";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface CodePreviewProps {
  files: GeneratedFile[];
}

export function CodePreview({ files }: CodePreviewProps) {
  const [activePath, setActivePath] = useState(files[0]?.path ?? "");
  const activeFile = useMemo(() => files.find((file) => file.path === activePath) ?? files[0], [activePath, files]);

  async function copyActiveFile() {
    if (activeFile) {
      await navigator.clipboard.writeText(activeFile.content);
    }
  }

  async function downloadZip() {
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.path.replace("terraform-project/", ""), file.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "terraform-project.zip";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border-l border-slate-700/70 bg-[#091322]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700/70 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-teal-300">Live Terraform</p>
          <h2 className="text-base font-semibold text-slate-50">Generated project files</h2>
        </div>
        <div className="flex gap-2">
          <Button onClick={copyActiveFile} title="Copy active file">
            <Copy size={16} /> Copy
          </Button>
          <Button onClick={downloadZip} title="Download ZIP">
            <Download size={16} /> ZIP
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-700/70 px-3 py-2">
        {files.map((file) => (
          <button
            key={file.path}
            className={`h-8 shrink-0 rounded-md px-3 text-xs ${activeFile?.path === file.path ? "bg-teal-400 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            onClick={() => setActivePath(file.path)}
          >
            {file.path.replace("terraform-project/", "")}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        <Monaco
          height="100%"
          language={activeFile?.language === "markdown" ? "markdown" : "hcl"}
          theme="vs-dark"
          value={activeFile?.content ?? ""}
          options={{
            automaticLayout: true,
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            scrollbar: { alwaysConsumeMouseWheel: false }
          }}
        />
      </div>
    </section>
  );
}
