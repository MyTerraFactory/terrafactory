"use client";

import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { ProjectState } from "@/lib/types";

interface InfraGraphProps {
  project: ProjectState;
  selectedId?: string;
  onSelectComponent?: (id: string) => void;
}

export function InfraGraph({ project, selectedId, onSelectComponent }: InfraGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const enabled = project.components.filter((component) => component.enabled);
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
    enabled.forEach((component, index) => {
      const x = 240 + (index % 2) * 220;
      const y = 20 + Math.floor(index / 2) * 110;
      const isSelected = component.id === selectedId;
      calculatedNodes.push({
        id: component.id,
        position: { x, y },
        data: { label: `${component.type.toUpperCase()}\n${component.name}` },
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
      calculatedEdges.push({ id: `edge-${component.id}`, source: "boundary", target: component.id, animated: component.type !== "vpc" });
    });

    return { nodes: calculatedNodes, edges: calculatedEdges };
  }, [project, selectedId]);

  return (
    <div className="h-[260px] overflow-hidden rounded-md border border-slate-700/70 bg-slate-950">
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
