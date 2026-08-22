import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Download, Loader2, Send } from "lucide-react";
import { downloadWatiCsv, type BroadcastBuild } from "@/lib/watiBroadcast";
import { apiRequest } from "@/lib/queryClient";

type SendResponse = {
  ok: boolean;
  sentCount: number;
  failedCount: number;
  total: number;
  failures?: { whatsappNumber: string; name: string; error?: string }[];
  error?: string;
};

export function BroadcastPanel({ build }: { build: BroadcastBuild }) {
  const { toast } = useToast();
  const [broadcastName, setBroadcastName] = useState(
    `${build.definition.defaultBroadcastName}_${dateSuffix()}`,
  );
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<SendResponse | null>(null);

  const empty = build.contacts.length === 0;

  // Resolve banner path to an absolute URL (WATI must be able to fetch it).
  const bannerPath = build.definition.bannerPath;
  const mediaUrl = bannerPath
    ? `${window.location.origin}${bannerPath}`
    : undefined;

  async function doSend() {
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/wati/send-broadcast", {
        broadcastType: build.type,
        templateName: build.definition.templateName,
        broadcastName,
        contacts: build.contacts,
        ...(mediaUrl ? { mediaUrl } : {}),
      });
      const data = (await res.json()) as SendResponse;
      if (!data.ok && data.sentCount === 0) {
        throw new Error(data.error || "Send failed");
      }
      setLastResult(data);
      toast({
        title: data.ok ? "Broadcast sent" : "Broadcast partially sent",
        description: `${data.sentCount}/${data.total} delivered${
          data.failedCount > 0 ? ` · ${data.failedCount} failed` : ""
        }`,
        variant: data.ok ? "default" : "destructive",
      });
      // Reset the name so the next send gets a fresh default.
      setBroadcastName(
        `${build.definition.defaultBroadcastName}_${dateSuffix()}`,
      );
    } catch (err: any) {
      toast({
        title: "Send failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Definition strip */}
      <div className="flex items-start justify-between gap-4 flex-wrap p-4 rounded-md bg-accent/50 border border-border">
        <div className="space-y-1">
          <div className="text-sm">
            <span className="text-muted-foreground">Template:</span>{" "}
            <code
              className="text-xs bg-background px-1.5 py-0.5 rounded border border-border"
              data-testid="text-template-name"
            >
              {build.definition.templateName}
            </code>
          </div>
          <div className="text-xs text-muted-foreground max-w-md">
            {build.definition.description}
          </div>
          {(build.nlow4ExcludedCount ?? 0) > 0 && (
            <div
              className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 max-w-md"
              data-testid="note-nlow4-excluded"
            >
              <span>⚠</span>
              <span>
                {build.nlow4ExcludedCount} contact(s) removed (found in Tag 4 List)
              </span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Recipients</div>
          <div className="text-xl font-semibold" data-testid="text-recipient-count">
            {build.contacts.length}
          </div>
        </div>
      </div>

      {/* Banner preview */}
      {bannerPath && (
        <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <img
            src={bannerPath}
            alt={build.definition.bannerLabel || "Broadcast banner"}
            className="w-32 h-16 object-cover rounded border border-border shrink-0"
            data-testid={`img-banner-${build.type}`}
          />
          <div className="text-xs space-y-0.5">
            <div className="font-medium text-amber-900 dark:text-amber-200">
              Intended header image
            </div>
            <div className="text-amber-800 dark:text-amber-300">
              {build.definition.bannerLabel}
            </div>
            <div className="text-amber-700/80 dark:text-amber-400/80">
              Note: the WATI template currently has a STATIC header image baked in at
              approval time. To use this banner, the template must be re-approved by
              Meta with a media-variable header. Until then, the existing template
              image is sent.
            </div>
          </div>
        </div>
      )}

      {/* Broadcast name */}
      <div className="space-y-1.5">
        <Label htmlFor={`bcname-${build.type}`}>Broadcast name (visible in WATI)</Label>
        <Input
          id={`bcname-${build.type}`}
          value={broadcastName}
          onChange={(e) => setBroadcastName(e.target.value)}
          data-testid={`input-broadcast-name-${build.type}`}
        />
      </div>

      {/* Excluded warning */}
      {build.excluded.length > 0 && (
        <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-medium text-destructive">
              {build.excluded.length} contact
              {build.excluded.length === 1 ? "" : "s"} excluded
            </div>
            <div className="text-muted-foreground mt-0.5">
              {build.excluded.slice(0, 3).map((e, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {e.name || e.email} ({e.reason})
                </span>
              ))}
              {build.excluded.length > 3 &&
                ` · +${build.excluded.length - 3} more`}
            </div>
          </div>
        </div>
      )}

      {/* Recipient preview table */}
      {!empty && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Country Code</th>
                  <th className="text-left px-3 py-2 font-medium">Phone</th>
                  <th className="text-left px-3 py-2 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {build.contacts.slice(0, 200).map((c, i) => (
                  <tr
                    key={`${c.countryCode}${c.phone}-${i}`}
                    className="border-t border-border"
                    data-testid={`row-contact-${i}`}
                  >
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {c.countryCode}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{c.phone}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[200px]">
                      {c.email}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {build.contacts.length > 200 && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border bg-muted/40">
              Showing first 200 of {build.contacts.length} — all will be sent.
            </div>
          )}
        </div>
      )}

      {empty && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-md">
          No contacts match this broadcast.
        </div>
      )}

      {/* Last send confirmation */}
      {lastResult && (
        <div
          className="p-3 rounded-md border border-primary/30 bg-primary/5 text-sm flex items-start gap-2"
          data-testid="send-result"
        >
          <Send className="h-4 w-4 text-primary mt-0.5" />
          <div>
            <div>
              <strong>{lastResult.sentCount}</strong> of{" "}
              <strong>{lastResult.total}</strong> messages dispatched
              {lastResult.failedCount > 0 && (
                <>
                  {" "}
                  · <span className="text-destructive">
                    {lastResult.failedCount} failed
                  </span>
                </>
              )}
            </div>
            {lastResult.failures && lastResult.failures.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                First failure: {lastResult.failures[0].name} —{" "}
                {lastResult.failures[0].error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 flex-wrap">
        <Button
          variant="outline"
          onClick={() => downloadWatiCsv(build)}
          disabled={empty}
          data-testid={`button-download-csv-${build.type}`}
        >
          <Download className="h-4 w-4 mr-2" />
          Download CSV
        </Button>
        <Button
          onClick={doSend}
          disabled={empty || !broadcastName.trim() || sending}
          data-testid={`button-send-${build.type}`}
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send Broadcast
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function dateSuffix(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
