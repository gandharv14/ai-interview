import { beforeEach, describe, expect, it, vi } from "vitest";

const auth0MiddlewareMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth0", () => ({
  auth0: {
    middleware: (request: Request) => auth0MiddlewareMock(request),
  },
}));

import { middleware } from "@/middleware";

describe("middleware", () => {
  beforeEach(() => {
    auth0MiddlewareMock.mockReset();
  });

  it("lets the admin page render its setup screen when Auth0 config is missing", async () => {
    delete process.env.AUTH0_DOMAIN;

    const response = await middleware(new Request("http://localhost/admin"));

    expect(auth0MiddlewareMock).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("returns an actionable API error when Auth0 config is missing", async () => {
    delete process.env.AUTH0_DOMAIN;

    const response = await middleware(
      new Request("http://localhost/api/admin/interviews"),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("AUTH0_DOMAIN"),
      missingEnv: ["AUTH0_DOMAIN"],
    });
    expect(response.status).toBe(503);
    expect(auth0MiddlewareMock).not.toHaveBeenCalled();
  });

  it("lets the auth error page render when Auth0 config is missing", async () => {
    delete process.env.AUTH0_DOMAIN;

    const response = await middleware(
      new Request("http://localhost/auth/error"),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(auth0MiddlewareMock).not.toHaveBeenCalled();
  });

  it("redirects Auth0 routes to the error page when config is missing", async () => {
    delete process.env.AUTH0_DOMAIN;

    const response = await middleware(
      new Request("http://localhost/auth/login?returnTo=%2Fadmin"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/error");
    expect(response.headers.get("location")).toContain("AUTH0_DOMAIN");
    expect(auth0MiddlewareMock).not.toHaveBeenCalled();
  });

  it("delegates to Auth0 middleware when config is present", async () => {
    auth0MiddlewareMock.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await middleware(new Request("http://localhost/admin"));

    expect(response.status).toBe(204);
    expect(auth0MiddlewareMock).toHaveBeenCalledOnce();
  });
});
