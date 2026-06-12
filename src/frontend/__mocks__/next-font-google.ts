// Stub for next/font/google in vitest (jsdom) environment.
// Any font constructor (Inter, Roboto, etc.) returns the expected shape.
function createFontStub(opts?: { variable?: string }) {
  return {
    className: "mock-font",
    variable: opts?.variable ?? "--font-stub",
    style: { fontFamily: "mock" },
  };
}

export const Inter = createFontStub;
export const Roboto = createFontStub;
export const Poppins = createFontStub;
export const Lato = createFontStub;
export const Open_Sans = createFontStub;
