import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("CameraButton", () => {
  it("renders with correct label", async () => {
    const { default: CameraButton } = await import("@/components/camera-button");
    render(<CameraButton onPhoto={vi.fn()} />);
    expect(screen.getByTestId("camera-button")).toBeInTheDocument();
    expect(screen.getByText(/foto nemen/i)).toBeInTheDocument();
  });

  it("opens dialog when clicked", async () => {
    // Mock getUserMedia so CameraCapture inside dialog doesn't throw
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      configurable: true,
    });

    const { default: CameraButton } = await import("@/components/camera-button");
    render(<CameraButton onPhoto={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("camera-button"));
    });

    // Dialog content should be visible
    expect(screen.getByTestId("camera-preview")).toBeInTheDocument();
  });
});

describe("CameraCapture", () => {
  it("shows fallback message when getUserMedia is unavailable", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const { default: CameraCapture } = await import("@/components/camera-capture");
    render(<CameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/camera niet beschikbaar/i)).toBeInTheDocument();
  });

  it("shows fallback when getUserMedia throws", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")),
      },
      configurable: true,
    });

    const { default: CameraCapture } = await import("@/components/camera-capture");
    await act(async () => {
      render(<CameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />);
    });

    expect(screen.getByText(/camera niet beschikbaar/i)).toBeInTheDocument();
  });

  it("renders video element when camera available", async () => {
    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    };
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
    });

    const { default: CameraCapture } = await import("@/components/camera-capture");
    await act(async () => {
      render(<CameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />);
    });

    expect(screen.getByTestId("camera-preview")).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const onCancel = vi.fn();
    const { default: CameraCapture } = await import("@/components/camera-capture");
    render(<CameraCapture onCapture={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByText(/annuleren/i));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders capture button when camera is available", async () => {
    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    };
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
    });

    const { default: CameraCapture } = await import("@/components/camera-capture");
    await act(async () => {
      render(<CameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />);
    });

    expect(screen.getByTestId("capture-btn")).toBeInTheDocument();
  });
});
