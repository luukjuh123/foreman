import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// MediaRecorder + mediaDevices mocks
// ---------------------------------------------------------------------------

class MockMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: { error: DOMException }) => void) | null = null;

  static isTypeSupported = vi.fn(() => true);

  constructor(public stream: MediaStream) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    // Emit a data chunk then fire onstop
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const mockGetUserMedia = vi.fn();

beforeEach(() => {
  // Reset mocks
  vi.resetModules();

  // Install MediaRecorder mock
  Object.defineProperty(global, "MediaRecorder", {
    value: MockMediaRecorder,
    writable: true,
    configurable: true,
  });

  // Install mediaDevices mock
  Object.defineProperty(global.navigator, "mediaDevices", {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });

  const mockStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  mockGetUserMedia.mockResolvedValue(mockStream);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// voice lib mock helpers
// ---------------------------------------------------------------------------

function mockVoiceLib(overrides: {
  transcribe?: ReturnType<typeof vi.fn>;
  command?: ReturnType<typeof vi.fn>;
} = {}) {
  const transcribe = overrides.transcribe ?? vi.fn().mockResolvedValue({ text: "stop werk", language: "nl" });
  const command = overrides.command ?? vi.fn().mockResolvedValue({
    intent: "stop_task",
    slots: {},
    confidence: 0.95,
    source: "whisper",
    reasoning: "Gebruiker wil werk stoppen",
  });

  vi.doMock("@/lib/voice", () => ({ transcribeAudio: transcribe, sendVoiceCommand: command }));
  return { transcribe, command };
}

// ---------------------------------------------------------------------------
// VoiceInputButton tests
// ---------------------------------------------------------------------------

describe("VoiceInputButton", () => {
  it("renders with default push-to-talk mode label", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    expect(screen.getByRole("button", { name: /spraak/i })).toBeInTheDocument();
  });

  it("renders the mode toggle button", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    expect(screen.getByTestId("voice-mode-toggle")).toBeInTheDocument();
  });

  it("shows 'Ingedrukt houden om te spreken' hint in push-to-talk mode", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    expect(screen.getByText(/ingedrukt houden om te spreken/i)).toBeInTheDocument();
  });

  it("toggles to continuous mode and shows continuous hint", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    fireEvent.click(screen.getByTestId("voice-mode-toggle"));

    expect(screen.getByText(/continu luisteren/i)).toBeInTheDocument();
  });

  it("toggles back to push-to-talk mode on second toggle click", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    fireEvent.click(screen.getByTestId("voice-mode-toggle"));
    fireEvent.click(screen.getByTestId("voice-mode-toggle"));

    expect(screen.getByText(/ingedrukt houden om te spreken/i)).toBeInTheDocument();
  });

  it("shows recording indicator when mousedown on push-to-talk button", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("button", { name: /spraak/i }));
    });

    expect(screen.getByTestId("recording-indicator")).toBeInTheDocument();
  });

  it("hides recording indicator on mouseup in push-to-talk mode", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    const btn = screen.getByRole("button", { name: /spraak/i });

    await act(async () => {
      fireEvent.mouseDown(btn);
    });

    await act(async () => {
      fireEvent.mouseUp(btn);
    });

    await waitFor(() => {
      expect(screen.queryByTestId("recording-indicator")).not.toBeInTheDocument();
    });
  });

  it("calls transcribeAudio after recording stops", async () => {
    const { transcribe } = mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    const btn = screen.getByRole("button", { name: /spraak/i });

    await act(async () => {
      fireEvent.mouseDown(btn);
    });

    await act(async () => {
      fireEvent.mouseUp(btn);
    });

    await waitFor(() => {
      expect(transcribe).toHaveBeenCalled();
    });
  });

  it("calls sendVoiceCommand with transcribed text", async () => {
    const { command } = mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    const btn = screen.getByRole("button", { name: /spraak/i });

    await act(async () => {
      fireEvent.mouseDown(btn);
    });

    await act(async () => {
      fireEvent.mouseUp(btn);
    });

    await waitFor(() => {
      expect(command).toHaveBeenCalledWith("stop werk");
    });
  });

  it("displays transcribed text after recording", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    const btn = screen.getByRole("button", { name: /spraak/i });

    await act(async () => {
      fireEvent.mouseDown(btn);
    });

    await act(async () => {
      fireEvent.mouseUp(btn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("transcript-text")).toHaveTextContent("stop werk");
    });
  });

  it("displays command intent after recording", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    const btn = screen.getByRole("button", { name: /spraak/i });

    await act(async () => {
      fireEvent.mouseDown(btn);
    });

    await act(async () => {
      fireEvent.mouseUp(btn);
    });

    await waitFor(() => {
      expect(screen.getByTestId("command-intent")).toBeInTheDocument();
    });
  });

  it("toggles continuous listening on/off with click", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    // Switch to continuous mode
    fireEvent.click(screen.getByTestId("voice-mode-toggle"));

    const btn = screen.getByRole("button", { name: /spraak/i });

    // Click to start continuous listening
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(screen.getByTestId("recording-indicator")).toBeInTheDocument();

    // Click again to stop
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.queryByTestId("recording-indicator")).not.toBeInTheDocument();
    });
  });

  it("shows 'Luisteren...' text while recording in continuous mode", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    fireEvent.click(screen.getByTestId("voice-mode-toggle"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /spraak/i }));
    });

    expect(screen.getByText(/luisteren/i)).toBeInTheDocument();
  });

  it("handles microphone permission denied gracefully", async () => {
    mockVoiceLib();
    mockGetUserMedia.mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError"));

    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("button", { name: /spraak/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("permission-error")).toBeInTheDocument();
    });
  });

  it("shows Dutch permission error message on denial", async () => {
    mockVoiceLib();
    mockGetUserMedia.mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError"));

    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("button", { name: /spraak/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("permission-error")).toHaveTextContent(
        /microfoon toegang geweigerd/i
      );
    });
  });

  it("does not show permission error by default", async () => {
    mockVoiceLib();
    const { default: VoiceInputButton } = await import("@/components/voice-input-button");
    render(<VoiceInputButton />);

    expect(screen.queryByTestId("permission-error")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// voice lib unit tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// voice lib unit tests
// These run with real @/lib/voice implementation, mocking only @/lib/api.
// ---------------------------------------------------------------------------

describe("voice lib — transcribeAudio", () => {
  it("posts audio blob to /voice/transcribe and returns transcript", async () => {
    // Import real module with spied apiFetch
    vi.resetModules();
    const mockFetch = vi.fn().mockResolvedValue({ text: "hallo", language: "nl" });
    vi.doMock("@/lib/api", () => ({ apiFetch: mockFetch }));
    vi.doMock("@/lib/voice", async () => {
      const actual = await vi.importActual<typeof import("@/lib/voice")>("@/lib/voice");
      return actual;
    });

    const { transcribeAudio } = await import("@/lib/voice");
    const blob = new Blob(["audio"], { type: "audio/webm" });
    const result = await transcribeAudio(blob);

    expect(result).toEqual({ text: "hallo", language: "nl" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/voice/transcribe",
      expect.objectContaining({ method: "POST" })
    );

    // Ensure Content-Type is NOT set — let browser handle multipart boundary
    const callOpts = mockFetch.mock.calls[0][1] as RequestInit & { headers?: Record<string, string> };
    expect(callOpts.headers?.["Content-Type"]).toBeUndefined();
  });
});

describe("voice lib — sendVoiceCommand", () => {
  it("posts text to /voice/command and returns command response", async () => {
    vi.resetModules();
    const mockResponse = {
      intent: "start_task",
      slots: { task: "fundering" },
      confidence: 0.9,
      source: "whisper",
      reasoning: "Gebruiker wil taak starten",
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    vi.doMock("@/lib/api", () => ({ apiFetch: mockFetch }));
    vi.doMock("@/lib/voice", async () => {
      const actual = await vi.importActual<typeof import("@/lib/voice")>("@/lib/voice");
      return actual;
    });

    const { sendVoiceCommand } = await import("@/lib/voice");
    const result = await sendVoiceCommand("start fundering");

    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      "/voice/command",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "start fundering" }),
      })
    );
  });
});
