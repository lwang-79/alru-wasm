import { createSignal, Show } from "solid-js";
import {
  CredentialService,
  type AllCredentials,
} from "../services/aws/credentialService";
import { setAppState, clearDownstreamState } from "../store/appStore";
import { WizardStep } from "./common/WizardStep";
import "./shared-tailwind.css";

interface CredentialStepProps {
  onComplete?: () => void;
  onBack?: () => void;
}

// Common AWS regions
const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-north-1", label: "Europe (Stockholm)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
];

export function CredentialStep(props: CredentialStepProps) {
  const credentialService = new CredentialService();

  // Load existing credentials if available
  const existingCreds = credentialService.getCredentials();

  const [accessKeyId, setAccessKeyId] = createSignal(
    existingCreds?.accessKeyId || "",
  );
  const [secretAccessKey, setSecretAccessKey] = createSignal(
    existingCreds?.secretAccessKey || "",
  );
  const [sessionToken, setSessionToken] = createSignal(
    existingCreds?.sessionToken || "",
  );
  const [region, setRegion] = createSignal(
    existingCreds?.region || "us-east-1",
  );
  const [gitUsername, setGitUsername] = createSignal(
    existingCreds?.git?.username || "",
  );
  const [gitToken, setGitToken] = createSignal(existingCreds?.git?.token || "");
  const [repositoryProvider, setRepositoryProvider] = createSignal<
    "GitHub" | "CodeCommit"
  >(existingCreds?.repositoryProvider || "GitHub");
  const [error, setError] = createSignal("");
  const [isSaving, setIsSaving] = createSignal(false);

  const handleSave = async () => {
    setError("");

    // Validate inputs
    if (!accessKeyId().trim()) {
      setError("Access Key ID is required");
      return;
    }

    if (!secretAccessKey().trim()) {
      setError("Secret Access Key is required");
      return;
    }

    if (!region()) {
      setError("Region is required");
      return;
    }

    setIsSaving(true);

    try {
      const credentials: AllCredentials = {
        accessKeyId: accessKeyId().trim(),
        secretAccessKey: secretAccessKey().trim(),
        sessionToken: sessionToken().trim() || undefined,
        region: region(),
        repositoryProvider: repositoryProvider(),
      };

      // Add Git credentials if provided
      const username = gitUsername().trim();
      const token = gitToken().trim();
      if (username && token) {
        credentials.git = {
          username,
          token,
        };
      }

      await credentialService.setCredentials(credentials);

      // Update app state
      setAppState({
        awsConfig: {
          profiles: [],
          selectedProfile: null,
          regions: [region()],
          selectedRegion: region(),
        },
        repositoryProvider: repositoryProvider(),
      });

      // Clear downstream state to ensure fresh data
      clearDownstreamState(0);

      // Success - proceed to next step
      props.onComplete?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save credentials",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    credentialService.clearCredentials();
    setAccessKeyId("");
    setSecretAccessKey("");
    setSessionToken("");
    setRegion("us-east-1");
    setGitUsername("");
    setGitToken("");
    setRepositoryProvider("GitHub");
    setError("");

    // Clear downstream state when credentials are cleared
    clearDownstreamState(0);
  };

  // Handle credential input changes - reset downstream state
  const handleCredentialChange = () => {
    clearDownstreamState(0);
  };

  return (
    <WizardStep
      title="Credentials"
      description="Enter your AWS and repository credentials to begin."
      onNext={handleSave}
      nextLabel={isSaving() ? "Saving..." : "Save & Continue"}
      isLoading={isSaving()}
      nextDisabled={!accessKeyId() || !secretAccessKey() || !region()}
      actions={
        <button
          onClick={handleClear}
          class="bg-white dark:bg-[#2a2a2a] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 px-6 py-3 rounded-xl font-bold cursor-pointer transition-all duration-200 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-95"
          disabled={isSaving()}
        >
          Clear
        </button>
      }
    >
      <div class="space-y-6">
        <Show when={error()}>
          <div class="p-4 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium animate-[shake_0.4s_ease-in-out]">
            {error()}
          </div>
        </Show>

        <p class="text-[#f57c00] dark:text-[#ffb74d] text-sm bg-orange-50 dark:bg-orange-950/20 p-4 rounded-lg border border-orange-200 dark:border-orange-900/50 flex items-center gap-3">
          <span class="text-xl">⚠️</span>
          <span>
            Credentials are stored in your browser's session storage and will
            be cleared when you close the browser tab.
          </span>
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label for="accessKeyId" class="form-label">
              AWS Access Key ID <span class="text-[#dc3545]">*</span>
            </label>
            <input
              id="accessKeyId"
              type="text"
              placeholder="AKIA..."
              value={accessKeyId()}
              onInput={(e) => {
                setAccessKeyId(e.currentTarget.value);
                handleCredentialChange();
              }}
              class="form-input"
              disabled={isSaving()}
            />
          </div>

          <div>
            <label for="region" class="form-label">
              AWS Region <span class="text-[#dc3545]">*</span>
            </label>
            <select
              id="region"
              value={region()}
              onChange={(e) => {
                setRegion(e.currentTarget.value);
                handleCredentialChange();
              }}
              class="form-select"
              disabled={isSaving()}
            >
              {AWS_REGIONS.map((r) => (
                <option value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="secretAccessKey" class="form-label">
            AWS Secret Access Key <span class="text-[#dc3545]">*</span>
          </label>
          <input
            id="secretAccessKey"
            type="password"
            placeholder="Your secret access key"
            value={secretAccessKey()}
            onInput={(e) => {
              setSecretAccessKey(e.currentTarget.value);
              handleCredentialChange();
            }}
            class="form-input"
            disabled={isSaving()}
          />
        </div>

        {/* Repository Type Selector */}
        <div class="border-t border-[#eee] dark:border-[#333] pt-6">
          <div class="bg-[#f8f9fa] dark:bg-[#1a1a1a] p-6 rounded-2xl border border-[#eee] dark:border-[#333]">
            <h3 class="text-xs font-bold text-[#333] dark:text-[#eee] uppercase tracking-wider mb-4">
              Repository Provider
            </h3>
            <div class="flex flex-col sm:flex-row gap-4">
              <label
                class={`flex-1 flex items-center justify-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${repositoryProvider() === "GitHub"
                  ? "border-[#396cd8] bg-[#396cd8]/5"
                  : "border-[#eee] dark:border-[#333] hover:border-[#ccc] dark:hover:border-[#444]"
                  }`}
              >
                <input
                  type="radio"
                  name="repositoryProvider"
                  value="GitHub"
                  checked={repositoryProvider() === "GitHub"}
                  onChange={() => {
                    setRepositoryProvider("GitHub");
                    handleCredentialChange();
                  }}
                  class="hidden"
                />
                <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 496 512" height="28px" width="28px" xmlns="http://www.w3.org/2000/svg"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"></path></svg>
                <span class="font-bold">GitHub</span>
              </label>
              <label
                class={`flex-1 flex items-center justify-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${repositoryProvider() === "CodeCommit"
                  ? "border-[#396cd8] bg-[#396cd8]/5"
                  : "border-[#eee] dark:border-[#333] hover:border-[#ccc] dark:hover:border-[#444]"
                  }`}
              >
                <input
                  type="radio"
                  name="repositoryProvider"
                  value="CodeCommit"
                  checked={repositoryProvider() === "CodeCommit"}
                  onChange={() => {
                    setRepositoryProvider("CodeCommit");
                    handleCredentialChange();
                  }}
                  class="hidden"
                />

                <svg width="28px" height="28px" viewBox="0 0 80 80" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" >
                  <defs>
                    <linearGradient x1="0%" y1="100%" x2="100%" y2="0%" id="linearGradient-1">
                      <stop stop-color="#2E27AD" offset="0%"></stop>
                      <stop stop-color="#527FFF" offset="100%"></stop>
                    </linearGradient>
                  </defs>
                  <g id="Icon-Architecture/64/Arch_AWS-CodeCommit_64" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                    <g id="Icon-Architecture-BG/64/Developer-Tools" fill="url(#linearGradient-1)">
                      <rect id="Rectangle" x="0" y="0" width="80" height="80"></rect>
                    </g>
                    <path d="M26.6283186,28.1047251 L24.6106195,28.1047251 L24.6106195,21.123052 C24.6106195,20.5645181 24.9707788,20.1326518 25.5367434,20.1326518 L32.6814159,20.1256701 L32.6814159,22.1204339 L27.9499115,22.1204339 L32.8115575,26.9387857 L31.366885,28.3730208 L26.5607257,23.6454307 L26.6283186,28.1047251 Z M54.6985487,38.972198 L56.5669381,39.7990276 L50.0255575,54.2451066 L48.158177,53.418277 L54.6985487,38.972198 Z M56.0090442,49.4646553 L60.0121593,46.57524 L56.4862301,43.0395213 L57.9440177,41.6182521 L62.3032566,45.9907742 C62.5120885,46.2002244 62.6190265,46.4894652 62.5938053,46.7826954 C62.5706018,47.0759257 62.4182655,47.3452188 62.1771504,47.5177659 L57.2146195,51.0983668 L56.0090442,49.4646553 Z M46.9657168,40.6627603 L48.171292,42.2964718 L44.1096637,45.2277771 L47.6476991,48.7644932 L46.1939469,50.1877571 L41.8195752,45.815235 C41.6097345,45.6057848 41.5017876,45.3165441 41.5270088,45.0233138 C41.5502124,44.7290861 41.7015398,44.4607904 41.9436637,44.287246 L46.9657168,40.6627603 Z M69,24.1301583 L69,66.9876574 C69,67.5471886 68.5419823,68 67.9760177,68 L36.7168142,68 C36.4444248,68 36.1851504,67.8932801 35.993469,67.7027802 C35.8017876,67.5132776 35.7079646,67.2709139 35.7079646,67.0026181 L35.7079646,55.0340357 L37.7256637,55.0340357 L37.7256637,66.0052363 L66.9823009,66.0052363 L66.9823009,25.1125795 L37.7256637,25.1125795 L37.7256637,23.1178157 L67.9760177,23.1178157 C68.5419823,23.1178157 69,23.5706271 69,24.1301583 L69,24.1301583 Z M33.1818053,34.5877073 C33.1818053,32.6607655 34.766708,31.0928812 36.7168142,31.0928812 C38.6669204,31.0928812 40.251823,32.6607655 40.251823,34.5877073 C40.251823,36.514649 38.6669204,38.0825333 36.7168142,38.0825333 C34.766708,38.0825333 33.1818053,36.514649 33.1818053,34.5877073 L33.1818053,34.5877073 Z M17.5486726,66.0092258 C15.5985664,66.0092258 14.0136637,64.4413415 14.0136637,62.5143997 C14.0136637,60.5874579 15.5985664,59.0195736 17.5486726,59.0195736 C19.4987788,59.0195736 21.0836814,60.5874579 21.0836814,62.5143997 C21.0836814,64.4413415 19.4987788,66.0092258 17.5486726,66.0092258 L17.5486726,66.0092258 Z M14.0136637,42.5667622 C14.0136637,40.6398205 15.5985664,39.0719362 17.5486726,39.0719362 C19.5310619,39.0719362 21.0836814,40.6069069 21.0836814,42.5667622 C21.0836814,44.493704 19.4987788,46.0615883 17.5486726,46.0615883 C15.5985664,46.0615883 14.0136637,44.493704 14.0136637,42.5667622 L14.0136637,42.5667622 Z M14.0176991,17.4856003 C14.0176991,15.5606533 15.6015929,13.9947637 17.5486726,13.9947637 C19.4957522,13.9947637 21.079646,15.5606533 21.079646,17.4856003 C21.079646,19.4095499 19.4957522,20.9764369 17.5486726,20.9764369 C15.6015929,20.9764369 14.0176991,19.4095499 14.0176991,17.4856003 L14.0176991,17.4856003 Z M37.7256637,47.2484728 L37.7256637,39.9715746 C40.2952035,39.4948261 42.2614513,37.2636828 42.2614513,34.5877073 C42.2614513,31.5656402 39.7736283,29.1060965 36.7168142,29.1060965 C33.66,29.1060965 31.172177,31.5656402 31.172177,34.5877073 C31.172177,37.2636828 33.1384248,39.4948261 35.7079646,39.9715746 L35.7079646,47.2484728 C35.7079646,48.41142 34.9220708,49.4656527 33.7275929,49.9344221 L23.2769204,54.034659 C21.6042478,54.6909363 20.3744602,55.9815484 19.8427965,57.5304825 C19.41,57.3349956 19.0417699,57.1943648 18.5575221,57.1135769 L18.5575221,47.9675851 C21.180531,47.5347214 23.0933097,45.2806383 23.0933097,42.5667622 C23.0933097,39.8030171 21.2148319,37.5948136 18.5575221,37.1739185 L18.5575221,22.8894153 C21.1835575,22.4575489 23.0973451,20.2014711 23.0973451,17.4856003 C23.0973451,14.4605411 20.6085133,12 17.5486726,12 C14.4888319,12 12,14.4605411 12,17.4856003 C12,20.1256701 14.0217345,22.3358683 16.539823,22.8545069 L16.539823,37.2018452 C14.0247611,37.7204837 12.0040354,39.9286872 12.0040354,42.5667622 C12.0040354,45.2048373 14.0247611,47.4130408 16.539823,47.9316793 L16.539823,57.1494826 C14.0247611,57.6681212 12.0040354,59.8763246 12.0040354,62.5143997 C12.0040354,65.5364668 14.4918584,67.9960105 17.5486726,67.9960105 C20.6054867,67.9960105 23.0933097,65.5364668 23.0933097,62.5143997 C23.0933097,61.0911358 22.5364248,59.7965341 21.6345133,58.8210946 C21.8019823,57.5504301 22.7008673,56.437352 24.0315398,55.9157212 L34.4822124,51.8154844 C36.4615752,51.0385239 37.7256637,49.2462286 37.7256637,47.2484728 L37.7256637,47.2484728 Z" id="AWS-CodeCommit_Icon_64_Squid" fill="#FFFFFF"></path>
                  </g>
                </svg>
                <span class="font-bold">CodeCommit</span>
              </label>
            </div>
          </div>
        </div>

        {/* Repository Credentials */}
        <div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="form-group mb-0">
              <label for="gitUsername" class="form-label">
                Username
              </label>
              <input
                id="gitUsername"
                type="text"
                placeholder="Username"
                value={gitUsername()}
                onInput={(e) => {
                  setGitUsername(e.currentTarget.value);
                  handleCredentialChange();
                }}
                class="form-input"
                disabled={isSaving()}
              />
            </div>

            <div class="form-group mb-0">
              <label for="gitToken" class="form-label">
                {repositoryProvider() === "GitHub" ? "Personal Access Token" : "Password"}
              </label>
              <input
                id="gitToken"
                type="password"
                placeholder={repositoryProvider() === "GitHub" ? "ghp_..." : "Password"}
                value={gitToken()}
                onInput={(e) => {
                  setGitToken(e.currentTarget.value);
                  handleCredentialChange();
                }}
                class="form-input"
                disabled={isSaving()}
              />
            </div>
          </div>

          <Show when={repositoryProvider() === "GitHub"}>
            <p class="text-xs text-[#666] dark:text-[#aaa] leading-relaxed bg-[#f8f9fa] dark:bg-[#1a1a1a] p-3 rounded-lg border border-[#eee] dark:border-[#333]">
              Required for cloning private repositories. Create a PAT with 'repo' scope at <a href="https://github.com/settings/tokens" target="_blank" class="text-[#396cd8] dark:text-[#5b8def] hover:underline font-medium">github.com/settings/tokens</a>.
            </p>
          </Show>

          <Show when={repositoryProvider() === "CodeCommit"}>
            <p class="text-xs text-[#666] dark:text-[#aaa] leading-relaxed bg-[#f8f9fa] dark:bg-[#1a1a1a] p-3 rounded-lg border border-[#eee] dark:border-[#333]">
              AWS CodeCommit can use <strong>HTTPS Git credentials</strong> for your IAM user. You can generate these in the IAM console under the "Security credentials" tab for your user.
            </p>
          </Show>
        </div>
      </div>
    </WizardStep>
  );
}
