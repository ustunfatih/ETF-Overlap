import { useState, useRef } from "react";
import { X, Plus, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const POPULAR_ETFS = [
  "SPY", "QQQ", "VOO", "VTI", "IVV", "VUG", "SCHG", "SCHD",
  "QQQI", "SPYI", "JEPQ", "JEPI", "FDVV", "GLDW", "VYMI", "XLK",
  "AGG", "GLD", "VEA", "VWO",
];

type Props = {
  selected: string[];
  onChange: (etfs: string[]) => void;
  onAnalyze: () => void;
  isLoading: boolean;
};

export default function ETFSelector({ selected, onChange, onAnalyze, isLoading }: Props) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [uploadTicker, setUploadTicker] = useState("");
  const [uploadData, setUploadData] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const addEtf = (ticker: string) => {
    const upper = ticker.trim().toUpperCase();
    if (!upper) return;
    if (selected.includes(upper)) {
      toast({ title: `${upper} already added`, variant: "destructive" });
      return;
    }
    if (selected.length >= 10) {
      toast({ title: "Max 10 ETFs", description: "Remove one before adding another.", variant: "destructive" });
      return;
    }
    onChange([...selected, upper]);
    setInput("");
    setShowSuggestions(false);
  };

  const removeEtf = (ticker: string) => {
    onChange(selected.filter((t) => t !== ticker));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") addEtf(input);
    if (e.key === "Escape") setShowSuggestions(false);
  };

  const filtered = POPULAR_ETFS.filter(
    (t) => t.includes(input.toUpperCase()) && !selected.includes(t)
  ).slice(0, 8);

  const handleUpload = async () => {
    if (!uploadTicker.trim() || !uploadData.trim()) {
      toast({ title: "Enter a ticker and paste holdings data", variant: "destructive" });
      return;
    }
    try {
      const lines = uploadData.trim().split("\n");
      const holdings = lines.map((line) => {
        const parts = line.split(",");
        return {
          ticker: parts[0]?.trim() || "",
          name: parts[1]?.trim() || parts[0]?.trim() || "",
          weight: parseFloat(parts[2]?.trim() || parts[1]?.trim() || "0"),
        };
      }).filter((h) => h.ticker && h.weight > 0);

      if (holdings.length === 0) {
        toast({ title: "No valid holdings found", description: "Format: TICKER,Name,Weight%", variant: "destructive" });
        return;
      }

      await apiRequest("POST", "/api/etf/holdings/upload", {
        ticker: uploadTicker.toUpperCase(),
        holdings,
      });

      addEtf(uploadTicker);
      setUploadTicker("");
      setUploadData("");
      setShowUpload(false);
      toast({ title: `${uploadTicker.toUpperCase()} holdings saved`, description: `${holdings.length} holdings loaded.` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      {/* Top row: input + analyze */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Input
            ref={inputRef}
            data-testid="input-etf-ticker"
            placeholder="Add ETF ticker (e.g. QQQ)"
            value={input}
            onChange={(e) => {
              setInput(e.target.value.toUpperCase());
              setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="h-9 text-sm uppercase placeholder:uppercase placeholder:normal-case"
          />
          {showSuggestions && filtered.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
              {filtered.map((t) => (
                <button
                  key={t}
                  data-testid={`suggestion-${t}`}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors flex items-center justify-between"
                  onMouseDown={() => addEtf(t)}
                >
                  <span className="font-medium">{t}</span>
                  <Plus className="w-3 h-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          data-testid="button-add-etf"
          size="sm"
          variant="secondary"
          onClick={() => addEtf(input)}
          disabled={!input.trim()}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>

        <Button
          data-testid="button-upload-manual"
          size="sm"
          variant="outline"
          onClick={() => setShowUpload(!showUpload)}
          title="Manually upload holdings CSV"
        >
          <Upload className="w-3.5 h-3.5 mr-1" /> Manual Upload
        </Button>

        <div className="flex-1" />

        <span className="text-xs text-muted-foreground">{selected.length}/10 ETFs</span>

        <Button
          data-testid="button-analyze"
          size="sm"
          onClick={onAnalyze}
          disabled={isLoading || selected.length < 2}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5"
        >
          {isLoading ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              Analyzing…
            </>
          ) : (
            "Analyze Overlap"
          )}
        </Button>
      </div>

      {/* Manual upload panel */}
      {showUpload && (
        <div className="bg-muted/40 border border-border rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-foreground">Manual Holdings Upload</p>
          <p className="text-xs text-muted-foreground">
            Format: one holding per line — <code className="bg-muted px-1 rounded">TICKER,Name,Weight%</code>
            <br />
            Example: <code className="bg-muted px-1 rounded">AAPL,Apple Inc,8.5</code>
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="ETF Ticker (e.g. MYETF)"
              value={uploadTicker}
              onChange={(e) => setUploadTicker(e.target.value.toUpperCase())}
              className="h-8 text-xs w-36"
            />
          </div>
          <textarea
            placeholder={"AAPL,Apple Inc,8.5\nMSFT,Microsoft,7.2\n..."}
            value={uploadData}
            onChange={(e) => setUploadData(e.target.value)}
            className="w-full h-28 bg-background border border-border rounded-md px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpload} className="text-xs h-7">Save Holdings</Button>
            <Button size="sm" variant="outline" onClick={() => setShowUpload(false)} className="text-xs h-7">Cancel</Button>
          </div>
        </div>
      )}

      {/* Selected ETF chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((ticker, i) => (
            <div
              key={ticker}
              data-testid={`chip-etf-${ticker}`}
              className={`etf-chip-${i % 10} flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold`}
            >
              <span className={`etf-dot-${i % 10} w-1.5 h-1.5 rounded-full flex-shrink-0`} />
              {ticker}
              <button
                data-testid={`button-remove-${ticker}`}
                onClick={() => removeEtf(ticker)}
                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {selected.length > 1 && (
            <button
              data-testid="button-clear-all"
              onClick={() => onChange([])}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {/* Quick presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Quick presets:</span>
        {[
          { label: "Your Portfolio", tickers: ["QQQI", "SPYI", "SCHD", "SCHG", "FDVV", "VYMI"] },
          { label: "Mega-cap Tech", tickers: ["QQQ", "SCHG", "VUG", "XLK"] },
          { label: "Dividend Focus", tickers: ["SCHD", "FDVV", "JEPI", "JEPQ", "VYM"] },
          { label: "Core Market", tickers: ["SPY", "QQQ", "VTI", "VOO"] },
        ].map((preset) => (
          <button
            key={preset.label}
            data-testid={`preset-${preset.label.replace(/\s/g, "-").toLowerCase()}`}
            onClick={() => onChange(preset.tickers)}
            className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
