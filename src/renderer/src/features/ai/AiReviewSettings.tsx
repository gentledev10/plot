import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  type AiAuth,
  type AiProviderId,
  type AiProviderStatus,
  type AiSettings,
  authOf,
  isApiKey,
  isModelName,
} from '@shared/ai';
import { RefreshCw } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { Select } from '../../components/Select';
import { StatusMessage } from '../../components/StatusMessage';
import styles from './AiReviewSettings.module.css';
import {
  useAiModels,
  useAiProviders,
  useAiSettings,
  useRemoveAiApiKey,
  useSaveAiApiKey,
  useUpdateAiSettings,
} from './queries';

const ACCESS: Record<AiProviderId, string> = {
  'claude-code':
    'Runs with only the Read, Grep, and Glob tools, limited to the checkout of the pull request. It cannot run commands, reach the web, or use your MCP servers.',
  codex:
    'Runs in the read-only sandbox of Codex: it can run commands that read files, but cannot change files or use the network. Web search, your Codex config, and its MCP servers are turned off.',
};

export function AiReviewSettings() {
  const settings = useAiSettings();
  const providers = useAiProviders();
  const update = useUpdateAiSettings();
  const groupName = useId();

  if (settings.isPending) {
    return <StatusMessage>Loading AI settings…</StatusMessage>;
  }
  if (settings.isError) {
    return (
      <StatusMessage
        tone="error"
        title="Could not load the AI settings"
        onRetry={() => void settings.refetch()}
      >
        {settings.error.message}
      </StatusMessage>
    );
  }

  const current = settings.data;
  const statusOf = (id: AiProviderId) => providers.data?.find((status) => status.id === id);

  return (
    <div className={styles.settings}>
      <p className={styles.intro}>
        Overviews are made by an AI coding tool on this Mac, with the sign-in you choose below. Plot
        has no server and no API key of its own.
      </p>
      <fieldset className={styles.providers}>
        <legend className={styles.legend}>
          AI tool
          <IconButton
            label="Check the installed tools again"
            busy={providers.isFetching}
            onClick={() => void Promise.all([providers.refetch(), settings.refetch()])}
          >
            <RefreshCw size={13} />
          </IconButton>
        </legend>
        <label className={styles.choice}>
          <input
            type="checkbox"
            checked={current.autoSelect === true}
            onChange={(event) => update.mutate({ ...current, autoSelect: event.target.checked })}
          />
          Choose an available tool automatically
        </label>
        <span className={styles.hint}>
          {current.autoSelect
            ? `Automatic selection checks installation, sign-in and compatibility. Current tool: ${AI_PROVIDERS[current.provider].name}. If neither tool is ready, finish setup below.`
            : 'Your saved tool stays selected. Choose automatically to check this Mac instead.'}
        </span>
        {AI_PROVIDER_IDS.map((id) => (
          <label key={id} className={styles.provider}>
            <input
              type="radio"
              name={groupName}
              checked={current.provider === id}
              onChange={() =>
                update.mutate({
                  ...current,
                  provider: id,
                  ...(current.autoSelect !== undefined ? { autoSelect: false } : {}),
                })
              }
            />
            <span className={styles.providerText}>
              <span className={styles.providerName}>{AI_PROVIDERS[id].name}</span>
              <ProviderStatusLine
                id={id}
                auth={authOf(current, id)}
                status={statusOf(id)}
                checking={providers.isPending}
              />
              <span className={styles.access}>{ACCESS[id]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <SignInField
        key={current.provider}
        settings={current}
        status={statusOf(current.provider)}
        onChange={(next) =>
          update.mutate({ ...next, ...(next.autoSelect ? { autoSelect: false } : {}) })
        }
      />
      <ModelFields
        key={`model-${current.provider}`}
        settings={current}
        onSave={(next) => update.mutate(next)}
      />
      {update.isError && (
        <p className={styles.error} role="alert">
          {update.error.message}
        </p>
      )}
    </div>
  );
}

interface ProviderStatusLineProps {
  id: AiProviderId;
  auth: AiAuth;
  status?: AiProviderStatus;
  checking: boolean;
}

function ProviderStatusLine({ id, auth, status, checking }: ProviderStatusLineProps) {
  const { installUrl, signInCommand } = AI_PROVIDERS[id];
  if (!status) {
    return <span className={styles.status}>{checking ? 'Checking…' : ''}</span>;
  }
  if (!status.installed) {
    return (
      <span className={styles.status} data-state="missing">
        Not installed.{' '}
        <a href={installUrl} target="_blank" rel="noreferrer">
          Install it
        </a>
        {auth === 'cli' ? ', then sign in.' : '.'}
      </span>
    );
  }
  const version = status.version ? `${status.version}. ` : '';
  if (status.compatibilityIssue) {
    return (
      <span className={styles.status} data-state="signed-out">
        {version}
        {status.compatibilityIssue}
      </span>
    );
  }
  if (auth === 'api-key') {
    return status.apiKeySaved ? (
      <span className={styles.status} data-state="ready">
        {version}Uses your API key.
      </span>
    ) : (
      <span className={styles.status} data-state="signed-out">
        {version}Needs an API key.
      </span>
    );
  }
  if (status.signedIn === false) {
    return (
      <span className={styles.status} data-state="signed-out">
        {version}Not signed in. Run <code>{signInCommand}</code> in a terminal.
      </span>
    );
  }
  return (
    <span className={styles.status} data-state="ready">
      {version}
      {status.signedIn ? 'Signed in.' : 'Installed.'}
    </span>
  );
}

interface SignInFieldProps {
  settings: AiSettings;
  status?: AiProviderStatus;
  onChange(settings: AiSettings): void;
}

function SignInField({ settings, status, onChange }: SignInFieldProps) {
  const id = settings.provider;
  const { name, apiKeyVendor, apiKeyUrl } = AI_PROVIDERS[id];
  const auth = authOf(settings, id);
  const groupName = useId();
  const save = useSaveAiApiKey();
  const remove = useRemoveAiApiKey();
  const [key, setKey] = useState('');
  const trimmed = key.trim();
  const valid = isApiKey(trimmed);
  const failure = save.error ?? remove.error;

  function choose(next: AiAuth) {
    onChange({ ...settings, auth: { ...settings.auth, [id]: next } });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) {
      save.mutate({ provider: id, key: trimmed }, { onSuccess: () => setKey('') });
    }
  }

  return (
    <fieldset className={styles.signIn}>
      <legend className={styles.legend}>Sign-in for {name}</legend>
      <label className={styles.choice}>
        <input
          type="radio"
          name={groupName}
          checked={auth === 'cli'}
          onChange={() => choose('cli')}
        />
        <span className={styles.choiceText}>
          <span>Use the {name} sign-in</span>
          <span className={styles.hint}>Whatever you set up in {name}: a plan or an API key.</span>
        </span>
      </label>
      <label className={styles.choice}>
        <input
          type="radio"
          name={groupName}
          checked={auth === 'api-key'}
          onChange={() => choose('api-key')}
        />
        <span className={styles.choiceText}>
          <span>Use an API key</span>
          <span className={styles.hint}>
            {apiKeyVendor} bills your account for each overview. The key stays in your macOS
            keychain and is given only to {name} while it makes an overview.
          </span>
        </span>
      </label>
      {auth === 'api-key' && (
        <form className={styles.keyForm} onSubmit={submit}>
          <div className={styles.keyRow}>
            <input
              type="password"
              className={styles.input}
              aria-label={`${apiKeyVendor} API key`}
              placeholder={
                status?.apiKeySaved ? 'Saved. Paste a new key to replace it.' : 'Paste an API key'
              }
              autoComplete="off"
              spellCheck={false}
              value={key}
              aria-invalid={trimmed !== '' && !valid}
              onChange={(event) => setKey(event.target.value)}
            />
            <button type="submit" className={styles.button} disabled={!valid || save.isPending}>
              Save
            </button>
            {status?.apiKeySaved && (
              <button
                type="button"
                className={styles.button}
                disabled={remove.isPending}
                onClick={() => remove.mutate(id)}
              >
                Remove
              </button>
            )}
          </div>
          <span className={styles.hint}>
            {status?.apiKeySaved ? 'A key is saved. ' : 'No key is saved yet. '}
            <a href={apiKeyUrl} target="_blank" rel="noreferrer">
              Create a key
            </a>{' '}
            in your {apiKeyVendor} account.
          </span>
          {failure && (
            <p className={styles.error} role="alert">
              {failure.message}
            </p>
          )}
        </form>
      )}
    </fieldset>
  );
}

const OTHER = '__other';

const EFFORT_NAMES: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
  ultra: 'Ultra',
  persistent: 'Persistent',
};

interface ModelFieldsProps {
  settings: AiSettings;
  onSave(settings: AiSettings): void;
}

function ModelFields({ settings, onSave }: ModelFieldsProps) {
  const { provider } = settings;
  const tool = AI_PROVIDERS[provider];
  const models = useAiModels(provider);
  const options = models.data ?? [];
  const model = settings.models[provider];
  const effort = settings.efforts[provider];
  const listed = options.find((option) => option.id === model);
  const defaultModel =
    provider === 'codex' ? (options.find((option) => option.isDefault) ?? options[0]) : undefined;
  const selected = model ? listed : defaultModel;
  const efforts = selected?.efforts.length ? selected.efforts : tool.efforts;
  const [typing, setTyping] = useState(false);
  const modelId = useId();
  const effortId = useId();

  function save(next: { model?: string; effort?: string }) {
    const nextModels = { ...settings.models, [provider]: next.model };
    const nextEfforts = { ...settings.efforts, [provider]: next.effort };
    if (next.model === undefined) {
      delete nextModels[provider];
    }
    if (next.effort === undefined) {
      delete nextEfforts[provider];
    }
    onSave({ ...settings, models: nextModels, efforts: nextEfforts });
  }

  function chooseModel(value: string) {
    if (value === OTHER) {
      setTyping(true);
      return;
    }
    setTyping(false);
    const next = value === '' ? undefined : value;
    const selected = next ? options.find((option) => option.id === next) : defaultModel;
    const supported = selected?.efforts ?? tool.efforts;
    save({ model: next, effort: effort && supported.includes(effort) ? effort : undefined });
  }

  return (
    <fieldset className={styles.model}>
      <legend className={styles.legend}>Model for {tool.name}</legend>
      <div className={styles.modelRow}>
        <label className={styles.field} htmlFor={modelId}>
          <span>Model</span>
          <Select
            id={modelId}
            className={styles.select}
            value={typing ? OTHER : (model ?? '')}
            onChange={(event) => chooseModel(event.target.value)}
          >
            <option value="">{defaultModel ? `Default (${defaultModel.name})` : 'Default'}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
            {model && !listed && <option value={model}>{model}</option>}
            <option value={OTHER}>Other…</option>
          </Select>
        </label>
        <label className={styles.field} htmlFor={effortId}>
          <span>Reasoning effort</span>
          <Select
            id={effortId}
            className={styles.select}
            value={effort ?? ''}
            onChange={(event) => save({ model, effort: event.target.value || undefined })}
          >
            <option value="">Default</option>
            {efforts.map((level) => (
              <option key={level} value={level}>
                {EFFORT_NAMES[level] ?? level}
              </option>
            ))}
            {effort && !efforts.includes(effort) && <option value={effort}>{effort}</option>}
          </Select>
        </label>
      </div>
      {typing && (
        <OtherModelField
          provider={provider}
          initial={listed ? '' : (model ?? '')}
          onSave={(name) => {
            setTyping(false);
            save({ model: name, effort });
          }}
        />
      )}
      {models.isError && (
        <p className={styles.error} role="alert">
          {models.error.message}{' '}
          <button type="button" className={styles.button} onClick={() => void models.refetch()}>
            Reload models
          </button>
        </p>
      )}
      {provider === 'codex' && model && !listed && models.isSuccess && (
        <p className={styles.error} role="alert">
          This saved model is not available for the selected sign-in. Choose a model from the
          updated list.
        </p>
      )}
      <span className={styles.hint}>
        {provider === 'claude-code'
          ? 'Each name uses the newest version of that model.'
          : options.length > 0
            ? 'Available for the selected sign-in.'
            : 'Check your Codex sign-in to load available models.'}{' '}
        {provider === 'codex'
          ? 'Default uses the recommended available model with isolated settings.'
          : 'Default uses the Claude Code default model.'}{' '}
        Higher effort thinks longer and costs more.
      </span>
    </fieldset>
  );
}

function OtherModelField({
  provider,
  initial,
  onSave,
}: {
  provider: AiProviderId;
  initial: string;
  onSave(name: string): void;
}) {
  const [value, setValue] = useState(initial);
  const inputId = useId();
  const trimmed = value.trim();
  const invalid = trimmed !== '' && !isModelName(trimmed);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (trimmed !== '' && !invalid) {
      onSave(trimmed);
    }
  }

  return (
    <form className={styles.other} onSubmit={submit}>
      <label className={styles.hidden} htmlFor={inputId}>
        Model name
      </label>
      <input
        id={inputId}
        className={styles.input}
        placeholder={
          provider === 'codex'
            ? 'Model ID from your Codex model list'
            : 'Model ID or alias, such as opus'
        }
        spellCheck={false}
        // biome-ignore lint/a11y/noAutofocus: the field appears because Other was just chosen
        autoFocus
        value={value}
        aria-invalid={invalid}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => submit()}
      />
      {invalid && (
        <span className={styles.hint}>Use a model name the tool lists, without spaces.</span>
      )}
    </form>
  );
}
