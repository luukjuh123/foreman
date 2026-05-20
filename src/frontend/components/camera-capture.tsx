"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

export default function CameraCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(true);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch(() => setError(true));

    return () => {
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  function capture() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob);
    }, "image/jpeg");
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 p-4">
        <p className="text-sm text-muted-foreground">Camera niet beschikbaar</p>
        <button
          onClick={onCancel}
          className="rounded-md border px-4 py-2 text-sm"
        >
          Annuleren
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full rounded-md"
        data-testid="camera-preview"
      />
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="rounded-md border px-4 py-2 text-sm"
        >
          Annuleren
        </button>
        <button
          onClick={capture}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          data-testid="capture-btn"
        >
          Foto maken
        </button>
      </div>
    </div>
  );
}
