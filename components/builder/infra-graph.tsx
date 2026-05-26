"use client";

import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { getComponentDefinitions } from "@/lib/registry/catalog";
import type { ComponentType, InfraComponent, ProjectState } from "@/lib/types";

interface InfraGraphProps {
  project: ProjectState;
  selectedId?: string;
  onSelectComponent?: (id: string) => void;
  maximized?: boolean;
}

export function InfraGraph({ project, selectedId, onSelectComponent, maximized = false }: InfraGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const enabled = project.components.filter((component) => component.enabled);
    const definitions = getComponentDefinitions(project.provider);
    const enabledByType = enabled.reduce((byType, component) => {
      const components = byType.get(component.type) ?? [];
      components.push(component);
      byType.set(component.type, components);
      return byType;
    }, new Map<ComponentType, InfraComponent[]>());

    function dependenciesFor(component: InfraComponent): InfraComponent[] {
      const definition = definitions.find((item) => item.type === component.type);
      const dependencyTypes = definition?.dependsOn ?? [];

      return dependencyTypes.flatMap((dependencyType) => enabledByType.get(dependencyType) ?? []).filter((dependency) => dependency.id !== component.id);
    }

    const depthCache = new Map<string, number>();
    function dependencyDepth(component: InfraComponent, visiting = new Set<string>()): number {
      const cached = depthCache.get(component.id);
      if (cached !== undefined) {
        return cached;
      }

      if (visiting.has(component.id)) {
        return 0;
      }

      const nextVisiting = new Set(visiting).add(component.id);
      const dependencies = dependenciesFor(component);
      const depth = dependencies.length === 0 ? 0 : 1 + Math.max(...dependencies.map((dependency) => dependencyDepth(dependency, nextVisiting)));
      depthCache.set(component.id, depth);
      return depth;
    }

    const layers = enabled.reduce((grouped, component) => {
      const depth = dependencyDepth(component);
      const layer = grouped.get(depth) ?? [];
      layer.push(component);
      grouped.set(depth, layer);
      return grouped;
    }, new Map<number, InfraComponent[]>());

    const calculatedNodes: Node[] = [
      {
        id: "boundary",
        position: { x: 0, y: 0 },
        data: { label: `${project.provider.toUpperCase()} ${project.environment}` },
        type: "input",
        style: { background: "#0f172a", color: "#e2e8f0", border: "1px solid #2dd4bf", width: 180 }
      }
    ];

    const calculatedEdges: Edge[] = [];
    enabled.forEach((component) => {
      const definition = definitions.find((item) => item.type === component.type);
      const componentName = component.type === "rds" && component.name === "rds" ? "postgres" : component.name;
      const depth = dependencyDepth(component);
      const layerIndex = layers.get(depth)?.findIndex((item) => item.id === component.id) ?? 0;
      const x = 240 + depth * 230;
      const y = 20 + layerIndex * 118;
      const isSelected = component.id === selectedId;
      calculatedNodes.push({
        id: component.id,
        position: { x, y },
        data: { label: `${definition?.label ?? component.type}\n${componentName}` },
        selected: isSelected,
        style: {
          background: isSelected ? "#134e4a" : "#172033",
          color: "#f8fafc",
          border: isSelected ? "2px solid #2dd4bf" : "1px solid rgba(148,163,184,.5)",
          boxShadow: isSelected ? "0 0 28px rgba(45,212,191,.28)" : "none",
          cursor: "pointer",
          width: 170
        }
      });

      const dependencies = dependenciesFor(component);
      if (dependencies.length === 0) {
        calculatedEdges.push({
          id: `edge-boundary-${component.id}`,
          source: "boundary",
          target: component.id,
          animated: component.id === selectedId,
          style: {
            stroke: component.id === selectedId ? "#2dd4bf" : "rgba(148,163,184,.55)",
            strokeWidth: component.id === selectedId ? 2 : 1
          }
        });
        return;
      }

      dependencies.forEach((dependency) => {
        const isConnectedToSelection = component.id === selectedId || dependency.id === selectedId;
        calculatedEdges.push({
          id: `edge-${dependency.id}-${component.id}`,
          source: dependency.id,
          target: component.id,
          animated: isConnectedToSelection,
          style: {
            stroke: isConnectedToSelection ? "#2dd4bf" : "rgba(34,211,238,.5)",
            strokeWidth: isConnectedToSelection ? 2 : 1.3
          }
        });
      });
    });

    return { nodes: calculatedNodes, edges: calculatedEdges };
  }, [project, selectedId]);

  return (
    <div className={`${maximized ? "h-full" : "h-[clamp(190px,24vh,260px)]"} overflow-hidden rounded-md border border-slate-700/70 bg-slate-950`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => {
          if (node.id !== "boundary") {
            onSelectComponent?.(node.id);
          }
        }}
      >
        <Background color="#334155" gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
