"use client";

import {
  Bot,
  ChevronDown,
  CheckCircle2,
  GitBranch,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Save,
  Sparkles,
  Sun,
  Trash2
} from "lucide-react";
import Image from "next/image";
import { type CSSProperties, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CodePreview } from "@/components/builder/code-preview";
import { InfraGraph } from "@/components/builder/infra-graph";
import { getComponentDefinitions, getModuleMapping } from "@/lib/registry/catalog";
import { defaultProject } from "@/lib/registry/aws-components";
import { defaultAzureProject } from "@/lib/registry/azure-components";
import { defaultGcpProject } from "@/lib/registry/gcp-components";
import { generateTerraformProject } from "@/lib/terraform/hcl";
import { validateProject } from "@/lib/validation/project";
import type { CloudProvider, ComponentDefinition, ComponentField, ComponentType, InfraComponent, ProjectState } from "@/lib/types";

const providers: { id: CloudProvider; label: string; status: string }[] = [
  { id: "aws", label: "AWS", status: "MVP ready" },
  { id: "azure", label: "Azure", status: "MVP ready" },
  { id: "gcp", label: "GCP", status: "Preview" }
];

interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  project: ProjectState;
}

function defaultForProvider(provider: CloudProvider): ProjectState {
  if (provider === "azure") {
    return defaultAzureProject;
  }
  if (provider === "gcp") {
    return defaultGcpProject;
  }
  return defaultProject;
}

function createComponent(definition: ComponentDefinition): InfraComponent {
  const config: InfraComponent["config"] = {};

  for (const field of definition.fields) {
    if (field.type === "boolean") {
      config[field.key] = false;
    } else if (field.type === "number") {
      config[field.key] = field.min ?? 1;
    } else if (field.type === "cidr-list") {
      config[field.key] = ["10.0.0.0/16"];
    } else {
      config[field.key] = field.options?.[0]?.value ?? "";
    }
  }

  return {
    id: `cmp_${definition.type}_${crypto.randomUUID().slice(0, 8)}`,
    type: definition.type,
    name: definition.type === "rds" ? "postgres" : definition.type,
    enabled: true,
    config
  };
}

function FieldControl({
  field,
  value,
  onChange
}: {
  field: ComponentField;
  value: string | number | boolean | string[] | undefined;
  onChange: (value: string | number | boolean | string[]) => void;
}) {
  const baseClass = "h-9 w-full rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-teal-300";

  if (field.type === "boolean") {
    return (
      <label className="flex h-9 items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        Enabled
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <select className={baseClass} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <input
        className={baseClass}
        type="number"
        min={field.min}
        max={field.max}
        value={Number(value ?? field.min ?? 0)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    );
  }

  if (field.type === "cidr-list") {
    return (
      <input
        className={baseClass}
        value={Array.isArray(value) ? value.join(", ") : ""}
        onChange={(event) => onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))}
        placeholder="10.0.0.0/16, 10.1.0.0/16"
      />
    );
  }

  return (
    <input
      className={baseClass}
      value={String(value ?? "")}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
    />
  );
}

export function BuilderShell() {
  const [project, setProject] = useState<ProjectState>(defaultProject);
  const [selectedId, setSelectedId] = useState(defaultProject.components[0]?.id ?? "");
  const [assistantText, setAssistantText] = useState("Ask for a production AWS stack or select blocks to get hardening guidance.");
  const [saveStatus, setSaveStatus] = useState("Autosaved");
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(420);
  const [rightPanelWidth, setRightPanelWidth] = useState(560);
  const [isOptionalConfigOpen, setIsOptionalConfigOpen] = useState(false);
  const [maximizedPanel, setMaximizedPanel] = useState<"canvas" | "preview" | null>(null);
  const builderPanelRef = useRef<HTMLElement | null>(null);
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const definitions = getComponentDefinitions(project.provider);
  const selectedComponent = project.components.find((component) => component.id === selectedId) ?? project.components[0];
  const selectedDefinition = selectedComponent ? definitions.find((definition) => definition.type === selectedComponent.type) : undefined;
  const files = useMemo(() => generateTerraformProject(project), [project]);
  const issues = useMemo(() => validateProject(project), [project]);
  const totalResources = useMemo(
    () =>
      project.components
        .filter((component) => component.enabled)
        .reduce((sum, component) => sum + (definitions.find((definition) => definition.type === component.type)?.estimatedResources ?? 0), 0),
    [definitions, project.components]
  );

  useEffect(() => {
    const saved = localStorage.getItem("terrafactory.project");
    if (saved) {
      setProject(JSON.parse(saved) as ProjectState);
    }

    const savedVersions = localStorage.getItem("terrafactory.versions");
    if (savedVersions) {
      setVersions(JSON.parse(savedVersions) as VersionSnapshot[]);
    }

    const savedTheme = localStorage.getItem("terrafactory.theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }

    setIsLeftPanelOpen(localStorage.getItem("terrafactory.leftPanel") !== "closed");
    setIsRightPanelOpen(localStorage.getItem("terrafactory.rightPanel") !== "closed");

    const savedLeftWidth = Number(localStorage.getItem("terrafactory.leftPanelWidth"));
    const savedRightWidth = Number(localStorage.getItem("terrafactory.rightPanelWidth"));
    if (Number.isFinite(savedLeftWidth) && savedLeftWidth >= 300) {
      setLeftPanelWidth(savedLeftWidth);
    }
    if (Number.isFinite(savedRightWidth) && savedRightWidth >= 380) {
      setRightPanelWidth(savedRightWidth);
    }
  }, []);

  useEffect(() => {
    setSaveStatus("Saving...");
    const timer = window.setTimeout(() => {
      localStorage.setItem("terrafactory.project", JSON.stringify(project));
      setSaveStatus("Autosaved");
    }, 400);

    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    localStorage.setItem("terrafactory.versions", JSON.stringify(versions));
  }, [versions]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("terrafactory.theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("terrafactory.leftPanel", isLeftPanelOpen ? "open" : "closed");
  }, [isLeftPanelOpen]);

  useEffect(() => {
    localStorage.setItem("terrafactory.rightPanel", isRightPanelOpen ? "open" : "closed");
  }, [isRightPanelOpen]);

  useEffect(() => {
    localStorage.setItem("terrafactory.leftPanelWidth", String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    localStorage.setItem("terrafactory.rightPanelWidth", String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMaximizedPanel(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function updateProject(patch: Partial<ProjectState>) {
    setProject((current) => ({ ...current, ...patch }));
  }

  function switchProvider(provider: CloudProvider) {
    const nextProject = defaultForProvider(provider);
    setProject(nextProject);
    setSelectedId(nextProject.components[0]?.id ?? "");
    setIsOptionalConfigOpen(false);
  }

  function addComponent(type: ComponentType) {
    const definition = definitions.find((item) => item.type === type);
    if (!definition) {
      return;
    }
    const next = createComponent(definition);
    setProject((current) => ({ ...current, components: [...current.components, next] }));
    setSelectedId(next.id);
    setIsOptionalConfigOpen(false);
  }

  function updateComponent(id: string, patch: Partial<InfraComponent>) {
    setProject((current) => ({
      ...current,
      components: current.components.map((component) => (component.id === id ? { ...component, ...patch } : component))
    }));
  }

  function updateComponentConfig(id: string, key: string, value: string | number | boolean | string[]) {
    setProject((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === id ? { ...component, config: { ...component.config, [key]: value } } : component
      )
    }));
  }

  function removeComponent(id: string) {
    setProject((current) => {
      const nextComponents = current.components.filter((component) => component.id !== id);
      if (selectedId === id) {
        setSelectedId(nextComponents[0]?.id ?? "");
      }
      return { ...current, components: nextComponents };
    });
  }

  function saveNow() {
    localStorage.setItem("terrafactory.project", JSON.stringify(project));
    setSaveStatus("Saved now");
    window.setTimeout(() => setSaveStatus("Autosaved"), 1400);
  }

  function createVersion() {
    const nextVersion: VersionSnapshot = {
      id: crypto.randomUUID(),
      label: `v${versions.length + 1}`,
      createdAt: new Date().toISOString(),
      project
    };
    setVersions((current) => [nextVersion, ...current]);
    setSaveStatus(`${nextVersion.label} saved`);
    setIsVersionPanelOpen(true);
  }

  function restoreVersion(version: VersionSnapshot) {
    setProject(version.project);
    setSelectedId(version.project.components[0]?.id ?? "");
    setSaveStatus(`${version.label} restored`);
    setIsVersionPanelOpen(false);
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function showBuilderPanel() {
    if (window.innerWidth >= 1280) {
      setIsLeftPanelOpen((current) => !current);
      return;
    }

    if (!isLeftPanelOpen) {
      setIsLeftPanelOpen(true);
    }

    window.setTimeout(() => {
      builderPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  function showPreviewPanel() {
    if (window.innerWidth >= 1280) {
      setIsRightPanelOpen((current) => !current);
      return;
    }

    if (!isRightPanelOpen) {
      setIsRightPanelOpen(true);
    }

    window.setTimeout(() => {
      previewPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  async function askAssistant() {
    const response = await fetch("/api/assistant", { method: "POST", body: JSON.stringify(project) });
    const data = (await response.json()) as { summary: string };
    setAssistantText(data.summary);
  }

  function startPanelResize(panel: "left" | "right", event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel === "left" ? leftPanelWidth : rightPanelWidth;

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      const nextWidth = panel === "left" ? startWidth + delta : startWidth - delta;
      const maxWidth = Math.max(360, Math.floor(window.innerWidth * 0.55));
      const clamped = Math.min(Math.max(nextWidth, panel === "left" ? 300 : 380), maxWidth);

      if (panel === "left") {
        setLeftPanelWidth(clamped);
      } else {
        setRightPanelWidth(clamped);
      }
    }

    function onMouseUp() {
      document.body.classList.remove("tf-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    document.body.classList.add("tf-resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const workspaceStyle = {
    "--left-panel-width": `${leftPanelWidth}px`,
    "--right-panel-width": `${rightPanelWidth}px`
  } as CSSProperties;
  const requiredFields = selectedDefinition?.fields.filter((field) => field.required) ?? [];
  const optionalFields = selectedDefinition?.fields.filter((field) => !field.required) ?? [];

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="z-50 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-cyan-400/20 bg-slate-950/90 px-4 py-3 shadow-[0_10px_34px_rgba(2,6,23,0.28),0_1px_0_rgba(45,212,191,0.12)] backdrop-blur-xl">
        <div className="flex min-w-0 items-center">
          <Image
            alt="TerraFactory"
            className="h-12 w-auto max-w-[min(62vw,310px)] object-contain"
            height={128}
            priority
            src={theme === "dark" ? "/logos/darkthemelogo.jpg" : "/logos/lightthemelogo.jpg"}
            width={320}
          />
          <span className="sr-only">Terraform Infrastructure Composer</span>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <Button className={isLeftPanelOpen ? "border-teal-300/60 bg-teal-400/15 text-teal-100" : ""} onClick={showBuilderPanel} title="Show builder panel">
            {isLeftPanelOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />} Builder
          </Button>
          <Button className={isRightPanelOpen ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100" : ""} onClick={showPreviewPanel} title="Show generated project files">
            {isRightPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />} Preview
          </Button>
          <Button onClick={saveNow} title="Save project now">
            <Save size={16} /> {saveStatus}
          </Button>
          <Button onClick={() => setIsVersionPanelOpen((current) => !current)} title="Open version history">
            <GitBranch size={16} /> v{Math.max(versions.length, 1)}
          </Button>
          <Button onClick={toggleTheme} title="Toggle color theme">
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />} {theme === "dark" ? "Dark" : "Light"}
          </Button>
          {isVersionPanelOpen && (
            <div className="absolute right-0 top-12 z-20 w-[320px] rounded-md border border-slate-700 bg-slate-900 p-3 shadow-soft">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-50">Version history</h2>
                  <p className="text-xs text-slate-400">{versions.length} saved snapshots</p>
                </div>
                <Button onClick={createVersion} title="Create version snapshot">
                  <Plus size={14} /> Snapshot
                </Button>
              </div>
              {versions.length === 0 ? (
                <p className="rounded-md bg-slate-950 p-3 text-sm text-slate-400">No snapshots yet. Create one before a larger edit.</p>
              ) : (
                <div className="max-h-[260px] space-y-2 overflow-y-auto">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      className="w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-left hover:border-teal-300"
                      onClick={() => restoreVersion(version)}
                    >
                      <span className="block text-sm font-semibold text-slate-100">{version.label}</span>
                      <span className="text-xs text-slate-400">
                        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.createdAt))}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div
        className="tf-workspace min-h-0 flex-1 overflow-hidden"
        data-left-open={isLeftPanelOpen}
        data-right-open={isRightPanelOpen}
        style={workspaceStyle}
      >
        {isLeftPanelOpen && (
        <aside ref={builderPanelRef} className="relative min-h-0 scroll-mt-20 overflow-y-auto border-r border-cyan-400/20 bg-slate-900/85 p-4 shadow-[inset_-1px_0_rgba(45,212,191,0.08)]">
          <div className="mb-4 grid grid-cols-3 gap-2">
            {providers.map((provider) => (
              <button
                key={provider.id}
                className={`rounded-md border p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_10px_28px_rgba(34,211,238,0.12)] ${project.provider === provider.id ? "border-teal-300 bg-gradient-to-br from-teal-300 to-cyan-300 text-slate-950 shadow-[0_0_22px_rgba(45,212,191,0.22)]" : "border-slate-700 bg-slate-800 text-slate-200"}`}
                onClick={() => switchProvider(provider.id)}
              >
                <span className="block font-semibold">{provider.label}</span>
                <span className="text-xs opacity-75">{provider.status}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-300">
              Project
              <input className="mt-1 h-9 w-full rounded-md border border-slate-600 bg-slate-950 px-3 text-slate-100" value={project.name} onChange={(event) => updateProject({ name: event.target.value })} />
            </label>
            <label className="text-sm text-slate-300">
              Region
              <input className="mt-1 h-9 w-full rounded-md border border-slate-600 bg-slate-950 px-3 text-slate-100" value={project.region} onChange={(event) => updateProject({ region: event.target.value })} />
            </label>
            <label className="text-sm text-slate-300">
              Environment
              <select className="mt-1 h-9 w-full rounded-md border border-slate-600 bg-slate-950 px-3 text-slate-100" value={project.environment} onChange={(event) => updateProject({ environment: event.target.value as ProjectState["environment"] })}>
                <option value="dev">dev</option>
                <option value="staging">staging</option>
                <option value="prod">prod</option>
              </select>
            </label>
            <label className="text-sm text-slate-300">
              State bucket
              <input className="mt-1 h-9 w-full rounded-md border border-slate-600 bg-slate-950 px-3 text-slate-100" value={project.remoteStateBucket} onChange={(event) => updateProject({ remoteStateBucket: event.target.value })} />
            </label>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Blocks</h2>
              <span className="text-xs text-slate-400">{totalResources} est. resources</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {definitions.map((definition) => (
                <button key={definition.type} className="group rounded-md border border-slate-700 bg-slate-800/90 p-3 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-slate-800 hover:shadow-[0_14px_34px_rgba(45,212,191,0.13)]" onClick={() => addComponent(definition.type)}>
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                    <Plus size={14} className="text-teal-300 transition group-hover:rotate-90" /> {definition.label}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">{definition.estimatedResources} resources</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {project.components.map((component) => {
              const definition = definitions.find((item) => item.type === component.type);
              return (
                <button
                  key={component.id}
                  className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition hover:border-cyan-300 ${selectedId === component.id ? "border-teal-300 bg-gradient-to-r from-teal-400/15 to-cyan-400/10 shadow-[inset_3px_0_0_rgba(45,212,191,0.8)]" : "border-slate-700 bg-slate-900"}`}
                  onClick={() => setSelectedId(component.id)}
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-100">{component.name}</span>
                    <span className="text-xs text-slate-400">{definition?.label}</span>
                  </span>
                  <CheckCircle2 size={16} className={component.enabled ? "text-teal-300" : "text-slate-600"} />
                </button>
              );
            })}
          </div>
          <div
            aria-label="Resize builder panel"
            className="tf-resize-handle tf-resize-handle-left"
            role="separator"
            onDoubleClick={() => setLeftPanelWidth(420)}
            onMouseDown={(event) => startPanelResize("left", event)}
          />
        </aside>
        )}

        <section className="min-h-0 overflow-y-auto bg-slate-950/45 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-teal-300">Visual Builder</p>
              <h2 className="text-xl font-semibold text-slate-50">Production stack canvas</h2>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setMaximizedPanel("canvas")} title="Maximize canvas">
                <Maximize2 size={16} /> Maximize
              </Button>
              {selectedComponent && (
                <Button onClick={() => removeComponent(selectedComponent.id)} title="Remove block">
                  <Trash2 size={16} /> Remove
                </Button>
              )}
            </div>
          </div>

          <InfraGraph project={project} selectedId={selectedComponent?.id} onSelectComponent={setSelectedId} />

          {selectedComponent && selectedDefinition && (
            <div className="mt-4 rounded-md border border-cyan-400/20 bg-slate-900/90 p-4 shadow-[0_18px_70px_rgba(8,145,178,0.08)]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-50">{selectedDefinition.label}</h3>
                  <p className="text-sm text-slate-400">{selectedDefinition.description}</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={selectedComponent.enabled} onChange={(event) => updateComponent(selectedComponent.id, { enabled: event.target.checked })} />
                  Enabled
                </label>
              </div>

              <label className="mb-4 block text-sm text-slate-300">
                Block name
                <input className="mt-1 h-9 w-full rounded-md border border-slate-600 bg-slate-950 px-3 text-slate-100" value={selectedComponent.name} onChange={(event) => updateComponent(selectedComponent.id, { name: event.target.value })} />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                {requiredFields.map((field) => (
                  <label key={field.key} className="block text-sm text-slate-300" title={field.help}>
                    <span className="flex items-center justify-between gap-2">
                      {field.label}
                      {field.required && <span className="text-xs text-teal-300">required</span>}
                    </span>
                    <div className="mt-1">
                      <FieldControl field={field} value={selectedComponent.config[field.key]} onChange={(value) => updateComponentConfig(selectedComponent.id, field.key, value)} />
                    </div>
                    <span className="mt-1 block text-xs text-slate-500">{field.help}</span>
                  </label>
                ))}
              </div>

              {optionalFields.length > 0 && (
                <div className="mt-5 rounded-md border border-slate-700/70 bg-slate-950/60">
                  <button
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-slate-100"
                    onClick={() => setIsOptionalConfigOpen((current) => !current)}
                  >
                    <span>Optional configuration</span>
                    <span className="flex items-center gap-2 text-xs font-normal text-slate-400">
                      {optionalFields.length} settings
                      <ChevronDown size={16} className={`transition ${isOptionalConfigOpen ? "rotate-180 text-teal-300" : ""}`} />
                    </span>
                  </button>
                  {isOptionalConfigOpen && (
                    <div className="grid gap-4 border-t border-slate-700/70 p-3 md:grid-cols-2">
                      {optionalFields.map((field) => (
                        <label key={field.key} className="block text-sm text-slate-300" title={field.help}>
                          <span className="flex items-center justify-between gap-2">{field.label}</span>
                          <div className="mt-1">
                            <FieldControl field={field} value={selectedComponent.config[field.key]} onChange={(value) => updateComponentConfig(selectedComponent.id, field.key, value)} />
                          </div>
                          <span className="mt-1 block text-xs text-slate-500">{field.help}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 rounded-md bg-slate-950 p-3 text-xs text-slate-400">
                Module: {getModuleMapping(selectedComponent.type, project.provider)?.moduleSource ?? "custom template"} · Version: {getModuleMapping(selectedComponent.type, project.provider)?.version ?? "local"}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-md border border-fuchsia-300/20 bg-slate-900/90 p-4 shadow-[0_18px_70px_rgba(192,38,211,0.08)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-50">AI Infrastructure Assistant</h3>
              <Button onClick={askAssistant}>
                <Sparkles size={16} /> Analyze
              </Button>
            </div>
            <div className="flex gap-3">
              <Bot className="mt-1 text-teal-300" size={20} />
              <p className="whitespace-pre-line text-sm leading-6 text-slate-300">{assistantText}</p>
            </div>
          </div>

          {issues.length > 0 && (
            <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-950/30 p-4">
              <h3 className="font-semibold text-amber-200">Validation</h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-100">
                {issues.map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    {issue.severity.toUpperCase()}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {isRightPanelOpen && (
          <div ref={previewPanelRef} className="relative h-full min-h-0 scroll-mt-20 overflow-hidden">
            <div
              aria-label="Resize preview panel"
              className="tf-resize-handle tf-resize-handle-right"
              role="separator"
              onDoubleClick={() => setRightPanelWidth(560)}
              onMouseDown={(event) => startPanelResize("right", event)}
            />
            <CodePreview files={files} onMaximize={() => setMaximizedPanel("preview")} />
          </div>
        )}
      </div>

      {maximizedPanel && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 p-4 backdrop-blur-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-cyan-400/20 bg-slate-900 px-4 py-3 shadow-[0_12px_40px_rgba(2,6,23,0.3)]">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-teal-300">{maximizedPanel === "canvas" ? "Visual Builder" : "Live Terraform"}</p>
              <h2 className="text-lg font-semibold text-slate-50">{maximizedPanel === "canvas" ? "Production stack canvas" : "Generated project files"}</h2>
            </div>
            <Button onClick={() => setMaximizedPanel(null)} title="Exit maximized view">
              <Minimize2 size={16} /> Restore
            </Button>
          </div>
          <div className="min-h-0 flex-1 bg-slate-950 p-4">
            {maximizedPanel === "canvas" ? (
              <InfraGraph project={project} selectedId={selectedComponent?.id} onSelectComponent={setSelectedId} maximized />
            ) : (
              <CodePreview files={files} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
