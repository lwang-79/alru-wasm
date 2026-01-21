import { Show, type JSX } from "solid-js";

interface WizardStepProps {
    title: string | JSX.Element;
    description?: string | JSX.Element;
    children: JSX.Element;
    onNext?: () => void;
    onBack?: () => void;
    nextLabel?: string;
    backLabel?: string;
    nextDisabled?: boolean;
    backDisabled?: boolean;
    isLoading?: boolean;
    showNext?: boolean;
    showBack?: boolean;
    actions?: JSX.Element; // Custom actions to show alongside buttons
}

export function WizardStep(props: WizardStepProps) {
    const showBack = () => props.showBack !== false && !!props.onBack;
    const showNext = () => props.showNext !== false && !!props.onNext;

    return (
        <div class="max-w-[800px] mx-auto opacity-100 animate-[fadeIn_0.1s_ease-in]">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-[#333] dark:text-[#eee] mb-2 text-left">
                    {props.title}
                </h2>
                <Show when={props.description}>
                    <p class="text-[#666] dark:text-[#999] text-left leading-relaxed">
                        {props.description}
                    </p>
                </Show>
            </div>

            <div class="step-body">
                {props.children}
            </div>

            <Show when={showBack() || showNext() || props.actions}>
                <div class="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-[#eee] dark:border-[#333]">
                    <div>
                        <Show when={showBack()}>
                            <button
                                onClick={() => props.onBack?.()}
                                disabled={props.backDisabled || props.isLoading}
                                class="bg-white dark:bg-[#2a2a2a] text-[#396cd8] dark:text-[#64b5f6] border border-[#396cd8] dark:border-[#1e3a8a] px-8 py-3 rounded-xl font-bold cursor-pointer transition-all duration-200 hover:bg-[#396cd8] dark:hover:bg-[#1e3a8a] hover:text-white dark:hover:text-white disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed shadow-sm active:scale-95"
                            >
                                {props.backLabel || "Back"}
                            </button>
                        </Show>
                    </div>

                    <div class="flex items-center gap-4">
                        {props.actions}
                        <Show when={showNext()}>
                            <button
                                onClick={() => props.onNext?.()}
                                disabled={props.nextDisabled || props.isLoading}
                                class="bg-[#396cd8] dark:bg-[#3b82f6] text-white border-none px-12 py-3 rounded-xl font-bold cursor-pointer transition-all duration-200 hover:bg-[#2d5bb8] dark:hover:bg-[#2563eb] disabled:bg-[#eee] dark:disabled:bg-[#333] disabled:text-[#999] dark:disabled:text-[#666] disabled:cursor-not-allowed active:scale-95 flex items-center gap-2 group"
                            >
                                {props.isLoading ? "Processing..." : (props.nextLabel || "Continue")}
                                <svg
                                    class="w-5 h-5 transition-transform group-hover:translate-x-1"
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
                            </button>
                        </Show>
                    </div>
                </div>
            </Show>
        </div>
    );
}

export default WizardStep;
