import { Copy, Link2, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { buildShareText, gmailShareUrl, whatsappShareUrl, type ShareInput } from "@/lib/share";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

async function copyToClipboard(value: string, okMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(okMessage);
  } catch {
    toast.error("Could not copy — your browser blocked clipboard access");
  }
}

/** Share modal: Email (Gmail) + WhatsApp links, copy link, copy summary. Nothing is shared inside the app. */
export function ShareDialog({
  open,
  onOpenChange,
  input,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  input: ShareInput | null;
}) {
  if (!input) return null;
  const text = buildShareText(input);
  const link = input.url ?? null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share “{input.name}”</DialogTitle>
          <DialogDescription>
            Send the nutrition summary via email or WhatsApp. Attach the PDF spec sheet separately
            if needed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button asChild variant="outline" className="justify-start">
            <a
              href={gmailShareUrl(input)}
              target="_blank"
              rel="noreferrer"
              onClick={() => onOpenChange(false)}
            >
              <Mail className="size-4" /> Share via Email
            </a>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <a
              href={whatsappShareUrl(input)}
              target="_blank"
              rel="noreferrer"
              onClick={() => onOpenChange(false)}
            >
              <MessageCircle className="size-4" /> Share via WhatsApp
            </a>
          </Button>
          {link && (
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => void copyToClipboard(link, "Link copied")}
            >
              <Link2 className="size-4" /> Copy link
            </Button>
          )}
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() => void copyToClipboard(text, "Summary copied to clipboard")}
          >
            <Copy className="size-4" /> Copy summary text
          </Button>
        </div>
        <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-secondary/40 p-3 text-xs whitespace-pre-wrap">
          {text}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
