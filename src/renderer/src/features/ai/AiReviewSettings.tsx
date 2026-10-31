import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  type AiProviderId,
  type AiProviderStatus,
  type AiSettings,
  isModelName,
} from '@shared/ai';
import { RefreshCw } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import styles from './AiReviewSettings.module.css';
import { useAiProviders, useAiSettings, useUpdateAiSettings } from './queries';

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
        Overviews are made by an AI coding tool on this Mac, with your own account and plan. Viewer
        has no server and no API key of its own.
      </p>
      <fieldset className={styles.providers}>
        <legend className={styles.legend}>
          AI tool
          <IconButton
            label="Check the installed tools again"
            busy={providers.isFetching}
            onClick={() => void providers.refetch()}
          >
            <RefreshCw size={13} />
          </IconButton>
        </legend>
        {AI_PROVIDER_IDS.map((id) => (
          <label key={id} className={styles.provider}>
            <input
              type="radio"
              name={groupName}
              checked={current.provider === id}
              onChange={() => update.mutate({ ...current, provider: id })}
            />
            <span className={styles.providerText}>
              <span className={styles.providerName}>{AI_PROVIDERS[id].name}</span>
              <ProviderStatusLine id={id} status={statusOf(id)} checking={providers.isPending} />
              <span className={styles.access}>{ACCESS[id]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <ModelField
        key={current.provider}
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
  status?: AiProviderStatus;
  checking: boolean;
}

function ProviderStatusLine({ id, status, checking }: ProviderStatusLineProps) {
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
        , then sign in.
      </span>
    );
  }
  const version = status.version ? `${status.version}. ` : '';
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

interface ModelFieldProps {
  settings: AiSettings;
  onSave(settings: AiSettings): void;
}

function ModelField({ settings, onSave }: ModelFieldProps) {
  const saved = settings.models[settings.provider] ?? '';
  const [value, setValue] = useState(saved);
  const inputId = useId();
  const trimmed = value.trim();
  const invalid = trimmed !== '' && !isModelName(trimmed);

  function save(event?: FormEvent) {
    event?.preventDefault();
    if (invalid || trimmed === saved) {
      return;
    }
    const models = { ...settings.models };
    if (trimmed === '') {
      delete models[settings.provider];
    } else {
      models[settings.provider] = trimmed;
    }
    onSave({ ...settings, models });
  }

  return (
    <form className={styles.model} onSubmit={save}>
      <label htmlFor={inputId} className={styles.legend}>
        Model for {AI_PROVIDERS[settings.provider].name}
      </label>
      <input
        id={inputId}
        className={styles.input}
        placeholder="The tool's default"
        spellCheck={false}
        value={value}
        aria-invalid={invalid}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => save()}
      />
      <span className={styles.hint}>
        {invalid
          ? 'Use a model name such as the ones the tool lists, without spaces.'
          : 'Leave empty to use the model the tool picks.'}
      </span>
    </form>
  );
}
