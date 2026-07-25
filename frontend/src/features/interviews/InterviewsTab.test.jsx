import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InterviewsTab } from "./InterviewsTab";

vi.mock("../../api/client", () => ({ api: vi.fn() }));
import { api } from "../../api/client";

const INTERVIEW = {
  id: "iv-1",
  candidate_id: "c-1",
  candidate_name: "Arman Hossain",
  candidate_email: "arman@example.com",
  job_title: "Python Developer",
  match_score: 82,
  interview_time: "2026-08-01T04:00:00+00:00",
  meet_link: "https://meet.jit.si/hr-interview-xyz",
  email_sent: true,
  status: "scheduled",
};

function mockApi(interviews) {
  api.mockImplementation(async (path, opts = {}) => {
    if (path === "/interviews") return { total: interviews.length, items: interviews };
    if (path === "/email-logs") return { total: 0, items: [] };
    if (path.endsWith("/cancel") || path.endsWith("/complete")) return { id: "iv-1" };
    if (opts.method === "PATCH") return { id: "iv-1", status: "scheduled" };
    throw new Error(`unexpected api call: ${path}`);
  });
}

beforeEach(() => {
  // Block body on purpose: returning the mock from beforeEach would register
  // it as a cleanup hook and invoke it with no arguments after each test.
  api.mockReset();
});

describe("InterviewsTab", () => {
  it("renders paginated interviews from the API", async () => {
    mockApi([INTERVIEW]);
    render(<InterviewsTab refresh={0} />);
    expect(await screen.findByText("Arman Hossain")).toBeInTheDocument();
    expect(screen.getByText(/join meeting/i)).toBeInTheDocument();
    expect(screen.getByText("scheduled")).toBeInTheDocument();
  });

  it("shows the empty state when there are no interviews", async () => {
    mockApi([]);
    render(<InterviewsTab refresh={0} />);
    expect(await screen.findByText(/no interviews scheduled/i)).toBeInTheDocument();
  });

  it("cancels an interview via POST /interviews/{id}/cancel", async () => {
    mockApi([INTERVIEW]);
    render(<InterviewsTab refresh={0} />);
    await screen.findByText("Arman Hossain");

    fireEvent.click(screen.getByText(/^cancel$/i));
    await vi.waitFor(() =>
      expect(api).toHaveBeenCalledWith("/interviews/iv-1/cancel", { method: "POST" }),
    );
  });

  it("marks an interview completed via POST /interviews/{id}/complete", async () => {
    mockApi([INTERVIEW]);
    render(<InterviewsTab refresh={0} />);
    await screen.findByText("Arman Hossain");

    fireEvent.click(screen.getByText(/mark completed/i));
    await vi.waitFor(() =>
      expect(api).toHaveBeenCalledWith("/interviews/iv-1/complete", { method: "POST" }),
    );
  });

  it("reschedules through the inline datetime editor", async () => {
    mockApi([INTERVIEW]);
    const { container } = render(<InterviewsTab refresh={0} />);
    await screen.findByText("Arman Hossain");

    fireEvent.click(screen.getByText(/reschedule/i));
    const dt = container.querySelector('input[type="datetime-local"]');
    fireEvent.change(dt, { target: { value: "2026-08-10T10:00" } });
    fireEvent.click(screen.getByText(/confirm/i));

    await vi.waitFor(() => {
      const patch = api.mock.calls.find(([p, o]) => p === "/interviews/iv-1" && o?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch[1].body).interview_time).toMatch(/^2026-08-10T/);
    });
  });

  it("hides management actions for non-scheduled interviews", async () => {
    mockApi([{ ...INTERVIEW, status: "cancelled" }]);
    render(<InterviewsTab refresh={0} />);
    await screen.findByText("Arman Hossain");
    expect(screen.queryByText(/mark completed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reschedule/i)).not.toBeInTheDocument();
  });
});
