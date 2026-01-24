import { Show, type JSX } from "solid-js";
import type { AmplifyJobDetails } from "../../services/aws/amplifyService";

interface DeploymentJobCardProps {
  job: AmplifyJobDetails | null;
  consoleUrl: string | null;
  onFormatDateTime: (dateString: string) => string;
  title?: string;
  showRetryOptions?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  children?: JSX.Element;
}

export function DeploymentJobCard(props: DeploymentJobCardProps) {
  return (
    <Show when={props.job}>
      {/* Show retry/trigger options BEFORE job card if enabled */}
      <Show
        when={
          props.showRetryOptions &&
          (props.job?.status === "FAILED" || props.job?.status === "SUCCEED")
        }
      >
        <div
          class={`p-4 mt-2 rounded-lg border ${
            props.job?.status === "FAILED"
              ? "bg-[#fff3cd] dark:bg-[#3a2e1a] border-[#ffc107] dark:border-[#f57c00]"
              : "bg-[#e7f3ff] dark:bg-[#1a2a3a] border-[#b3d9ff] dark:border-[#396cd8]"
          }`}
        >
          <Show when={props.job?.status === "FAILED"}>
            <p class="m-0 mb-3 text-sm text-[#856404] dark:text-[#ffb74d] leading-relaxed">
              <strong class="font-bold">Note:</strong> The last deployment job
              (ID: {props.job?.jobId}) failed. This might be why your Lambda
              functions haven't been updated yet. You can retry the deployment
              to apply the runtime configurations.
            </p>
            <div class="flex flex-wrap gap-3">
              <Show when={props.onRetry}>
                <button
                  class="px-4 py-2 bg-[#ff9800] text-white border-none rounded-md text-sm font-medium cursor-pointer transition-all duration-200 hover:bg-[#f57c00] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                  onClick={props.onRetry}
                  disabled={props.retrying}
                >
                  {props.retrying
                    ? "Retrying Job..."
                    : "Retry Failed Deployment"}
                </button>
              </Show>
              <Show when={props.consoleUrl}>
                <a
                  href={props.consoleUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="px-4 py-2 bg-[#396cd8] text-white rounded-md text-sm font-medium transition-all duration-200 hover:bg-[#2563eb] shadow-sm inline-block"
                >
                  View in AWS Console
                </a>
              </Show>
            </div>
          </Show>
          <Show when={props.job?.status === "SUCCEED"}>
            <p class="m-0 mb-3 text-sm text-[#0066cc] dark:text-[#7dd3fc] leading-relaxed">
              <strong class="font-bold">Note:</strong> The last deployment job
              (ID: {props.job?.jobId}) succeeded, but your Lambda functions
              might have been updated outside of Amplify after that deployment.
              You can trigger a new deployment to ensure the runtime
              configurations are applied.
            </p>
            <Show when={props.onRetry}>
              <button
                class="px-4 py-2 bg-[#ff9800] text-white border-none rounded-md text-sm font-medium cursor-pointer transition-all duration-200 hover:bg-[#f57c00] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                onClick={props.onRetry}
                disabled={props.retrying}
              >
                {props.retrying
                  ? "Starting Deployment..."
                  : "Trigger New Deployment"}
              </button>
            </Show>
          </Show>
        </div>
      </Show>

      {/* Job details card */}
      <div class="mt-2 p-4 bg-[#f8f9fa] dark:bg-[#333] rounded-lg border border-[#e9ecef] dark:border-[#444]">
        <div class="flex items-center justify-between mb-3">
          <h4 class="m-0 text-sm font-semibold text-[#495057] dark:text-[#eee]">
            {props.title || "Amplify Deployment Job"}
          </h4>
          <Show when={props.consoleUrl}>
            <a
              href={props.consoleUrl!}
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-[#396cd8] hover:underline font-medium"
            >
              Monitor in AWS Console →
            </a>
          </Show>
        </div>
        <div class="space-y-2 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-medium text-[#6c757d] dark:text-[#aaa] min-w-[60px]">
              Job ID:
            </span>
            <code class="font-mono bg-[#e0e0e0] dark:bg-[#444] px-2 py-0.5 rounded">
              {props.job?.jobId}
            </code>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-medium text-[#6c757d] dark:text-[#aaa] min-w-[60px]">
              Status:
            </span>
            <span
              class={`px-2 py-0.5 rounded font-semibold ${
                props.job?.status === "SUCCEED"
                  ? "bg-[#d4edda] text-[#155724] dark:bg-[#1b3a24] dark:text-[#81c784]"
                  : props.job?.status === "FAILED"
                    ? "bg-[#f8d7da] text-[#721c24] dark:bg-[#4a1f1f] dark:text-[#e57373]"
                    : props.job?.status === "RUNNING"
                      ? "bg-[#d1ecf1] text-[#0c5460] dark:bg-[#1a2e3a] dark:text-[#7dd3fc]"
                      : "bg-[#e2e3e5] text-[#383d41] dark:bg-[#3a3a3a] dark:text-[#aaa]"
              }`}
            >
              {props.job?.status}
            </span>
            <Show when={props.job?.status === "RUNNING"}>
              <span class="w-3 h-3 border-2 border-[#e0f2fe] border-t-[#0ea5e9] rounded-full animate-spin"></span>
            </Show>
          </div>
          <Show when={props.job?.startTime}>
            <div class="flex items-center gap-2">
              <span class="font-medium text-[#6c757d] dark:text-[#aaa] min-w-[60px]">
                Started:
              </span>
              <span class="text-[#495057] dark:text-[#eee]">
                {props.onFormatDateTime(props.job!.startTime!.toISOString())}
              </span>
            </div>
          </Show>
          <Show when={props.job?.endTime}>
            <div class="flex items-center gap-2">
              <span class="font-medium text-[#6c757d] dark:text-[#aaa] min-w-[60px]">
                Ended:
              </span>
              <span class="text-[#495057] dark:text-[#eee]">
                {props.onFormatDateTime(props.job!.endTime!.toISOString())}
              </span>
            </div>
          </Show>
        </div>

        {/* Show message for failed jobs (only when NOT showing retry options above) */}
        <Show when={props.job?.status === "FAILED" && !props.showRetryOptions}>
          <div class="mt-3 p-3 bg-[#fff3cd] dark:bg-[#3a2e1a] border border-[#ffc107] dark:border-[#f57c00] rounded-md">
            <p class="m-0 text-sm text-[#856404] dark:text-[#ffb74d] leading-relaxed">
              <strong class="font-bold">Deployment failed.</strong> Please check
              the build logs in the AWS Console to see what went wrong. You can
              retry the deployment after fixing any issues.
            </p>
          </div>
        </Show>

        {props.children}
      </div>
    </Show>
  );
}
