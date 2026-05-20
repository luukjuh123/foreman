import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/voice"),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// voice lib unit tests
// ---------------------------------------------------------------------------

describe("voice lib — transcribeAudio", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls /voice/transcribe with FormData and returns text + language", async () => {
    const mockResponse = { text: "Maak een taak aan", language: "nl" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const { transcribeAudio } = await import("@/lib/voice");
    const blob = new Blob(["audio"], { type: "audio/webm" });
    const result = await transcribeAudio(blob);

    expect(result).toEqual({ text: "Maak een taak aan", language: "nl" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/voice/transcribe"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("voice lib — sendCommand", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls /voice/command with text and returns intent + slots", async () => {
    const mockResponse = {
      intent: "create_task",
      slots: { name: "Fundering gieten" },
      confidence: 0.95,
      source: "ai",
      reasoning: "De gebruiker wil een taak aanmaken.",
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const { sendCommand } = await import("@/lib/voice");
    const result = await sendCommand("Maak een taak aan voor fundering gieten");

    expect(result.intent).toBe("create_task");
    expect(result.slots).toEqual({ name: "Fundering gieten" });
    expect(result.confidence).toBe(0.95);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/voice/command"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("voice lib — chatWithAI", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls /voice/chat with messages and returns AI text + reasoning", async () => {
    const mockResponse = {
      text: "Ik heb de taak aangemaakt.",
      reasoning: "Gebruiker vroeg om een taak aan te maken.",
      metadata: {},
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);

    const { chatWithAI } = await import("@/lib/voice");
    const messages = [{ role: "user", content: "Maak een taak aan" }];
    const result = await chatWithAI(messages);

    expect(result.text).toBe("Ik heb de taak aangemaakt.");
    expect(result.reasoning).toBe("Gebruiker vroeg om een taak aan te maken.");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/voice/chat"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("voice lib — speakText", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls /voice/speak and returns an audio Blob", async () => {
    const audioBytes = new Uint8Array([1, 2, 3]).buffer;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob([audioBytes], { type: "audio/mpeg" })),
    } as unknown as Response);

    const { speakText } = await import("@/lib/voice");
    const result = await speakText("Hallo wereld");

    expect(result).toBeInstanceOf(Blob);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/voice/speak"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ---------------------------------------------------------------------------
// VoicePage — UI tests
// ---------------------------------------------------------------------------

describe("VoicePage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders the empty state when no messages exist", async () => {
    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: vi.fn(),
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    expect(screen.getByTestId("voice-empty-state")).toBeInTheDocument();
    expect(screen.getAllByText(/spraakassistent/i).length).toBeGreaterThan(0);
  });

  it("renders the text input area and send button", async () => {
    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: vi.fn(),
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    expect(screen.getByPlaceholderText(/typ een bericht/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /verstuur/i })).toBeInTheDocument();
  });

  it("renders microphone button", async () => {
    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: vi.fn(),
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    expect(screen.getByRole("button", { name: /microfoon/i })).toBeInTheDocument();
  });

  it("renders TTS speaker toggle button", async () => {
    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: vi.fn(),
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    expect(screen.getByRole("button", { name: /geluid/i })).toBeInTheDocument();
  });

  it("displays user message bubble on right after submitting text", async () => {
    const mockChatWithAI = vi.fn().mockResolvedValue({
      text: "Begrepen, taak aangemaakt.",
      reasoning: "Gebruiker vroeg een taak te maken.",
    });

    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: mockChatWithAI,
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    const input = screen.getByPlaceholderText(/typ een bericht/i);
    fireEvent.change(input, { target: { value: "Maak een taak aan" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /verstuur/i }));
    });

    expect(screen.getByTestId("message-user-0")).toBeInTheDocument();
    expect(screen.getByTestId("message-user-0")).toHaveTextContent("Maak een taak aan");
  });

  it("displays AI response bubble on left after submitting text", async () => {
    const mockChatWithAI = vi.fn().mockResolvedValue({
      text: "Taak aangemaakt.",
      reasoning: "Gebruiker vroeg taak te maken.",
    });

    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: mockChatWithAI,
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    const input = screen.getByPlaceholderText(/typ een bericht/i);
    fireEvent.change(input, { target: { value: "Maak een taak aan" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /verstuur/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("message-ai-0")).toBeInTheDocument();
    });
    expect(screen.getByTestId("message-ai-0")).toHaveTextContent("Taak aangemaakt.");
  });

  it("clears input field after submitting a message", async () => {
    const mockChatWithAI = vi.fn().mockResolvedValue({
      text: "OK.",
      reasoning: "Test.",
    });

    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: mockChatWithAI,
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    const input = screen.getByPlaceholderText(/typ een bericht/i);
    fireEvent.change(input, { target: { value: "Test bericht" } });
    expect(input).toHaveValue("Test bericht");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /verstuur/i }));
    });

    expect(input).toHaveValue("");
  });

  it("does not submit on empty input", async () => {
    const mockChatWithAI = vi.fn();

    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: mockChatWithAI,
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /verstuur/i }));
    });

    expect(mockChatWithAI).not.toHaveBeenCalled();
    expect(screen.getByTestId("voice-empty-state")).toBeInTheDocument();
  });

  it("shows reasoning section collapsed by default on AI message", async () => {
    const mockChatWithAI = vi.fn().mockResolvedValue({
      text: "Antwoord hier.",
      reasoning: "Dit is de redenering.",
    });

    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: mockChatWithAI,
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    const input = screen.getByPlaceholderText(/typ een bericht/i);
    fireEvent.change(input, { target: { value: "Test" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /verstuur/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("message-ai-0")).toBeInTheDocument();
    });

    // Reasoning is present but collapsed — the button is visible, the content hidden
    expect(screen.getByRole("button", { name: /redenering/i })).toBeInTheDocument();
    expect(screen.queryByText("Dit is de redenering.")).not.toBeInTheDocument();
  });

  it("expands reasoning section when clicking the toggle", async () => {
    const mockChatWithAI = vi.fn().mockResolvedValue({
      text: "Antwoord.",
      reasoning: "Uitgebreide redenering hier.",
    });

    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: mockChatWithAI,
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    const input = screen.getByPlaceholderText(/typ een bericht/i);
    fireEvent.change(input, { target: { value: "Vraag" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /verstuur/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("message-ai-0")).toBeInTheDocument();
    });

    // Expand reasoning
    fireEvent.click(screen.getByRole("button", { name: /redenering/i }));

    expect(screen.getByText("Uitgebreide redenering hier.")).toBeInTheDocument();
  });

  it("hides empty state after first message is sent", async () => {
    const mockChatWithAI = vi.fn().mockResolvedValue({
      text: "Hallo.",
      reasoning: "Test.",
    });

    vi.doMock("@/lib/voice", () => ({
      transcribeAudio: vi.fn(),
      sendCommand: vi.fn(),
      chatWithAI: mockChatWithAI,
      speakText: vi.fn(),
    }));

    const { default: VoicePage } = await import("@/app/dashboard/voice/page");
    render(<VoicePage />);

    expect(screen.getByTestId("voice-empty-state")).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/typ een bericht/i);
    fireEvent.change(input, { target: { value: "Hallo" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /verstuur/i }));
    });

    expect(screen.queryByTestId("voice-empty-state")).not.toBeInTheDocument();
  });
});
