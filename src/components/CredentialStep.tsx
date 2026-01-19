import { createSignal, Show } from "solid-js";
import {
  CredentialService,
  type AllCredentials,
} from "../services/aws/credentialService";
import { setAppState } from "../store/appStore";
import "./shared.css";

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

      // Update appState with selected region (required by other steps)
      setAppState("awsConfig", "selectedRegion", region());

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
    setError("");
  };

  return (
    <div class="step-container">
      <h2>AWS Credentials</h2>

      <div class="step-description">
        <p>
          Enter your AWS credentials to access Amplify and Lambda resources.
        </p>
        <p class="warning-text">
          ⚠️ Credentials are stored in your browser's session storage and will
          be cleared when you close the browser tab.
        </p>
      </div>

      <div class="form-container">
        <div class="form-group">
          <label for="accessKeyId">
            AWS Access Key ID <span class="required">*</span>
          </label>
          <input
            id="accessKeyId"
            type="text"
            placeholder="AKIA..."
            value={accessKeyId()}
            onInput={(e) => setAccessKeyId(e.currentTarget.value)}
            class="form-input"
            disabled={isSaving()}
          />
          <span class="help-text">
            Your AWS access key ID (starts with AKIA)
          </span>
        </div>

        <div class="form-group">
          <label for="secretAccessKey">
            AWS Secret Access Key <span class="required">*</span>
          </label>
          <input
            id="secretAccessKey"
            type="password"
            placeholder="Enter secret access key"
            value={secretAccessKey()}
            onInput={(e) => setSecretAccessKey(e.currentTarget.value)}
            class="form-input"
            disabled={isSaving()}
          />
          <span class="help-text">
            Your AWS secret access key (keep this secure)
          </span>
        </div>

        <div class="form-group">
          <label for="sessionToken">Session Token (optional)</label>
          <input
            id="sessionToken"
            type="password"
            placeholder="Enter session token (if using temporary credentials)"
            value={sessionToken()}
            onInput={(e) => setSessionToken(e.currentTarget.value)}
            class="form-input"
            disabled={isSaving()}
          />
          <span class="help-text">
            Required only if using temporary security credentials
          </span>
        </div>

        <div class="form-group">
          <label for="region">
            AWS Region <span class="required">*</span>
          </label>
          <select
            id="region"
            value={region()}
            onChange={(e) => setRegion(e.currentTarget.value)}
            class="form-select"
            disabled={isSaving()}
          >
            {AWS_REGIONS.map((r) => (
              <option value={r.value}>{r.label}</option>
            ))}
          </select>
          <span class="help-text">
            AWS region where your Amplify apps are deployed
          </span>
        </div>

        <h3 style="margin-top: 2rem; margin-bottom: 1rem;">
          GitHub Credentials (for repository access)
        </h3>

        <div class="form-group">
          <label for="gitUsername">GitHub Username</label>
          <input
            id="gitUsername"
            type="text"
            placeholder="Enter GitHub username"
            value={gitUsername()}
            onInput={(e) => setGitUsername(e.currentTarget.value)}
            class="form-input"
            disabled={isSaving()}
          />
          <span class="help-text">
            Your GitHub username (optional, required for private repositories)
          </span>
        </div>

        <div class="form-group">
          <label for="gitToken">GitHub Personal Access Token</label>
          <input
            id="gitToken"
            type="password"
            placeholder="Enter GitHub personal access token"
            value={gitToken()}
            onInput={(e) => setGitToken(e.currentTarget.value)}
            class="form-input"
            disabled={isSaving()}
          />
          <span class="help-text">
            Required for cloning repositories. Create at
            https://github.com/settings/tokens
          </span>
        </div>

        <Show when={error()}>
          <div class="error-message">{error()}</div>
        </Show>

        <div class="button-group">
          <button
            onClick={props.onBack}
            class="button button-secondary"
            disabled={isSaving()}
          >
            Back
          </button>

          <button
            onClick={handleClear}
            class="button button-secondary"
            disabled={isSaving()}
          >
            Clear
          </button>

          <button
            onClick={handleSave}
            class="button button-primary"
            disabled={isSaving()}
          >
            {isSaving() ? "Saving..." : "Save & Continue"}
          </button>
        </div>
      </div>

      <div class="info-box">
        <h4>How to get AWS credentials:</h4>
        <ol>
          <li>
            Go to AWS IAM Console →{" "}
            <a
              href="https://console.aws.amazon.com/iam/home#/users"
              target="_blank"
              rel="noopener noreferrer"
            >
              Users
            </a>
          </li>
          <li>Select your user or create a new one</li>
          <li>Go to "Security credentials" tab</li>
          <li>Create access key → Choose "Application running outside AWS"</li>
          <li>Copy the Access Key ID and Secret Access Key</li>
        </ol>
        <p>
          <strong>Required IAM permissions:</strong> amplify:*, lambda:Get*,
          lambda:List*, tag:GetResources
        </p>
      </div>
    </div>
  );
}
