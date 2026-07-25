import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ForceChangePasswordModal } from "./ForceChangePasswordModal";

vi.mock("../../api/client", () => ({ api: vi.fn() }));
import { api } from "../../api/client";

function fillPasswords(container, current, next, confirm) {
  const inputs = container.querySelectorAll('input[type="password"]');
  fireEvent.change(inputs[0], { target: { value: current } });
  fireEvent.change(inputs[1], { target: { value: next } });
  fireEvent.change(inputs[2], { target: { value: confirm } });
}

describe("ForceChangePasswordModal", () => {
  it("explains why the change is required and offers logout", () => {
    render(<ForceChangePasswordModal onChanged={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByText(/default password/i)).toBeInTheDocument();
    expect(screen.getByText(/log out/i)).toBeInTheDocument();
  });

  it("rejects a too-short new password without calling the API", async () => {
    const { container } = render(
      <ForceChangePasswordModal onChanged={vi.fn()} onLogout={vi.fn()} />,
    );
    fillPasswords(container, "admin123", "short", "short");
    fireEvent.click(screen.getByText(/change password/i));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords without calling the API", async () => {
    const { container } = render(
      <ForceChangePasswordModal onChanged={vi.fn()} onLogout={vi.fn()} />,
    );
    fillPasswords(container, "admin123", "new-password-1", "different-1");
    fireEvent.click(screen.getByText(/change password/i));
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("submits to /auth/change-password and reports success", async () => {
    api.mockResolvedValueOnce({ success: true });
    const onChanged = vi.fn();
    const { container } = render(
      <ForceChangePasswordModal onChanged={onChanged} onLogout={vi.fn()} />,
    );
    fillPasswords(container, "admin123", "new-password-1", "new-password-1");
    fireEvent.click(screen.getByText(/change password/i));

    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledWith(
      "/auth/change-password",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(api.mock.calls[0][1].body);
    expect(body).toEqual({ current_password: "admin123", new_password: "new-password-1" });
  });

  it("surfaces a backend rejection (wrong current password)", async () => {
    api.mockRejectedValueOnce(new Error("Current password is incorrect"));
    const { container } = render(
      <ForceChangePasswordModal onChanged={vi.fn()} onLogout={vi.fn()} />,
    );
    fillPasswords(container, "wrong", "new-password-1", "new-password-1");
    fireEvent.click(screen.getByText(/change password/i));
    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });
});
