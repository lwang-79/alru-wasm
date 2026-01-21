import { For, Show, type JSX } from "solid-js";
import { StatusMessage } from "./StatusMessage";
import type { FileChange } from "../../types";

export type OperationFeedbackStatus = "pending" | "running" | "success" | "failed";

interface OperationFeedbackProps {
    status: OperationFeedbackStatus;
    changes?: FileChange[];
    message?: string | string[] | JSX.Element | null;
    noChangesMessage?: string | string[] | JSX.Element | null;
    noChanges?: boolean;
    title?: string;
    className?: string;
    children?: JSX.Element;
}

export function OperationFeedback(props: OperationFeedbackProps) {
    // Determine if no changes were applied
    const isActuallyNoChanges = () => {
        if (props.noChanges !== undefined) return props.noChanges;
        if (props.changes) return props.changes.length === 0;
        return false;
    };

    const defaultTitle = () => isActuallyNoChanges() ? "NO CHANGES APPLIED" : "CHANGES APPLIED";
    const getNoChangesMessage = () =>
        props.noChangesMessage ||
        (props.message && isActuallyNoChanges() ? props.message : "No changes were applied during this operation.");

    const getChangeTypeDisplay = (changeType: string) => {
        const map: Record<string, string> = {
            runtime_update: "Runtime Update",
            dependency_update: "Dependency Update",
            env_update: "Environment Variable Update",
            code_comment_update: "Code Comment Update",
            Create: "New File",
            Update: "Modified",
            Delete: "Removed",
        };
        return map[changeType] || changeType;
    };

    return (
        <Show when={props.status === "success"}>
            <div class={`mt-4 pt-2 border-t border-[#f0f0f0] dark:border-[#444] ${props.className || ""}`}>
                <h4 class="text-[0.9rem] font-bold text-[#555] dark:text-[#ccc] uppercase tracking-tight mb-2">
                    {props.title || defaultTitle()}
                </h4>

                <Show
                    when={!isActuallyNoChanges()}
                    fallback={
                        <Show when={!props.children}>
                            <StatusMessage
                                message={getNoChangesMessage()}
                                type="none"
                                showIcon={false}
                            />
                        </Show>
                    }
                >
                    <Show when={props.changes && props.changes.length > 0}>
                        <div class="flex flex-col gap-3">
                            <For each={props.changes}>
                                {(change) => (
                                    <div class="bg-[#fafafa] dark:bg-[#333] rounded-lg p-3 border border-[#f0f0f0] dark:border-[#444] shadow-sm mb-3 last:mb-0">
                                        <div class="flex items-center gap-3 mb-2">
                                            <span class="px-2 py-0.5 bg-[#e3f2fd] dark:bg-[#1a3a5c] text-[#1976d2] dark:text-[#64b5f6] rounded text-[0.65rem] font-bold uppercase tracking-wide whitespace-nowrap">
                                                {getChangeTypeDisplay(change.change_type)}
                                            </span>
                                            <code class="text-[0.8rem] text-[#666] dark:text-[#aaa] truncate italic">
                                                {change.path.split("/").pop()}
                                            </code>
                                        </div>
                                        <Show when={change.old_value !== undefined || change.new_value !== undefined}>
                                            <div class="flex items-center gap-2 text-[0.85rem] bg-white dark:bg-[#222] p-2 rounded border border-[#f0f0f0] dark:border-[#111]">
                                                <span class="text-[#f44336] dark:text-[#ef5350] line-through font-mono opacity-60 text-[0.8rem]">
                                                    {change.old_value}
                                                </span>
                                                <span class="text-[#999] dark:text-[#666]">
                                                    <svg
                                                        class="w-4 h-4"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                        stroke-width="2.5"
                                                    >
                                                        <path
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                                                        />
                                                    </svg>
                                                </span>
                                                <span class="text-[#4caf50] dark:text-[#81c784] font-bold font-mono text-[0.85rem]">
                                                    {change.new_value}
                                                </span>
                                            </div>
                                        </Show>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Show>

                    <Show when={props.message && (!props.changes || props.changes.length === 0)}>
                        <StatusMessage
                            message={props.message!}
                            type="info"
                            showIcon={false}
                        />
                    </Show>
                </Show>

                {props.children}
            </div>
        </Show>
    );
}
