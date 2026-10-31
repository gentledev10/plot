import type { Account } from '@shared/accounts';
import { GITHUB_HOST, normalizeHost } from '@shared/hosts';
import { Globe, KeyRound, LoaderCircle, Terminal } from 'lucide-react';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import styles from './ConnectGitHub.module.css';
import { useAccountActions, useAccounts, useBrowserSignIn } from './queries';

interface ConnectGitHubProps {
  onConnected?(account: Account): void;
}

export function ConnectGitHub({ onConnected }: ConnectGitHubProps) {
  const accounts = useAccounts();
  const { signInWithToken, signInWithGitHubCli } = useAccountActions();
  const browser = useBrowserSignIn(onConnected);
  const [enterprise, setEnterprise] = useState(false);
  const [hostText, setHostText] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);
  const [token, setToken] = useState('');
  const serverName = useId();
  const host = enterprise ? normalizeHost(hostText) : GITHUB_HOST;
  const busy = signInWithToken.isPending || signInWithGitHubCli.isPending;
  const error =
    browser.state.step === 'failed'
      ? browser.state.message
      : (signInWithToken.error ?? signInWithGitHubCli.error)?.message;

  function resetErrors() {
    signInWithToken.reset();
    signInWithGitHubCli.reset();
  }

  function connectWithGitHubCli() {
    if (host) {
      resetErrors();
      signInWithGitHubCli.mutate(host, { onSuccess: onConnected });
    }
  }

  function submitToken(event: FormEvent) {
    event.preventDefault();
    if (host && token.trim() !== '') {
      resetErrors();
      signInWithToken.mutate(
        { host, token: token.trim() },
        {
          onSuccess: (account) => {
            setToken('');
            onConnected?.(account);
          },
        },
      );
    }
  }

  if (browser.state.step === 'waiting') {
    return <DeviceCode signIn={browser.state.signIn} onCancel={browser.cancel} />;
  }

  return (
    <div className={styles.connect}>
      <fieldset className={styles.server}>
        <legend className={styles.legend}>GitHub server</legend>
        <label className={styles.choice}>
          <input
            type="radio"
            name={serverName}
            checked={!enterprise}
            onChange={() => setEnterprise(false)}
          />
          GitHub.com
        </label>
        <label className={styles.choice}>
          <input
            type="radio"
            name={serverName}
            checked={enterprise}
            onChange={() => setEnterprise(true)}
          />
          GitHub Enterprise Server
        </label>
        {enterprise && (
          <input
            className={styles.input}
            aria-label="Server address"
            placeholder="github.example.com"
            spellCheck={false}
            value={hostText}
            aria-invalid={hostText !== '' && host === undefined}
            onChange={(event) => setHostText(event.target.value)}
          />
        )}
      </fieldset>

      <div className={styles.methods}>
        {!enterprise && accounts.data?.browserSignIn && (
          <Method
            icon={<Globe size={16} />}
            title="Sign in with your browser"
            detail="Approve Plot on github.com. Works with single sign-on."
            busy={browser.state.step === 'starting'}
            disabled={busy}
            onClick={() => {
              resetErrors();
              void browser.start();
            }}
          />
        )}
        <Method
          icon={<Terminal size={16} />}
          title="Use the GitHub CLI"
          detail="Uses the account you signed in to with gh auth login."
          busy={signInWithGitHubCli.isPending}
          disabled={host === undefined || busy}
          onClick={connectWithGitHubCli}
        />
        <Method
          icon={<KeyRound size={16} />}
          title="Use a personal access token"
          detail="Paste a token you created on GitHub."
          expanded={tokenOpen}
          disabled={host === undefined}
          onClick={() => setTokenOpen(!tokenOpen)}
        />
        {tokenOpen && host && (
          <form className={styles.tokenForm} onSubmit={submitToken}>
            <div className={styles.tokenRow}>
              <input
                className={styles.input}
                type="password"
                aria-label="Personal access token"
                placeholder="ghp_…"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
              <button
                type="submit"
                className={styles.primary}
                disabled={token.trim() === '' || busy}
              >
                Connect
              </button>
            </div>
            <p className={styles.hint}>
              <a
                href={`https://${host}/settings/tokens/new?scopes=repo&description=Plot`}
                target="_blank"
                rel="noreferrer"
              >
                Create a classic token
              </a>{' '}
              with the <code>repo</code> scope to read private repositories, or a fine-grained token
              with read access to contents and pull requests.
            </p>
          </form>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.hint}>
        Tokens are encrypted with your macOS keychain and only sent to {host ?? 'your server'}.
      </p>
    </div>
  );
}

interface MethodProps {
  icon: ReactNode;
  title: string;
  detail: string;
  busy?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  onClick(): void;
}

function Method({ icon, title, detail, busy, disabled, expanded, onClick }: MethodProps) {
  const detailId = useId();
  return (
    <button
      type="button"
      className={styles.method}
      aria-describedby={detailId}
      aria-expanded={expanded}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={onClick}
    >
      <span className={styles.methodIcon}>
        {busy ? <LoaderCircle size={16} className={styles.spinner} /> : icon}
      </span>
      <span className={styles.methodText}>
        <span className={styles.methodTitle}>{title}</span>
        <span id={detailId} className={styles.methodDetail}>
          {detail}
        </span>
      </span>
    </button>
  );
}

interface DeviceCodeProps {
  signIn: { userCode: string; verificationUri: string };
  onCancel(): void;
}

function DeviceCode({ signIn, onCancel }: DeviceCodeProps) {
  const [copied, setCopied] = useState(false);

  function copyAndOpen() {
    navigator.clipboard?.writeText(signIn.userCode).then(
      () => setCopied(true),
      () => setCopied(false),
    );
    window.open(signIn.verificationUri, '_blank', 'noreferrer');
  }

  return (
    <div className={styles.deviceCode}>
      <p>Enter this code on GitHub to finish signing in.</p>
      <output className={styles.code} aria-label="Sign-in code">
        {signIn.userCode}
      </output>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={copyAndOpen}>
          Copy code and open GitHub
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className={styles.waiting} role="status">
        <LoaderCircle size={14} className={styles.spinner} />
        {copied
          ? 'Code copied. Waiting for you to approve on GitHub…'
          : 'Waiting for you to approve on GitHub…'}
      </p>
    </div>
  );
}
