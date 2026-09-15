import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { COPIED_MS, PromoCode } from "@/components/PromoCode";

describe("PromoCode", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("copies the code, confirms it, then resets", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <PromoCode code="NET19" />
      </div>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy promo code NET19" }));
    });
    expect(writeText).toHaveBeenCalledWith("NET19");
    expect(onRow).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Promo code NET19 copied" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(COPIED_MS);
    });
    expect(screen.getByRole("button", { name: "Copy promo code NET19" })).toBeInTheDocument();
  });

  it("shows no confirmation when the clipboard refuses", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<PromoCode code="COM67" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy promo code COM67" }));
    });
    expect(screen.queryByRole("button", { name: /copied/ })).toBeNull();
  });
});
