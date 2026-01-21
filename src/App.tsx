import { Show, For } from "solid-js";
import {
  appState,
  setAppState,
  checkAndResetPushStepIfNeeded,
  updatePushStepContext,
} from "./store/appStore";
import { CredentialStep } from "./components/CredentialStep";
import { AppSelectionStep } from "./components/AppSelectionStep";
import { CloneUpdateStep } from "./components/CloneUpdateStep";
import { PushStep } from "./components/PushStep";

function App() {
  const currentStep = () => appState.wizard.currentStep;
  const steps = () => appState.wizard.steps;

  // Function to scroll the step content to top
  const scrollToTop = () => {
    const scrollableWrapper = document.querySelector(".flex-1.overflow-y-auto");
    if (scrollableWrapper) {
      scrollableWrapper.scrollTop = 0;
    }
  };

  const handleStepComplete = (stepIndex: number) => {
    // Mark current step as complete
    setAppState("wizard", "steps", stepIndex, "isComplete", true);

    // Enable next step if exists
    if (stepIndex + 1 < steps().length) {
      setAppState("wizard", "steps", stepIndex + 1, "isEnabled", true);
      setAppState("wizard", "currentStep", stepIndex + 1);

      // If moving to Push step (step 3), update context
      if (stepIndex + 1 === 3) {
        updatePushStepContext();
      }

      // Scroll to top when navigating to next step
      setTimeout(scrollToTop, 0);
    }
  };

  const goToPreviousStep = () => {
    const current = currentStep();
    if (current > 0) {
      // Block navigation if any operation is running
      if (appState.repository.isOperationRunning) {
        console.log(`[goToPreviousStep] Blocked - operation is running`);
        return;
      }

      setAppState("wizard", "currentStep", current - 1);
      setTimeout(scrollToTop, 0);
    }
  };

  const goToStep = (stepIndex: number) => {
    const step = steps()[stepIndex];
    console.log(
      `[goToStep] Called with index ${stepIndex}`,
      `| enabled: ${step.isEnabled}`,
      `| complete: ${step.isComplete}`,
      `| current: ${currentStep()}`,
      `| repoPath: ${appState.repository.clonePath}`,
      `| operationRunning: ${appState.repository.isOperationRunning}`,
    );

    // Block navigation if any operation is running
    if (appState.repository.isOperationRunning) {
      console.log(`[goToStep] Blocked - operation is running`);
      return;
    }

    if (!step.isEnabled) {
      console.log(
        `[goToStep] Step ${stepIndex} is DISABLED, blocking navigation`,
      );
      return;
    }

    if (stepIndex === currentStep()) {
      console.log(`[goToStep] Already on step ${stepIndex}, ignoring`);
      return; // Already on this step
    }

    // If repository was cleaned up and trying to navigate to Push step without a repo, block it
    // But allow navigation to Clone & Update step (step 2) to start a new workflow
    const repoCleanedUp =
      !appState.repository.clonePath &&
      appState.repository.operationStatus.cloneComplete === false;

    if (stepIndex === 3 && repoCleanedUp) {
      console.log(
        `[goToStep] Step ${stepIndex} blocked - no repository exists for Push step`,
      );
      return; // Can't go to Push step without a repository
    }

    // Block navigation if step is disabled or operation is running
    if (!step.isEnabled || appState.repository.isOperationRunning) {
      console.log(`[goToStep] Step ${stepIndex} blocked - disabled or operation running`);
      return;
    }

    if (stepIndex === currentStep()) {
      console.log(`[goToStep] Already on step ${stepIndex}, ignoring`);
      return;
    }

    console.log(`[goToStep] Navigating to step ${stepIndex}`);
    setAppState("wizard", "currentStep", stepIndex);

    // If navigating to Push step (step 3), check and update context
    if (stepIndex === 3) {
      checkAndResetPushStepIfNeeded();
      updatePushStepContext();
    }

    // Scroll to top when navigating to any step
    setTimeout(scrollToTop, 0);
  };

  return (
    <main class="flex flex-col h-screen w-full mx-auto p-0 overflow-hidden">
      <header class="text-center p-4 bg-[#f6f6f6] dark:bg-[#1a1a1a] flex-shrink-0 [WebkitAppRegion:drag] max-w-[900px] mx-auto w-full">
        <h1 class="m-0 mb-2 text-[1.8rem] text-[#1a1a1a] dark:text-[#f6f6f6] font-bold [WebkitAppRegion:no-drag]">
          Amplify Lambda Runtime Updater
        </h1>
        <p class="text-[#666] dark:text-[#999] m-0 [WebkitAppRegion:no-drag]">
          Update Lambda Node.js runtimes in your Amplify projects
        </p>
      </header>

      {/* Step Indicator */}
      <nav class="flex justify-center gap-2 pb-4 flex-wrap bg-[#f6f6f6] dark:bg-[#1a1a1a] flex-shrink-0 [WebkitAppRegion:no-drag] max-w-[900px] mx-auto w-full">
        <For each={steps()}>
          {(step, index) => {
            const stepIndex = index();
            const isDisabled = () =>
              !steps()[stepIndex].isEnabled ||
              appState.repository.isOperationRunning;

            const isActive = () => currentStep() === stepIndex;
            const isComplete = () => step.isComplete;

            return (
              <button
                class={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer transition-all duration-200 
                  ${isActive() ? "border-[#396cd8] dark:border-[#5b8def] bg-[#f0f5ff] dark:bg-[#2a3a5a]" : "border-[#ddd] dark:border-[#444] bg-white dark:bg-[#2a2a2a]"} 
                  ${isComplete() ? "border-[#22c55e]" : ""} 
                  ${isDisabled() ? "opacity-50 dark:opacity-40 cursor-not-allowed pointer-events-none bg-[#f5f5f5] dark:bg-[#1a1a1a]" : "hover:border-[#396cd8] dark:hover:border-[#5b8def]"}
                `}
                onClick={(e) => {
                  console.log(
                    `[Button Click] Step ${stepIndex} clicked`,
                    `| enabled: ${steps()[stepIndex].isEnabled}`,
                    `| operationRunning: ${appState.repository.isOperationRunning}`,
                    `| disabled attr: ${e.currentTarget.disabled}`,
                  );
                  if (isDisabled()) {
                    console.log(
                      `[Button Click] Step ${stepIndex} is disabled, ignoring click`,
                    );
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  goToStep(stepIndex);
                }}
                disabled={isDisabled()}
                aria-disabled={isDisabled()}
              >
                <span
                  class={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold
                    ${isActive() ? "bg-[#396cd8] dark:bg-[#5b8def] text-white" : "bg-[#e5e5e5] dark:bg-[#444] dark:text-[#f6f6f6]"}
                    ${isComplete() ? "bg-[#22c55e] text-white" : ""}
                  `}
                >
                  {step.isComplete ? "✓" : stepIndex + 1}
                </span>
                <span class="text-sm font-medium">{step.title}</span>
              </button>
            );
          }}
        </For>
      </nav>

      {/* Step Content Wrapper - Scrollable area */}
      <div class="flex-1 overflow-y-auto overflow-x-hidden w-full bg-[#f6f6f6] dark:bg-[#1a1a1a]">
        <div class="max-w-[900px] mx-auto mb-8 p-8 min-h-[calc(100vh-200px)] bg-white dark:bg-[#2a2a2a]">
          <Show when={currentStep() === 0}>
            <CredentialStep onComplete={() => handleStepComplete(0)} />
          </Show>

          <Show when={currentStep() === 1}>
            <AppSelectionStep
              onComplete={() => handleStepComplete(1)}
              onBack={goToPreviousStep}
            />
          </Show>

          <Show when={currentStep() === 2}>
            <CloneUpdateStep
              onComplete={() => handleStepComplete(2)}
              onBack={goToPreviousStep}
            />
          </Show>

          <Show when={currentStep() === 3}>
            <PushStep
              onComplete={() => handleStepComplete(3)}
              onBack={goToPreviousStep}
            />
          </Show>
        </div>
      </div>
    </main>
  );
}

export default App;
