"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { decodeTicketQrPayload } from "@/domains/checkin/qr-payload";
import type { StaffGateOption } from "@/components/staff/checkin/types";

type ScanTicketFormProps = {
  gates: StaffGateOption[];
  disabled?: boolean;
  onSubmit: (input: {
    qrToken: string;
    gateId: string;
    ticketId?: string;
    buyerId?: string;
    eventId?: string;
    boughtAt?: string;
  }) => Promise<void> | void;
};

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function getBarcodeDetectorConstructor() {
  return (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
}

export function ScanTicketForm({ gates, disabled = false, onSubmit }: ScanTicketFormProps) {
  const [gateId, setGateId] = useState(() => gates[0]?.id ?? "");
  const [qrToken, setQrToken] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraSupported] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return Boolean(getBarcodeDetectorConstructor() && navigator.mediaDevices?.getUserMedia);
  });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const decodedPayload = useMemo(() => {
    const value = qrToken.trim();

    if (!value) {
      return null;
    }

    return decodeTicketQrPayload(value);
  }, [qrToken]);

  const stopCamera = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const scanVideoFrame = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || !cameraEnabled) {
      return;
    }

    try {
      const detections = await detectorRef.current.detect(videoRef.current);
      const first = detections.find(
        (item) => typeof item.rawValue === "string" && item.rawValue.trim().length > 0,
      );

      if (first?.rawValue) {
        setQrToken(first.rawValue.trim());
      }
    } catch {
      // Continue scanning even if a frame fails to decode.
    }

    rafIdRef.current = window.requestAnimationFrame(() => {
      void scanVideoFrame();
    });
  }, [cameraEnabled]);

  useEffect(() => {
    if (!cameraEnabled || !cameraSupported) {
      stopCamera();
      return;
    }

    let isDisposed = false;

    async function startCamera() {
      try {
        const Detector = getBarcodeDetectorConstructor();
        if (!Detector) {
          setCameraError("Barcode detector is not supported in this browser.");
          return;
        }

        detectorRef.current = new Detector({
          formats: ["qr_code"],
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
          audio: false,
        });

        if (isDisposed) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setCameraError(null);
        void scanVideoFrame();
      } catch (error) {
        setCameraError(
          error instanceof Error
            ? error.message
            : "Unable to access camera for scanning.",
        );
      }
    }

    void startCamera();

    return () => {
      isDisposed = true;
      stopCamera();
    };
  }, [cameraEnabled, cameraSupported, scanVideoFrame, stopCamera]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQr = qrToken.trim();
    if (!trimmedQr || !gateId || disabled || pending) {
      return;
    }

    setPending(true);
    try {
      await onSubmit({
        qrToken: trimmedQr,
        gateId,
        ticketId: decodedPayload?.ticketId,
        buyerId: decodedPayload?.buyerId,
        eventId: decodedPayload?.eventId,
        boughtAt: decodedPayload?.boughtAt,
      });
      setQrToken("");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-base font-semibold text-gray-900">Scan Ticket</p>
        <p className="mt-1 text-sm text-gray-500">
          Paste QR token from scanner, or use camera-assisted capture when available.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
        <label className="text-sm font-medium text-gray-900">
          QR token
          <Input
            className="mt-1"
            value={qrToken}
            onChange={(event) => setQrToken(event.target.value)}
            placeholder="ticket_qr_token"
            required
          />
        </label>

        <label className="text-sm font-medium text-gray-900">
          Gate
          <Select
            className="mt-1"
            value={gateId}
            onChange={(event) => setGateId(event.target.value)}
            disabled={gates.length === 0}
          >
            {gates.map((gate) => (
              <option key={gate.id} value={gate.id}>
                {gate.name}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex items-end">
          <Button type="submit" disabled={disabled || pending || gates.length === 0}>
            {pending ? "Scanning..." : "Scan now"}
          </Button>
        </div>
      </form>

      {decodedPayload ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          <p className="font-semibold uppercase tracking-widest text-gray-500">Decoded QR</p>
          <p className="mt-1">Ticket: {decodedPayload.ticketId}</p>
          <p>Buyer: {decodedPayload.buyerId}</p>
          <p>Event: {decodedPayload.eventId}</p>
          <p>Bought at: {new Date(decodedPayload.boughtAt).toLocaleString()}</p>
        </div>
      ) : null}

      {cameraSupported ? (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-widest text-gray-500">Camera helper</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCameraEnabled((previous) => !previous)}
            >
              {cameraEnabled ? "Stop camera" : "Use camera"}
            </Button>
          </div>

          {cameraEnabled ? (
            <video
              ref={videoRef}
              className="w-full rounded-lg border border-gray-200 bg-gray-900/80"
              muted
              playsInline
            />
          ) : null}

          {cameraError ? <p className="text-xs text-rose-600">{cameraError}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Camera scanning is not supported in this browser; hardware scanner input still works.
        </p>
      )}
    </section>
  );
}
