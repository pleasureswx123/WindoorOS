import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the product workspace shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })
    );

    render(<App />);
    expect(screen.getByText("WindoorOS")).toBeInTheDocument();
    expect(screen.getByText("量窗、画图、算料、报价")).toBeInTheDocument();
    expect(screen.getByText("厂家采购建议")).toBeInTheDocument();
  });
});
