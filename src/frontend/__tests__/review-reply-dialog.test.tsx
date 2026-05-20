import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

// Mock Radix Dialog portal (no document.body portal in jsdom)
vi.mock("@radix-ui/react-dialog", async () => {
  const actual = await vi.importActual<typeof import("@radix-ui/react-dialog")>(
    "@radix-ui/react-dialog"
  );
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Mock reviews lib
vi.mock("@/lib/reviews", () => ({
  fetchDraftReply: vi.fn(),
  submitReply: vi.fn(),
}));

import { fetchDraftReply, submitReply } from "@/lib/reviews";
import type { ReviewResponse } from "@/lib/reviews";

const mockFetchDraftReply = vi.mocked(fetchDraftReply);
const mockSubmitReply = vi.mocked(submitReply);

const baseReview: ReviewResponse = {
  id: "review-123",
  location_id: "loc-1",
  external_id: "ext-123",
  author_name: "Jan de Vries",
  rating: 5,
  comment: "Uitstekend werk!",
  created_at_external: "2024-01-15",
  reply_text: null,
  replied_at: null,
};

describe("ReviewReplyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the trigger button by default", async () => {
    const { ReviewReplyDialog } = await import(
      "@/components/review-reply-dialog"
    );
    render(<ReviewReplyDialog review={baseReview} />);
    expect(screen.getByRole("button", { name: /reageren/i })).toBeInTheDocument();
  });

  it("opens the dialog and shows review details", async () => {
    const { ReviewReplyDialog } = await import(
      "@/components/review-reply-dialog"
    );
    render(<ReviewReplyDialog review={baseReview} />);

    fireEvent.click(screen.getByRole("button", { name: /reageren/i }));

    expect(screen.getByText("Jan de Vries")).toBeInTheDocument();
    expect(screen.getByText("Uitstekend werk!")).toBeInTheDocument();
    expect(screen.getByText(/reageren op recensie/i)).toBeInTheDocument();
  });

  it("shows star rating for the review", async () => {
    const { ReviewReplyDialog } = await import(
      "@/components/review-reply-dialog"
    );
    render(<ReviewReplyDialog review={baseReview} />);
    fireEvent.click(screen.getByRole("button", { name: /reageren/i }));

    expect(screen.getByLabelText(/5 van 5 sterren/i)).toBeInTheDocument();
  });

  it("AI draft button triggers fetchDraftReply and fills textarea", async () => {
    mockFetchDraftReply.mockResolvedValueOnce({
      draft_text: "Beste Jan, hartelijk dank!",
    });

    const { ReviewReplyDialog } = await import(
      "@/components/review-reply-dialog"
    );
    render(<ReviewReplyDialog review={baseReview} />);
    fireEvent.click(screen.getByRole("button", { name: /reageren/i }));

    const aiButton = screen.getByRole("button", { name: /ai concept genereren/i });
    fireEvent.click(aiButton);

    await waitFor(() => {
      expect(mockFetchDraftReply).toHaveBeenCalledWith("review-123");
    });

    await waitFor(() => {
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toBe("Beste Jan, hartelijk dank!");
    });
  });

  it("submit button calls submitReply with text", async () => {
    const updatedReview: ReviewResponse = {
      ...baseReview,
      reply_text: "Dank u wel!",
      replied_at: "2024-01-16T10:00:00Z",
    };
    mockSubmitReply.mockResolvedValueOnce(updatedReview);

    const { ReviewReplyDialog } = await import(
      "@/components/review-reply-dialog"
    );
    const onSuccess = vi.fn();
    render(<ReviewReplyDialog review={baseReview} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /reageren/i }));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Dank u wel!" } });

    fireEvent.click(screen.getByRole("button", { name: /^versturen$/i }));

    await waitFor(() => {
      expect(mockSubmitReply).toHaveBeenCalledWith("review-123", "Dank u wel!");
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(updatedReview);
    });
  });

  it("shows error message when AI draft fails", async () => {
    mockFetchDraftReply.mockRejectedValueOnce(new Error("Netwerk fout"));

    const { ReviewReplyDialog } = await import(
      "@/components/review-reply-dialog"
    );
    render(<ReviewReplyDialog review={baseReview} />);
    fireEvent.click(screen.getByRole("button", { name: /reageren/i }));

    const aiButton = screen.getByRole("button", { name: /ai concept genereren/i });
    fireEvent.click(aiButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Netwerk fout");
    });
  });

  it("shows error when submit fails", async () => {
    mockSubmitReply.mockRejectedValueOnce(new Error("Versturen mislukt"));

    const { ReviewReplyDialog } = await import(
      "@/components/review-reply-dialog"
    );
    render(<ReviewReplyDialog review={baseReview} />);
    fireEvent.click(screen.getByRole("button", { name: /reageren/i }));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Test antwoord" } });

    fireEvent.click(screen.getByRole("button", { name: /^versturen$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Versturen mislukt");
    });
  });

  it("pre-fills textarea with existing reply_text", async () => {
    const reviewWithReply: ReviewResponse = {
      ...baseReview,
      reply_text: "Al beantwoord.",
    };

    const { ReviewReplyDialog } = await import(
      "@/components/review-reply-dialog"
    );
    render(<ReviewReplyDialog review={reviewWithReply} />);
    fireEvent.click(screen.getByRole("button", { name: /reageren/i }));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Al beantwoord.");
  });
});
