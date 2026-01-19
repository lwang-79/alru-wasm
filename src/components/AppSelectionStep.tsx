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
import "./shared.css";
import "./AppSelectionStep.css";

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

      // Convert to the format expected by the UI
      const formattedApps: AmplifyApp[] = apps.map((app) => ({
        app_id: app.appId,
        name: app.name,
        repository: app.repository,
        environment_variables: app.environmentVariables,
      }));

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

      // Get Lambda functions
      const functions = await lambdaService.getLambdaFunctions(
        creds.region,
        selectedApp.app_id,
        branch.branch_name,
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
          is_auto_managed: false, // Lambda service doesn't provide this info yet
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
    <div class="step-container wide app-selection-step">
      <h2>Select Amplify App & Branch</h2>
      <p class="step-description">
        Choose the Amplify application and branch you want to update.
      </p>

      {/* Apps Section */}
      <div class="apps-container">
        <div class="form-group">
          <label for="app-select">Amplify Application</label>
          <Show
            when={!isLoadingApps()}
            fallback={
              <div class="loading-inline">
                <span class="spinner-small"></span>
                Loading Amplify apps...
              </div>
            }
          >
            <Show
              when={appState.amplifyResources.apps.length > 0}
              fallback={
                <div class="no-apps-message">
                  No Amplify apps found in {credentialService.getRegion()}.
                </div>
              }
            >
              <select
                id="app-select"
                value={appState.amplifyResources.selectedApp?.app_id || ""}
                onChange={(e) => {
                  const appId = e.target.value;
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
            <p class="field-hint">
              Repository:{" "}
              <a
                href={appState.amplifyResources.selectedApp?.repository}
                target="_blank"
                rel="noopener noreferrer"
              >
                {appState.amplifyResources.selectedApp?.repository}
              </a>
            </p>
          </Show>
        </div>
      </div>

      {/* Branches Section */}
      <Show when={appState.amplifyResources.selectedApp}>
        <div class="branches-container">
          <h3 class="section-title">Branches</h3>
          <Show
            when={!isLoadingBranches()}
            fallback={
              <div class="loading-inline">
                <span class="spinner-small"></span>
                Loading branches...
              </div>
            }
          >
            <Show
              when={appState.amplifyResources.branches.length > 0}
              fallback={
                <div class="no-branches-message">
                  No branches found for this app.
                </div>
              }
            >
              <div class="branches-list">
                <For each={appState.amplifyResources.branches}>
                  {(branch) => (
                    <button
                      class={`branch-chip ${
                        appState.amplifyResources.selectedBranch
                          ?.branch_name === branch.branch_name
                          ? "selected"
                          : ""
                      } ${branch.is_protected ? "protected" : ""}`}
                      onClick={() => handleBranchSelect(branch)}
                      title={
                        branch.is_protected
                          ? branch.protection_info || "Protected branch"
                          : undefined
                      }
                    >
                      {branch.branch_name}
                      {branch.is_protected && (
                        <span class="protected-icon">🔒</span>
                      )}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          {/* Error message for protected branch selection */}
          <Show when={error()}>
            <div class="message error">{error()}</div>
          </Show>
        </div>
      </Show>

      {/* Lambda Functions Section */}
      <Show when={appState.amplifyResources.selectedBranch}>
        <div class="lambda-container">
          <h3 class="section-title">Lambda Functions Runtime Analysis</h3>
          <Show
            when={!isLoadingFunctions()}
            fallback={
              <div class="loading-inline">
                <span class="spinner-small"></span>
                Analyzing Lambda functions...
              </div>
            }
          >
            <Show
              when={appState.amplifyResources.lambdaFunctions.length > 0}
              fallback={
                <div class="no-functions-message">
                  No Lambda functions found for this branch.
                </div>
              }
            >
              <div class="lambda-list">
                <For each={appState.amplifyResources.lambdaFunctions}>
                  {(func) => {
                    const isNodejs = func.runtime.startsWith("nodejs");

                    let statusClass = "current";
                    if (!isNodejs) {
                      statusClass = "non-nodejs";
                    } else if (func.is_outdated) {
                      statusClass = "outdated";
                    }

                    return (
                      <div
                        class={`lambda-card ${statusClass}`}
                        title={func.description || undefined}
                      >
                        <div class="lambda-info">
                          <div class="lambda-name">{func.name}</div>
                          <Show
                            when={func.is_auto_managed}
                            fallback={
                              <span
                                class="custom-function-badge"
                                title="This function is custom function"
                              >
                                Custom Function
                              </span>
                            }
                          >
                            <span
                              class="auto-managed-badge"
                              title="This function is auto-managed by Amplify and will be updated when you upgrade Amplify CLI (Gen1) or backend dependencies (Gen2)"
                            >
                              Auto Managed
                            </span>
                          </Show>
                        </div>
                        <div class="lambda-status">
                          <span class={`runtime-badge ${statusClass}`}>
                            {func.runtime}
                          </span>
                          <Show when={!isNodejs}>
                            <span class="status-hint">
                              <Show
                                when={!func.is_auto_managed}
                                fallback={
                                  <span class="status-hint non-nodejs-hint">
                                    Will update with Amplify upgrade
                                  </span>
                                }
                              >
                                <span class="status-hint non-nodejs-hint">
                                  Not a Node.js runtime
                                </span>
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
                            <span class="status-hint">
                              <Show
                                when={func.is_auto_managed}
                                fallback={
                                  <>
                                    Recommended:{" "}
                                    <strong>
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
                            <span class="status-hint current-hint">
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
              <div class="lambda-summary">
                <Show when={getOutdatedCount() > 0}>
                  <span class="summary-outdated">
                    {getOutdatedCount()} function(s) with outdated Node.js
                    runtime
                  </span>
                </Show>
                <Show when={getNonNodejsCount() > 0}>
                  <span class="summary-non-nodejs">
                    {getNonNodejsCount()} non-Node.js function(s)
                  </span>
                </Show>
                <Show
                  when={getOutdatedCount() === 0 && getNonNodejsCount() === 0}
                >
                  <span class="summary-all-good">
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
        <div class="selection-summary">
          <span class="summary-icon">✓</span>
          <span>
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

      <div class="actions">
        <button onClick={handleBack} class="secondary-button">
          Back
        </button>
        <button
          onClick={handleContinue}
          class="primary-button"
          disabled={!canContinue() || isLoading()}
        >
          Contine
        </button>
      </div>

      <Show
        when={
          !canContinue() &&
          !isLoading() &&
          appState.amplifyResources.selectedBranch
        }
      >
        <p class="message warning">
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
          <p class="message warning">
            Please select an app and branch to continue.
          </p>
        </Show>
      </Show>
    </div>
  );
}

export default AppSelectionStep;
