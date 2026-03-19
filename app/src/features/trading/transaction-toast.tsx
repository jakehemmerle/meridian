"use client";

import * as Toast from "@radix-ui/react-toast";
import { Cross2Icon, ExternalLinkIcon } from "@radix-ui/react-icons";

interface TransactionToastProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  tone: "success" | "error";
  signature?: string | null;
}

function buildExplorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

export function TransactionToast({
  open,
  onOpenChange,
  title,
  description,
  tone,
  signature,
}: TransactionToastProps) {
  return (
    <Toast.Provider swipeDirection="right">
      <Toast.Root
        open={open}
        onOpenChange={onOpenChange}
        className={`transaction-toast ${tone}`}
      >
        <div className="transaction-toast-body">
          <div>
            <Toast.Title className="transaction-toast-title">{title}</Toast.Title>
            <Toast.Description className="transaction-toast-description">
              {description}
            </Toast.Description>
          </div>
          <Toast.Close className="transaction-toast-close" aria-label="Close">
            <Cross2Icon />
          </Toast.Close>
        </div>
        {signature && (
          <Toast.Action altText="Open the transaction on Solscan" asChild>
            <a
              href={buildExplorerUrl(signature)}
              target="_blank"
              rel="noreferrer"
              className="transaction-toast-link"
            >
              View transaction
              <ExternalLinkIcon />
            </a>
          </Toast.Action>
        )}
      </Toast.Root>
      <Toast.Viewport className="transaction-toast-viewport" />
    </Toast.Provider>
  );
}
