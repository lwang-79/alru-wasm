import { Show, type JSX } from "solid-js";
import { StatusMessage } from "./StatusMessage";

export type OperationStatus = "pending" | "running" | "success" | "failed";

interface OperationCardProps {
  stepNumber: string | number | null;
  title: string;
  description: string | JSX.Element;
  status: OperationStatus;
  onAction?: () => void;
  actionLabel?: string;
  runningLabel?: string;
  successLabel?: string;
  failedLabel?: string;
  pendingLabel?: string;
  error?: string | null;
  className?: string;
  children?: JSX.Element;
  renderExtra?: () => JSX.Element;
}

export function OperationCard(props: OperationCardProps) {
  const statusClasses = () => {
    switch (props.status) {
      case "pending":
        return "border-[#eee] dark:border-[#444]";
      case "running":
        return "border-[#ffc107] dark:border-[#ff8f00] bg-[#fffbf0] dark:bg-[#2d2a1f]";
      case "success":
        return "border-[#4caf50] dark:border-[#388e3c] bg-[#f1f8e9] dark:bg-[#1b2e1b]";
      case "failed":
        return "border-[#f44336] dark:border-[#d32f2f] bg-[#ffebee] dark:bg-[#2e1b1b]";
      default:
        return "";
    }
  };

  const stepNumberClasses = () => {
    switch (props.status) {
      case "pending":
        return "bg-[#999] dark:bg-[#666]";
      case "running":
        return "bg-[#ffc107] dark:bg-[#ff8f00]";
      case "success":
        return "bg-[#4caf50] dark:bg-[#388e3c]";
      case "failed":
        return "bg-[#f44336] dark:bg-[#d32f2f]";
      default:
        return "";
    }
  };

  return (
    <div
      class={`bg-white dark:bg-[#2a2a2a] rounded-xl px-6 py-4 border shadow-sm transition-all duration-200 ${statusClasses()} ${props.className || ""}`}
    >
      <div class="flex items-start gap-4">
        <div
          class={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${stepNumberClasses()}`}
        >
          {props.stepNumber}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-bold text-[#333] dark:text-[#eee] mb-1">
            {props.title}
          </h3>
          <p class="text-[#666] dark:text-[#aaa] text-sm">{props.description}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Show when={props.status === "pending"}>
            <Show
              when={props.onAction}
              fallback={
                <Show when={props.pendingLabel}>
                  <span class="text-[#666] dark:text-[#aaa] font-bold text-sm italic">
                    {props.pendingLabel}
                  </span>
                </Show>
              }
            >
              <button
                class="bg-[#396cd8] dark:bg-[#3b82f6] text-white border-none px-4 py-2 rounded-lg font-bold cursor-pointer transition-all duration-200 hover:bg-[#2d5bb8] dark:hover:bg-[#2563eb] active:scale-95"
                onClick={props.onAction}
              >
                {props.actionLabel || "Start"}
              </button>
            </Show>
          </Show>
          <Show when={props.status === "running"}>
            <span class="flex items-center gap-2 text-[#ffc107] dark:text-[#ff8f00] font-bold text-sm">
              <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
              {props.runningLabel || "Running..."}
            </span>
          </Show>
          <Show when={props.status === "success"}>
            <span class="text-[#4caf50] dark:text-[#81c784] font-bold text-sm">
              {props.successLabel || "✓ Completed"}
            </span>
          </Show>
          <Show when={props.status === "failed"}>
            <span class="text-[#f44336] dark:text-[#ef5350] font-bold text-sm">
              {props.failedLabel || "✗ Failed"}
            </span>
          </Show>
        </div>
      </div>

      <Show when={props.error}>
        <div class="mt-4 pt-4 border-t border-[#f0f0f0] dark:border-[#444]">
          <StatusMessage message={props.error!} type="error" showIcon={false} />
        </div>
      </Show>

      {props.renderExtra?.()}

      <Show when={props.status === "failed" && props.onAction}>
        <div class="mt-4 pt-4 border-t border-[#f0f0f0] dark:border-[#444] flex justify-start">
          <button
            class="text-[#396cd8] dark:text-[#64b5f6] bg-transparent border-none cursor-pointer text-sm underline hover:no-underline"
            onClick={props.onAction}
          >
            Retry {props.actionLabel || ""}
          </button>
        </div>
      </Show>

      {props.children}
    </div>
  );
}
