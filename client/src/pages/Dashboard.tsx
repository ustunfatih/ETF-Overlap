import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Palette } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import ETFSelector from "@/components/ETFSelector";
import HeatmapView from "@/components/HeatmapView";
import TreemapView from "@/components/TreemapView";
import NetworkView from "@/components/NetworkView";
import UpSetView from "@/components/UpSetView";
import DrilldownModal from "@/components/DrilldownModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OverlapMatrix, TreemapNode, NetworkNode, NetworkEdge, OverlapCell } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

type OverlapResponse = {
  success: boolean;
  matrix: OverlapMatrix;
  treemap: TreemapNode[];
  network: { nodes: NetworkNode[]; edges: NetworkEdge[] };
  upset: { sets: string[]; intersections: { set: string[]; size: number; holdings: string[] }[] };
  errors?: string[];
};

type ActiveView = "heatmap" | "treemap" | "network" | "upset";
type ThemeId = "default" | "morning-ledger" | "exchange-floor" | "research-atlas" | "spectrum-dark";

const THEME_STORAGE_KEY = "etf-overlap-theme";
const THEME_CLASSES: ThemeId[] = ["default", "morning-ledger", "exchange-floor", "research-atlas", "spectrum-dark"];
const THEMES: { id: ThemeId; label: string; description: string }[] = [
  { id: "default", label: "Classic Dark", description: "Original slate dashboard" },
  { id: "morning-ledger", label: "Morning Ledger", description: "Light analytical workspace" },
  { id: "exchange-floor", label: "Exchange Floor", description: "High-contrast terminal dark" },
  { id: "research-atlas", label: "Research Atlas", description: "Minimal analyst light mode" },
  { id: "spectrum-dark", label: "Spectrum Dark", description: "Warm branded dark mode" },
];

function getInitialTheme(): ThemeId {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.some((theme) => theme.id === stored) ? (stored as ThemeId) : "default";
}

export default function Dashboard() {
  const [selectedEtfs, setSelectedEtfs] = useState<string[]>(["QQQI", "SPYI", "SCHD", "SCHG", "FDVV"]);
  const [activeView, setActiveView] = useState<ActiveView>("heatmap");
  const [overlapData, setOverlapData] = useState<OverlapResponse | null>(null);
  const [drilldown, setDrilldown] = useState<OverlapCell | null>(null);
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme);
  const { toast } = useToast();
  const activeTheme = useMemo(() => THEMES.find((item) => item.id === theme) ?? THEMES[0], [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...THEME_CLASSES.map((item) => `theme-${item}`), "light");
    if (theme !== "default") {
      root.classList.add(`theme-${theme}`);
    }
    root.style.colorScheme = theme === "morning-ledger" || theme === "research-atlas" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const overlapMutation = useMutation({
    mutationFn: async (tickers: string[]) => {
      const res = await apiRequest("POST", "/api/etf/overlap", { tickers });
      return res.json() as Promise<OverlapResponse>;
    },
    onSuccess: (data) => {
      setOverlapData(data);
      if (data.errors && data.errors.length > 0) {
        toast({
          title: "Some ETFs could not be fetched",
          description: data.errors.join(", "),
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Error fetching overlap data",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = useCallback(() => {
    if (selectedEtfs.length < 2) {
      toast({ title: "Add at least 2 ETFs", description: "Select 2–10 ETFs to compare.", variant: "destructive" });
      return;
    }
    overlapMutation.mutate(selectedEtfs);
  }, [selectedEtfs, overlapMutation, toast]);

  const VIEWS: { id: ActiveView; label: string; desc: string }[] = [
    { id: "heatmap", label: "Overlap Matrix", desc: "Grid view of pairwise overlap" },
    { id: "treemap", label: "Holdings Treemap", desc: "Size by weight, color by overlap" },
    { id: "network", label: "Network Graph", desc: "ETF clusters by similarity" },
    { id: "upset", label: "UpSet Diagram", desc: "Multi-ETF intersection breakdown" },
  ];

  const isLoading = overlapMutation.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="ETF Overlap Analyzer logo">
              <rect x="2" y="2" width="11" height="11" rx="2" fill="hsl(210 80% 56%)" opacity="0.9"/>
              <rect x="15" y="2" width="11" height="11" rx="2" fill="hsl(160 60% 45%)" opacity="0.9"/>
              <rect x="2" y="15" width="11" height="11" rx="2" fill="hsl(280 65% 60%)" opacity="0.9"/>
              <rect x="15" y="15" width="11" height="11" rx="2" fill="hsl(45 90% 55%)" opacity="0.9"/>
              <rect x="9" y="9" width="10" height="10" rx="2" fill="white" opacity="0.12"/>
            </svg>
            <div>
              <h1 className="text-sm font-bold tracking-tight" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
                ETF Overlap Analyzer
              </h1>
              <p className="text-xs text-muted-foreground leading-none">US ETF Holdings Comparison</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-border bg-background/40 px-2.5 text-xs text-foreground hover:bg-secondary"
                  aria-label={`Select visual theme. Current theme: ${activeTheme.label}`}
                >
                  <Palette className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{activeTheme.label}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Visual theme</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {THEMES.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={() => setTheme(item.id)}
                    className="items-start gap-3"
                  >
                    <span className="mt-1 flex h-3.5 w-3.5 items-center justify-center">
                      {theme === item.id && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="grid gap-0.5">
                      <span className="text-xs font-semibold">{item.label}</span>
                      <span className="text-[11px] leading-snug text-muted-foreground">{item.description}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              Live data
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-6 py-6 flex flex-col gap-5">
        {/* ETF Selector Panel */}
        <ETFSelector
          selected={selectedEtfs}
          onChange={setSelectedEtfs}
          onAnalyze={handleAnalyze}
          isLoading={isLoading}
        />

        {/* View Tabs — only shown when data is ready */}
        {overlapData && (
          <>
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 w-fit">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  data-testid={`tab-${v.id}`}
                  onClick={() => setActiveView(v.id)}
                  className={`px-4 py-2 rounded-md text-xs font-medium transition-all duration-150 ${
                    activeView === v.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* View Description */}
            <p className="text-xs text-muted-foreground -mt-3">
              {VIEWS.find((v) => v.id === activeView)?.desc}
              {activeView === "heatmap" && " · Click any cell to see shared holdings detail"}
              {activeView === "treemap" && " · Shared holdings are highlighted · Size = average weight across selected ETFs"}
              {activeView === "network" && " · Edge thickness = overlap score · Drag nodes to rearrange"}
            </p>

            {/* Visualization area */}
            <div className="flex-1 min-h-[520px]">
              {activeView === "heatmap" && (
                <HeatmapView
                  matrix={overlapData.matrix}
                  onCellClick={(cell) => setDrilldown(cell)}
                />
              )}
              {activeView === "treemap" && (
                <TreemapView
                  nodes={overlapData.treemap}
                  etfs={overlapData.matrix.etfs}
                />
              )}
              {activeView === "network" && (
                <NetworkView
                  nodes={overlapData.network.nodes}
                  edges={overlapData.network.edges}
                />
              )}
              {activeView === "upset" && (
                <UpSetView
                  data={overlapData.upset}
                />
              )}
            </div>
          </>
        )}

        {/* Empty state */}
        {!overlapData && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
                <rect x="2" y="2" width="11" height="11" rx="2" fill="hsl(210 80% 56%)" opacity="0.4"/>
                <rect x="15" y="2" width="11" height="11" rx="2" fill="hsl(160 60% 45%)" opacity="0.4"/>
                <rect x="2" y="15" width="11" height="11" rx="2" fill="hsl(280 65% 60%)" opacity="0.4"/>
                <rect x="15" y="15" width="11" height="11" rx="2" fill="hsl(45 90% 55%)" opacity="0.4"/>
                <rect x="9" y="9" width="10" height="10" rx="2" fill="white" opacity="0.08"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Add ETFs and click Analyze</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select 2–10 US ETFs above, then hit Analyze to see their holdings overlap
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 text-left max-w-sm">
              {[
                { icon: "⬜", label: "Overlap Matrix", desc: "Color-coded heatmap of pairwise overlap scores" },
                { icon: "🌳", label: "Holdings Treemap", desc: "Visual size map of all shared & unique holdings" },
                { icon: "🕸", label: "Network Graph", desc: "Force-directed graph showing ETF similarity clusters" },
                { icon: "📊", label: "UpSet Diagram", desc: "Precise multi-set intersection breakdown" },
              ].map((item) => (
                <div key={item.label} className="bg-card border border-border rounded-lg p-3">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">Fetching holdings & computing overlap…</p>
          </div>
        )}
      </main>

      <footer className="border-t border-border py-3 px-6">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Holdings data from ETF.com · Updated hourly · Top 20–50 holdings per ETF</p>
          <a
            href="https://www.perplexity.ai/computer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Created with Perplexity Computer
          </a>
        </div>
      </footer>

      {/* Drilldown modal */}
      {drilldown && (
        <DrilldownModal cell={drilldown} onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}
