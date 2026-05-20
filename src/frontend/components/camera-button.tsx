"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import CameraCapture from "@/components/camera-capture";

interface Props {
  onPhoto: (blob: Blob) => void;
}

export default function CameraButton({ onPhoto }: Props) {
  const [open, setOpen] = useState(false);

  function handleCapture(blob: Blob) {
    onPhoto(blob);
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          data-testid="camera-button"
        >
          <Camera className="h-4 w-4" />
          Foto nemen
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-0 shadow-lg">
          <Dialog.Title className="sr-only">Foto nemen</Dialog.Title>
          <CameraCapture
            onCapture={handleCapture}
            onCancel={() => setOpen(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
