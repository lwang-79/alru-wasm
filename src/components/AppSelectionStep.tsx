import { createSignal, onMount, Show, For } from "solid-js";
import type {
  AmplifyApp,
  AmplifyBranch,
  LambdaFunction,
  NodeVersion,
} from "../types";
import { appState, setAppState, clearDownstreamState } from "../store/appStore";
import { RuntimeService } from "../services/runtime/runtimeService";
import { CredentialService } from "../services/aws/credentialService";
import { AmplifyService } from "../services/aws/amplifyService";
import { LambdaService } from "../services/aws/lambdaService";
import { GitApiService } from "../services/git/gitApiService";
import { WizardStep } from "./common/WizardStep";
import "./shared-tailwind.css";

interface AppSelectionStepProps {
  onComplete?: () => void;
  onBack?: () => void;
}

export function AppSelectionStep(props: AppSelectionStepProps) {
  const [isLoadingApps, setIsLoadingApps] = createSignal(false);
  const [isLoadingBranches, setIsLoadingBranches] = createSignal(false);
  const [isLoadingFunctions, setIsLoadingFunctions] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Initialize services
  const runtimeService = new RuntimeService();
  const credentialService = new CredentialService();
  const amplifyService = new AmplifyService();
  const lambdaService = new LambdaService();
  const gitApiService = new GitApiService();

  // Load supported Node.js runtimes
  const loadSupportedRuntimes = async () => {
    try {
      const versions = await runtimeService.getSupportedRuntimes();

      // Convert to NodeVersion format
      const nodeVersions: NodeVersion[] = versions.map((v) => ({
        version: `v${v}`,
        lts: null,
        start: "",
        end: "",
        is_supported: true,
      }));

      setAppState("runtimeInfo", "supportedVersions", nodeVersions);

      // Also get the target runtime
      const targetRuntime = await runtimeService.getTargetRuntime();
      setAppState("runtimeInfo", "targetRuntime", targetRuntime);

      console.log(
        "Loaded supported versions:",
        nodeVersions.map((v) => v.version),
      );
      console.log("Target runtime:", targetRuntime);
    } catch (e) {
      console.error("Failed to load supported runtimes:", e);
    }
  };

  // Load Amplify apps when component mounts
  const loadApps = async () => {
    const creds = credentialService.getCredentials();

    if (!creds) {
      setError("Please configure AWS credentials first.");
      return;
    }

    setIsLoadingApps(true);
    setError(null);
    // Clear existing selections when reloading apps
    setAppState("amplifyResources", "selectedApp", null);
    setAppState("amplifyResources", "branches", []);
    setAppState("amplifyResources", "selectedBranch", null);
    setAppState("amplifyResources", "lambdaFunctions", []);

    try {
      const apps = await amplifyService.listApps(creds.region);

      // Convert and filter based on repository provider
      const provider = appState.repositoryProvider;
      const formattedApps: AmplifyApp[] = apps
        .map((app) => ({
          app_id: app.appId,
          name: app.name,
          repository: app.repository || "",
          environment_variables: app.environmentVariables,
        }))
        .filter((app) => {
          if (provider === "GitHub") {
            return app.repository.includes("github.com");
          } else if (provider === "CodeCommit") {
            return app.repository.includes("codecommit");
          }
          return true;
        });

      // Show some feedback if no apps found for selected provider
      if (formattedApps.length === 0 && apps.length > 0) {
        setError(`No ${provider} applications found in this region. You may have selected the wrong repository provider.`);
      }

      // Replace with fresh data
      setAppState("amplifyResources", "apps", [...formattedApps]);
    } catch (e) {
      setError(`Failed to load Amplify apps: ${e}`);
    } finally {
      setIsLoadingApps(false);
    }
  };

  // Load branches when an app is selected
  const loadBranches = async (appId: string) => {
    const creds = credentialService.getCredentials();

    if (!creds) {
      setError("Please configure AWS credentials first.");
      return;
    }

    setIsLoadingBranches(true);
    // Clear branches and related state first
    setAppState("amplifyResources", "branches", []);
    setAppState("amplifyResources", "selectedBranch", null);
    setAppState("amplifyResources", "lambdaFunctions", []);

    try {
      const branches = await amplifyService.listBranches(creds.region, appId);

      // Convert to the format expected by the UI
      let formattedBranches: AmplifyBranch[] = branches.map((branch) => ({
        branch_name: branch.branchName,
        stack_arn: branch.backendEnvironmentArn,
        backend_environment_name: branch.backendEnvironmentArn
          ? branch.backendEnvironmentArn.split("/").pop() || ""
          : "",
        environment_variables: branch.environmentVariables,
        is_protected: false,
        protection_info: null,
      }));

      // Check branch protection for each branch
      const selectedApp = appState.amplifyResources.selectedApp;
      if (selectedApp && selectedApp.repository) {
        // Note: This requires a GitHub token to be stored somewhere
        // For now, we'll skip branch protection checks if no token is available
        // TODO: Add GitHub token storage/retrieval mechanism

        const branchesWithProtection = await Promise.all(
          formattedBranches.map(async (branch) => {
            try {
              // Skip branch protection check for now as it requires GitHub token
              // which isn't stored in the current implementation
              return branch;
            } catch (e) {
              console.error(
                `Failed to check protection for branch ${branch.branch_name}:`,
                e,
              );
              return branch; // Return original branch if check fails
            }
          }),
        );

        setAppState("amplifyResources", "branches", [
          ...branchesWithProtection,
        ]);
      } else {
        // No repository URL, can't check protection
        setAppState("amplifyResources", "branches", [...formattedBranches]);
      }
    } catch (e) {
      setError(`Failed to load branches: ${e}`);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  // Load Lambda functions when a branch is selected
  const loadLambdaFunctions = async (branch: AmplifyBranch) => {
    const creds = credentialService.getCredentials();
    const selectedApp = appState.amplifyResources.selectedApp;

    if (!creds || !selectedApp) {
      return;
    }

    setIsLoadingFunctions(true);
    // Clear functions first
    setAppState("amplifyResources", "lambdaFunctions", []);

    try {
      // Get supported versions to determine outdated status
      const supportedVersions = appState.runtimeInfo.supportedVersions
        .filter((v: NodeVersion) => v.is_supported)
        .map((v: NodeVersion) => {
          const match = v.version.match(/v?(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((v: number) => v > 0);

      console.log("Supported versions being passed:", supportedVersions);
      console.log("Backend environment name:", branch.backend_environment_name);

      // Get Lambda functions with repository name for auto-managed detection
      const repoName = selectedApp.repository?.split('/').pop() || selectedApp.name;
      const functions = await lambdaService.getLambdaFunctions(
        creds.region,
        selectedApp.app_id,
        branch.branch_name,
        branch.backend_environment_name,
        repoName,
      );

      // Get target runtime for comparison
      const targetRuntime = appState.runtimeInfo.targetRuntime;
      const targetVersion = targetRuntime
        ? runtimeService.extractMajorVersion(targetRuntime)
        : 20;

      // Convert to the format expected by the UI and check if outdated
      const formattedFunctions: LambdaFunction[] = functions.map((func) => {
        const currentVersion = runtimeService.extractMajorVersion(func.runtime);
        const isOutdated =
          func.runtime.startsWith("nodejs") && currentVersion < targetVersion;

        return {
          arn: func.arn,
          name: func.name,
          friendly_name: func.name,
          runtime: func.runtime,
          description: null,
          is_outdated: isOutdated,
          is_auto_managed: func.isAutoManaged,
        };
      });

      // Replace with fresh data
      setAppState("amplifyResources", "lambdaFunctions", [
        ...formattedFunctions,
      ]);
    } catch (e) {
      setError(`Failed to load Lambda functions: ${e}`);
    } finally {
      setIsLoadingFunctions(false);
    }
  };

  onMount(() => {
    loadSupportedRuntimes();

    // Skip re-fetching apps if data already exists in store
    if (appState.amplifyResources.apps.length > 0) {
      // Data already loaded, no need to fetch again
      return;
    }

    loadApps();
  });

  // Handle app selection
  const handleAppSelect = (app: AmplifyApp) => {
    const previousAppId = appState.amplifyResources.selectedApp?.app_id;

    // Only clear downstream state if app actually changed
    if (app.app_id !== previousAppId) {
      // Clear repository state since we're selecting a different app
      clearDownstreamState(2);
      // Clear any error message
      setError(null);
    }

    // Create a copy to avoid storing a proxy reference
    setAppState("amplifyResources", "selectedApp", { ...app });
    loadBranches(app.app_id);
  };

  // Handle branch selection
  const handleBranchSelect = (branch: AmplifyBranch) => {
    const previousBranchName =
      appState.amplifyResources.selectedBranch?.branch_name;

    // Only clear downstream state if branch actually changed
    if (branch.branch_name !== previousBranchName) {
      // Clear repository state since we're selecting a different branch
      clearDownstreamState(2);
    }

    // Allow selecting protected branches to view functions, but show warning
    if (branch.is_protected) {
      setError(
        `Cannot process protected branch "${branch.branch_name}". ${branch.protection_info || "This branch does not allow direct pushes."} Please select another branch.`,
      );
    } else {
      // Clear any previous error
      setError(null);
    }

    // Create a copy to avoid storing a proxy reference
    setAppState("amplifyResources", "selectedBranch", { ...branch });
    loadLambdaFunctions(branch);
  };

  const canContinue = () => {
    // Must have app and branch selected, and have functions that need updates
    const hasSelection =
      appState.amplifyResources.selectedApp !== null &&
      appState.amplifyResources.selectedBranch !== null;
    const hasFunctions = appState.amplifyResources.lambdaFunctions.length > 0;
    const hasOutdatedFunctions = getOutdatedCount() > 0;

    // Cannot continue if selected branch is protected
    const isProtectedBranch =
      appState.amplifyResources.selectedBranch?.is_protected || false;

    return (
      hasSelection && hasFunctions && hasOutdatedFunctions && !isProtectedBranch
    );
  };

  const handleContinue = () => {
    if (canContinue() && props.onComplete) {
      props.onComplete();
    }
  };

  const handleBack = () => {
    if (props.onBack) {
      props.onBack();
    }
  };

  const getOutdatedCount = () => {
    return appState.amplifyResources.lambdaFunctions.filter(
      (f: LambdaFunction) => f.is_outdated,
    ).length;
  };

  const getNonNodejsCount = () => {
    return appState.amplifyResources.lambdaFunctions.filter(
      (f: LambdaFunction) => !f.runtime.startsWith("nodejs"),
    ).length;
  };

  const isLoading = () =>
    isLoadingApps() || isLoadingBranches() || isLoadingFunctions();

  return (
    <WizardStep
      title="Select Amplify App & Branch"
      description="Choose the Amplify application and branch you want to update."
      onNext={handleContinue}
      onBack={handleBack}
      nextDisabled={!canContinue() || isLoading()}
      isLoading={isLoading()}
    >
      <div class="space-y-8">
        {/* Apps Section */}
        <div class="apps-container">
          <div class="flex flex-col gap-2 mb-6">
            <label for="app-select" class="font-semibold text-[0.95rem]">Amplify Application</label>
            <Show
              when={!isLoadingApps()}
              fallback={
                <div class="flex items-center gap-2 p-3 text-[#666] dark:text-[#aaa] text-[0.95rem]">
                  <span class="w-4 h-4 border-2 border-[#e0e0e0] border-t-[#396cd8] rounded-full animate-spin"></span>
                  Loading Amplify apps...
                </div>
              }
            >
              <Show
                when={appState.amplifyResources.apps.length > 0}
                fallback={
                  <div class="text-center p-6 text-[#666] dark:text-[#aaa] bg-[#f5f5f5] dark:bg-[#333] rounded-lg text-sm">
                    No Amplify apps found in {credentialService.getRegion()}.
                  </div>
                }
              >
                <select
                  id="app-select"
                  class="p-3 border border-[#ccc] dark:border-[#444] rounded-md text-base bg-white dark:bg-[#2a2a2a] cursor-pointer transition-all duration-200 hover:border-[#396cd8] focus:outline-none focus:border-[#396cd8] focus:ring-3 focus:ring-[rgba(57,108,216,0.15)] disabled:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:text-[#999]"
                  value={appState.amplifyResources.selectedApp?.app_id || ""}
                  onChange={(e) => {
                    const appId = e.currentTarget.value;
                    const app = appState.amplifyResources.apps.find(
                      (a: AmplifyApp) => a.app_id === appId,
                    );
                    if (app) {
                      handleAppSelect(app);
                    }
                  }}
                >
                  <option value="">Select an application...</option>
                  <For each={appState.amplifyResources.apps}>
                    {(app) => (
                      <option value={app.app_id}>
                        {app.name} ({app.app_id})
                      </option>
                    )}
                  </For>
                </select>
              </Show>
            </Show>
            <Show when={appState.amplifyResources.selectedApp?.repository}>
              <p class="text-[0.85rem] text-[#888] m-0">
                Repository:{" "}
                <a
                  href={appState.amplifyResources.selectedApp?.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-medium text-[#396cd8] hover:underline"
                >
                  {appState.amplifyResources.selectedApp?.repository}
                </a>
              </p>
            </Show>
          </div>
        </div>

        {/* Branches Section */}
        <Show when={appState.amplifyResources.selectedApp}>
          <div class="mb-4">
            <h3 class="text-[1.1rem] font-semibold mb-4 text-[#333] dark:text-[#eee]">Branches</h3>
            <Show
              when={!isLoadingBranches()}
              fallback={
                <div class="flex items-center gap-2 p-3 text-[#666] dark:text-[#aaa] text-[0.95rem]">
                  <span class="w-4 h-4 border-2 border-[#e0e0e0] border-t-[#396cd8] rounded-full animate-spin"></span>
                  Loading branches...
                </div>
              }
            >
              <Show
                when={appState.amplifyResources.branches.length > 0}
                fallback={
                  <div class="text-[#888] italic">
                    No branches found for this app.
                  </div>
                }
              >
                <div class="flex flex-wrap gap-2 mb-4">
                  <For each={appState.amplifyResources.branches}>
                    {(branch) => (
                      <button
                        class={`px-4 py-2 border-2 rounded-[20px] transition-all duration-200 text-[0.9rem] flex items-center gap-2 
                          ${appState.amplifyResources.selectedBranch?.branch_name === branch.branch_name
                            ? "border-[#396cd8] bg-[#396cd8] text-white"
                            : branch.is_protected
                              ? "border-[#f57c00] bg-[#fff8f0] dark:bg-[#3a2a1a] text-[#333] dark:text-[#ffb74d] hover:bg-[#ffe8d0] dark:hover:bg-[#4a3a2a]"
                              : "border-[#e0e0e0] dark:border-[#444] bg-white dark:bg-[#2a2a2a] text-[#333] dark:text-[#eee] hover:border-[#396cd8] hover:bg-[#f8faff] dark:hover:bg-[#333]"}`}
                        onClick={() => handleBranchSelect(branch)}
                        title={
                          branch.is_protected
                            ? branch.protection_info || "Protected branch"
                            : undefined
                        }
                      >
                        {branch.branch_name}
                        {branch.is_protected && (
                          <span class="text-[0.85rem]">🔒</span>
                        )}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </Show>

            {/* Error message for protected branch selection */}
            <Show when={error()}>
              <div class="p-4 rounded-lg my-4 border border-[#fcc] bg-[#fee] text-[#c00] dark:bg-[#3a1a1a] dark:text-[#ff6b6b] dark:border-[#f44336]">{error()}</div>
            </Show>
          </div>
        </Show>

        {/* Lambda Functions Section */}
        <Show when={appState.amplifyResources.selectedBranch}>
          <div class="mb-4">
            <h3 class="text-[1.1rem] font-semibold mb-4 text-[#333] dark:text-[#eee]">Lambda Functions Runtime Analysis</h3>
            <Show
              when={!isLoadingFunctions()}
              fallback={
                <div class="flex items-center gap-2 p-3 text-[#666] dark:text-[#aaa] text-[0.95rem]">
                  <span class="w-4 h-4 border-2 border-[#e0e0e0] border-t-[#396cd8] rounded-full animate-spin"></span>
                  Analyzing Lambda functions...
                </div>
              }
            >
              <Show
                when={appState.amplifyResources.lambdaFunctions.length > 0}
                fallback={
                  <div class="text-center p-6 text-[#666] dark:text-[#aaa] bg-[#f5f5f5] dark:bg-[#333] rounded-lg text-sm">
                    No Lambda functions found for this branch.
                  </div>
                }
              >
                <div class="flex flex-col gap-3">
                  <For each={appState.amplifyResources.lambdaFunctions}>
                    {(func) => {
                      const isNodejs = func.runtime.startsWith("nodejs");

                      let statusClasses = "border-[#e0e0e0] dark:border-[#444]";
                      if (!isNodejs) {
                        statusClasses = "border-[#9e9e9e] bg-[#fafafa] dark:bg-[#2a2a2a] dark:border-[#757575]";
                      } else if (func.is_outdated) {
                        statusClasses = "border-[#f57c00] bg-[#fff8f0] dark:bg-[#3a2a1a] dark:border-[#f57c00]";
                      } else {
                        statusClasses = "border-[#4caf50] bg-[#f0f8f0] dark:bg-[#1a2a1a] dark:border-[#4caf50]";
                      }

                      return (
                        <div
                          class={`border rounded-lg p-4 flex justify-between items-center ${statusClasses}`}
                          title={func.description || undefined}
                        >
                          <div class="flex-1">
                            <div class="font-semibold text-[0.95rem] text-[#333] dark:text-[#eee] mb-1 flex flex-col items-start gap-2">
                              {func.name}
                              <Show
                                when={func.is_auto_managed}
                                fallback={
                                  <span
                                    class="inline-block px-2 py-0.5 text-[0.7rem] bg-[#fbe9cb] text-[#e65100] dark:bg-[#3a2a1a] dark:text-[#ffb74d] rounded-[10px] font-medium"
                                    title="This function is custom function"
                                  >
                                    Custom Function
                                  </span>
                                }
                              >
                                <span
                                  class="inline-block px-2 py-0.5 text-[0.7rem] bg-[#e3f2fd] text-[#1976d2] dark:bg-[#1a3a5c] dark:text-[#64b5f6] rounded-[10px] font-medium"
                                  title="This function is auto-managed by Amplify and will be updated when you upgrade Amplify CLI (Gen1) or backend dependencies (Gen2)"
                                >
                                  Auto Managed
                                </span>
                              </Show>
                            </div>
                          </div>
                          <div class="flex flex-col items-end gap-1">
                            <span class={`px-3 py-1 rounded-md text-[0.85rem] font-mono text-white 
                              ${!isNodejs ? "bg-[#9e9e9e]" : func.is_outdated ? "bg-[#f57c00]" : "bg-[#4caf50]"}`}>
                              {func.runtime}
                            </span>
                            <Show when={!isNodejs}>
                              <span class="text-[0.8rem] text-[#757575] dark:text-[#9e9e9e] italic">
                                <Show
                                  when={!func.is_auto_managed}
                                  fallback="Will update with Amplify upgrade"
                                >
                                  Not a Node.js runtime
                                </Show>
                              </span>
                            </Show>
                            <Show
                              when={
                                isNodejs &&
                                func.is_outdated &&
                                appState.runtimeInfo.targetRuntime
                              }
                            >
                              <span class="text-[0.8rem] text-[#666] dark:text-[#aaa]">
                                <Show
                                  when={func.is_auto_managed}
                                  fallback={
                                    <>
                                      Recommended:{" "}
                                      <strong class="text-[#4caf50] dark:text-[#66bb6a]">
                                        {appState.runtimeInfo.targetRuntime}
                                      </strong>
                                    </>
                                  }
                                >
                                  Will update with Amplify upgrade
                                </Show>
                              </span>
                            </Show>
                            <Show when={isNodejs && !func.is_outdated}>
                              <span class="text-[0.8rem] text-[#2e7d32] dark:text-[#66bb6a]">
                                ✓ Supported
                              </span>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>

                {/* Summary */}
                <div class="mt-4 p-3 bg-[#f5f5f5] dark:bg-[#2a2a2a] rounded-md flex flex-wrap gap-4 text-[0.9rem]">
                  <Show when={getOutdatedCount() > 0}>
                    <span class="text-[#e65100] dark:text-[#ffb74d]">
                      {getOutdatedCount()} function(s) with outdated Node.js
                      runtime
                    </span>
                  </Show>
                  <Show when={getNonNodejsCount() > 0}>
                    <span class="text-[#757575] dark:text-[#9e9e9e]">
                      {getNonNodejsCount()} non-Node.js function(s)
                    </span>
                  </Show>
                  <Show
                    when={getOutdatedCount() === 0 && getNonNodejsCount() === 0}
                  >
                    <span class="text-[#2e7d32] dark:text-[#66bb6a]">
                      ✓ All Node.js functions are using supported runtimes
                    </span>
                  </Show>
                </div>
              </Show>
            </Show>
          </div>
        </Show>

        {/* Selection Summary */}
        <Show
          when={
            appState.amplifyResources.selectedApp &&
            appState.amplifyResources.selectedBranch
          }
        >
          <div class="flex items-center gap-3 p-4 bg-[#f0f8f0] border border-[#4caf50] rounded-lg">
            <span class="w-6 h-6 bg-[#4caf50] text-white rounded-full flex items-center justify-center font-bold text-sm">✓</span>
            <span class="dark:text-[#2e7d32]">
              Selected{" "}
              <strong>{appState.amplifyResources.selectedApp?.name}</strong> /{" "}
              <strong>
                {appState.amplifyResources.selectedBranch?.branch_name}
              </strong>
              <Show when={getOutdatedCount() > 0}>
                {" "}
                — {getOutdatedCount()} function(s) need runtime updates
              </Show>
            </span>
          </div>
        </Show>

        <Show
          when={
            !canContinue() &&
            !isLoading() &&
            appState.amplifyResources.selectedBranch
          }
        >
          <p class="p-4 rounded-lg m-0 border border-[#ffcc80] bg-[#fff3e0] text-[#f57c00] dark:bg-[#3a2a1a] dark:text-[#ffb74d] dark:border-[#f57c00]">
            <Show
              when={appState.amplifyResources.lambdaFunctions.length === 0}
              fallback="All functions are using supported runtimes. No updates needed."
            >
              No Lambda functions found for this branch.
            </Show>
          </p>
        </Show>

        <Show
          when={
            !appState.amplifyResources.selectedApp ||
            !appState.amplifyResources.selectedBranch
          }
        >
          <Show when={!isLoading()}>
            <p class="p-4 rounded-lg m-0 border border-[#baeffd] bg-[#f0f9ff] text-[#0369a1] dark:bg-[#1a2a3a] dark:text-[#7dd3fc] dark:border-[#0369a1]">
              Please select an app and branch to continue.
            </p>
          </Show>
        </Show>
      </div>
    </WizardStep>
  );
}

export default AppSelectionStep;
