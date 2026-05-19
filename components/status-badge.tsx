import { CheckCircle2, Clock3, Loader2 } from "lucide-react";
import type { InterviewStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: InterviewStatus }) {
  if (status === "completed") {
    return (
      <span className="badge badge-completed">
        <CheckCircle2 size={14} aria-hidden />
        Completed
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="badge badge-live">
        <Loader2 size={14} aria-hidden />
        In progress
      </span>
    );
  }
  return (
    <span className="badge badge-waiting">
      <Clock3 size={14} aria-hidden />
      Ready
    </span>
  );
}
