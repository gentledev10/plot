import type { Account, BrowserSignIn } from '@shared/accounts';
import { GITHUB_HOST, normalizeHost } from '@shared/hosts';
import { Globe, KeyRound, LoaderCircle, Terminal } from 'lucide-react';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import styles from './ConnectGitHub.module.css';
import {
  copyText,
  signInPageUrl,
  useAccountActions,
  useAccounts,
  useBrowserSignIn,
} from './queries';

interface ConnectGitHubProps {
  onConnected?(account: Account): void;
}

export function ConnectGitHub({ onConnected }: ConnectGitHubProps) {
  const accounts = useAccounts();
  const { signInWithToken, signInWithGitHubCli } = useAccountActions();
  const browser = useBrowserSignIn(onConnected);
  const [companyServer, setCompanyServer] = useState(false);
  const [hostText, setHostText] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);
  const [token, setToken] = useState('');
  const serverName = useId();
  const host = companyServer ? normalizeHost(hostText) : GITHUB_HOST;
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
    return (
      <BrowserSignInWaiting
        signIn={browser.state.signIn}
        codeCopied={browser.state.codeCopied}
        onCancel={browser.cancel}
      />
    );
  }

  return (
    <div className={styles.connect}>
      <fieldset className={styles.server}>
        <legend className={styles.legend}>GitHub server</legend>
        <ServerChoice
          name={serverName}
          title="GitHub.com"
          detail="Including GitHub Enterprise Cloud"
          checked={!companyServer}
          onChange={() => setCompanyServer(false)}
        />
        <ServerChoice
          name={serverName}
          title="Company server"
          detail="GitHub Enterprise Server or GHE.com"
          checked={companyServer}
          onChange={() => setCompanyServer(true)}
        />
        {companyServer && (
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

      {companyServer && <GitHubCliHint host={host} />}

      <div className={styles.methods}>
        {!companyServer && accounts.data?.browserSignIn && (
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

interface ServerChoiceProps {
  name: string;
  title: string;
  detail: string;
  checked: boolean;
  onChange(): void;
}

function ServerChoice({ name, title, detail, checked, onChange }: ServerChoiceProps) {
  const titleId = useId();
  const detailId = useId();
  return (
    <label className={styles.choice}>
      <input
        type="radio"
        name={name}
        checked={checked}
        aria-labelledby={titleId}
        aria-describedby={detailId}
        onChange={onChange}
      />
      <span className={styles.choiceText}>
        <span id={titleId}>{title}</span>
        <span id={detailId} className={styles.choiceDetail}>
          {detail}
        </span>
      </span>
    </label>
  );
}

interface GitHubCliHintProps {
  host: string | undefined;
}

function GitHubCliHint({ host }: GitHubCliHintProps) {
  const [copiedCommand, setCopiedCommand] = useState<string>();
  const command = `gh auth login --hostname ${host ?? '<server address>'} --web`;

  function copy() {
    navigator.clipboard?.writeText(command).then(
      () => setCopiedCommand(command),
      () => setCopiedCommand(undefined),
    );
  }

  return (
    <div className={styles.cliHint}>
      <p className={styles.hint}>
        To connect without a token, sign in once with the{' '}
        <a href="https://cli.github.com" target="_blank" rel="noreferrer">
          GitHub CLI
        </a>{' '}
        in Terminal, then choose Use the GitHub CLI.
      </p>
      <div className={styles.commandRow}>
        <code className={styles.command}>{command}</code>
        <button type="button" className={styles.secondary} disabled={!host} onClick={copy}>
          {copiedCommand === command ? 'Copied' : 'Copy'}
        </button>
      </div>
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

interface BrowserSignInWaitingProps {
  signIn: BrowserSignIn;
  codeCopied: boolean;
  onCancel(): void;
}

function BrowserSignInWaiting({ signIn, codeCopied, onCancel }: BrowserSignInWaitingProps) {
  const [copied, setCopied] = useState(codeCopied);

  async function openAgain() {
    if (signIn.flow === 'device') {
      setCopied(await copyText(signIn.userCode));
    }
    window.open(signInPageUrl(signIn), '_blank', 'noreferrer');
  }

  return (
    <div className={styles.browserSignIn}>
      {signIn.flow === 'web' ? (
        <p>Approve Plot on the GitHub page that opened in your browser.</p>
      ) : (
        <>
          <p>
            {copied
              ? 'Paste this code on the GitHub page that opened in your browser. It is already copied.'
              : 'Enter this code on the GitHub page that opened in your browser.'}
          </p>
          <output className={styles.code} aria-label="Sign-in code">
            {signIn.userCode}
          </output>
        </>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => void openAgain()}>
          {signIn.flow === 'web' ? 'Open GitHub again' : 'Copy code and open GitHub'}
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className={styles.waiting} role="status">
        <LoaderCircle size={14} className={styles.spinner} />
        Waiting for you to approve on GitHub…
      </p>
    </div>
  );
}
