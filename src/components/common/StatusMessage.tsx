import { For, Show, type JSX } from "solid-js";

interface StatusMessageProps {
  message: string | string[] | JSX.Element;
  type?: "info" | "success" | "warning" | "error" | "none";
  className?: string;
  icon?: JSX.Element;
  showIcon?: boolean;
}

export function StatusMessage(props: StatusMessageProps) {
  const typeClasses = () => {
    switch (props.type) {
      case "success":
        return "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/50 text-green-800 dark:text-green-300";
      case "warning":
        return "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/50 text-orange-800 dark:text-orange-300";
      case "error":
        return "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-300";
      case "none":
        return "bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800/50 text-gray-700 dark:text-gray-400";
      case "info":
      default:
        return "bg-[#f0f9ff] dark:bg-[#07253d] border-[#bae6fd] dark:border-[#1e3a8a] text-blue-800 dark:text-blue-300";
    }
  };

  const Icon = () => {
    if (props.showIcon === false) return null;
    if (props.icon) return props.icon;

    switch (props.type) {
      case "success":
        return (
          <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "warning":
        return (
          <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case "error":
        return (
          <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "info":
      default:
        return (
          <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div class={`border rounded-lg p-3 flex items-start gap-3 ${typeClasses()} ${props.className || ""}`}>
      <Show when={props.showIcon !== false}>
        <Icon />
      </Show>
      <div class="flex flex-col gap-1 w-full">
        <Show
          when={typeof props.message === "string" || Array.isArray(props.message)}
          fallback={<div class="w-full">{props.message as JSX.Element}</div>}
        >
          <For each={Array.isArray(props.message) ? props.message : [props.message as string]}>
            {(msg) => (
              <p class="m-0 text-[0.85rem] leading-relaxed break-words font-medium">
                {msg}
              </p>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
