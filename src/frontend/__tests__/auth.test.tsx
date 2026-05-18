import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock auth module
vi.mock("@/lib/auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
  getAccessToken: vi.fn(() => null),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  logout: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with email and password fields", async () => {
    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("has a link to register page", async () => {
    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    render(<LoginPage />);
    const link = screen.getByText(/register/i);
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/register");
  });

  it("requires email field", async () => {
    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toBeRequired();
  });
});

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders register form with name, email, password, and confirm fields", async () => {
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    render(<RegisterPage />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("has a link to login page", async () => {
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    render(<RegisterPage />);
    const link = screen.getByText(/sign in/i);
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/login");
  });

  it("requires all fields", async () => {
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    render(<RegisterPage />);
    expect(screen.getByLabelText(/name/i)).toBeRequired();
    expect(screen.getByLabelText(/email/i)).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
    expect(screen.getByLabelText(/confirm/i)).toBeRequired();
  });

  it("enforces minimum password length", async () => {
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    render(<RegisterPage />);
    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput.minLength).toBe(6);
  });
});

describe("Auth layout", () => {
  it("renders children centered", async () => {
    const { default: AuthLayout } = await import("@/app/(auth)/layout");
    render(
      <AuthLayout>
        <div data-testid="auth-content">Auth content</div>
      </AuthLayout>
    );
    expect(screen.getByTestId("auth-content")).toHaveTextContent("Auth content");
  });
});
