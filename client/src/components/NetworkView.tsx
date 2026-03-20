import { useEffect, useRef, useState } from "react";
import type { NetworkNode, NetworkEdge } from "@shared/schema";

type Props = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
};

type SimNode = NetworkNode & { x: number; y: number; vx: number; vy: number; dragging: boolean };

const ETF_COLORS = [
  "hsl(210 80% 56%)", "hsl(160 60% 45%)", "hsl(45 90% 55%)", "hsl(280 65% 60%)",
  "hsl(15 80% 55%)", "hsl(190 70% 50%)", "hsl(320 60% 55%)", "hsl(100 55% 48%)",
  "hsl(35 85% 55%)", "hsl(250 65% 62%)",
];

export default function NetworkView({ nodes, edges }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const frameRef = useRef<number>(0);
  const [tick, setTick] = useState(0);
  const [dims, setDims] = useState({ w: 700, h: 460 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const dragRef = useRef<{ nodeId: string; ox: number; oy: number } | null>(null);

  // Resize observer
  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: Math.max(380, height) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Initialize simulation
  useEffect(() => {
    const cx = dims.w / 2, cy = dims.h / 2;
    simRef.current = nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const r = Math.min(dims.w, dims.h) * 0.28;
      return {
        ...n,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        vx: 0, vy: 0,
        dragging: false,
      };
    });

    let running = true;
    const maxEdgeWeight = Math.max(...edges.map((e) => e.weight), 1);

    function step() {
      if (!running) return;
      const sim = simRef.current;
      const cx = dims.w / 2, cy = dims.h / 2;

      // Apply forces
      for (let i = 0; i < sim.length; i++) {
        const a = sim[i];
        if (a.dragging) { a.vx = 0; a.vy = 0; continue; }

        // Repulsion from all others
        for (let j = 0; j < sim.length; j++) {
          if (i === j) continue;
          const b = sim[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          const force = 3200 / (dist * dist);
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
        }

        // Attraction along edges
        for (const edge of edges) {
          if (edge.source !== a.id && edge.target !== a.id) continue;
          const otherId = edge.source === a.id ? edge.target : edge.source;
          const b = sim.find((n) => n.id === otherId);
          if (!b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          const strength = (edge.weight / maxEdgeWeight) * 0.04;
          const idealDist = 120 + (1 - edge.weight / maxEdgeWeight) * 100;
          const force = (dist - idealDist) * strength;
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
        }

        // Center gravity
        const dcx = cx - a.x, dcy = cy - a.y;
        a.vx += dcx * 0.008;
        a.vy += dcy * 0.008;

        // Damping
        a.vx *= 0.85;
        a.vy *= 0.85;

        // Boundary
        a.x = Math.max(48, Math.min(dims.w - 48, a.x + a.vx));
        a.y = Math.max(48, Math.min(dims.h - 48, a.y + a.vy));
      }
      setTick((t) => t + 1);
      frameRef.current = requestAnimationFrame(step);
    }
    frameRef.current = requestAnimationFrame(step);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [nodes.length, dims.w, dims.h, edges]);

  const nodeMap = new Map(simRef.current.map((n) => [n.id, n]));

  const handleMouseDown = (nodeId: string, e: React.MouseEvent<SVGCircleElement>) => {
    e.preventDefault();
    const node = simRef.current.find((n) => n.id === nodeId);
    if (node) node.dragging = true;
    dragRef.current = { nodeId, ox: e.clientX, oy: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const node = simRef.current.find((n) => n.id === dragRef.current!.nodeId);
    if (node) {
      node.x = e.clientX - svgRect.left;
      node.y = e.clientY - svgRect.top;
    }
  };

  const handleMouseUp = () => {
    if (dragRef.current) {
      const node = simRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (node) node.dragging = false;
      dragRef.current = null;
    }
  };

  const maxEdgeWeight = Math.max(...edges.map((e) => e.weight), 1);

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-sm font-bold" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
            ETF Similarity Network
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edge thickness & opacity = weighted overlap · Drag nodes to rearrange · Hover for details
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-10 h-0.5 bg-muted-foreground rounded opacity-30" />
          <span>Low overlap</span>
          <div className="w-10 h-1 bg-primary rounded" />
          <span>High overlap</span>
        </div>
      </div>

      <div ref={containerRef} className="w-full relative" style={{ height: 460 }}>
        <svg
          ref={svgRef}
          width={dims.w}
          height={dims.h}
          className="w-full rounded-lg bg-background/40"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Edges */}
          {edges.map((edge) => {
            const a = nodeMap.get(edge.source);
            const b = nodeMap.get(edge.target);
            if (!a || !b) return null;
            const edgeId = `${edge.source}-${edge.target}`;
            const isHovered = hoveredEdge === edgeId || hoveredNode === edge.source || hoveredNode === edge.target;
            const opacity = isHovered ? 0.9 : 0.3 + (edge.weight / maxEdgeWeight) * 0.4;
            const strokeW = 1 + (edge.weight / maxEdgeWeight) * 8;

            return (
              <g key={edgeId}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="hsl(210 60% 55%)"
                  strokeWidth={strokeW}
                  strokeOpacity={opacity}
                  strokeLinecap="round"
                  className="transition-all duration-150"
                  onMouseEnter={() => setHoveredEdge(edgeId)}
                  onMouseLeave={() => setHoveredEdge(null)}
                />
                {isHovered && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 6}
                    textAnchor="middle"
                    fill="hsl(210 80% 75%)"
                    fontSize={10}
                    fontFamily="'Satoshi', sans-serif"
                    style={{ pointerEvents: "none" }}
                  >
                    {edge.weight.toFixed(1)}% · {edge.sharedCount} stocks
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {simRef.current.map((node, i) => {
            const isHov = hoveredNode === node.id;
            const connectedEdges = edges.filter((e) => e.source === node.id || e.target === node.id);
            const maxConn = connectedEdges.reduce((s, e) => s + e.weight, 0) / Math.max(1, connectedEdges.length);
            const r = 22 + (maxConn / maxEdgeWeight) * 14;

            return (
              <g key={node.id}>
                <circle
                  cx={node.x} cy={node.y} r={r + (isHov ? 4 : 0)}
                  fill={ETF_COLORS[i % ETF_COLORS.length]}
                  fillOpacity={isHov ? 0.95 : 0.7}
                  stroke={ETF_COLORS[i % ETF_COLORS.length]}
                  strokeWidth={isHov ? 2.5 : 1.5}
                  strokeOpacity={0.9}
                  className="cursor-grab active:cursor-grabbing transition-all duration-150"
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onMouseDown={(e) => handleMouseDown(node.id, e)}
                  data-testid={`network-node-${node.id}`}
                />
                <text
                  x={node.x} y={node.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fillOpacity={0.95}
                  fontSize={isHov ? 11 : 10}
                  fontWeight="700"
                  fontFamily="'Cabinet Grotesk', sans-serif"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip for nodes */}
        {hoveredNode && (() => {
          const node = nodeMap.get(hoveredNode);
          if (!node) return null;
          const connections = edges.filter((e) => e.source === hoveredNode || e.target === hoveredNode);
          return (
            <div
              className="absolute z-50 bg-popover border border-border rounded-lg p-3 shadow-xl text-xs pointer-events-none min-w-[160px]"
              style={{ left: node.x + 30, top: node.y - 10 }}
            >
              <p className="font-bold text-foreground text-sm">{hoveredNode}</p>
              <p className="text-muted-foreground mt-0.5">{connections.length} connections</p>
              {connections.slice(0, 4).map((e) => {
                const other = e.source === hoveredNode ? e.target : e.source;
                return (
                  <div key={other} className="flex justify-between gap-3 mt-1">
                    <span className="text-muted-foreground">{other}</span>
                    <span className="font-semibold text-primary">{e.weight.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
