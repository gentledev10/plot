import type { AccountMethod } from '@shared/accounts';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { useT } from '../language/LanguageProvider';
import styles from './AccountsSettings.module.css';
import { ConnectGitHub } from './ConnectGitHub';
import { useAccountActions, useAccounts } from './queries';

const METHOD_LABELS: Record<AccountMethod, string> = {
  browser: 'Signed in with the browser',
  token: 'Personal access token',
  'github-cli': 'GitHub CLI',
};
export function AccountsSettings() {
  const t = useT();
  const accounts = useAccounts();
  const { switchAccount, removeAccount } = useAccountActions();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string>();
  if (accounts.isPending) {
    return <StatusMessage>{t('Loading accounts…')}</StatusMessage>;
  }
  if (accounts.isError) {
    return (
      <StatusMessage
        tone="error"
        title={t('Could not load your accounts')}
        onRetry={() => void accounts.refetch()}
      >
        {accounts.error.message}
      </StatusMessage>
    );
  }
  const { accounts: list, currentId } = accounts.data;
  const failure = switchAccount.error ?? removeAccount.error;
  return (
    <div className={styles.accounts}>
      <p className={styles.intro}>
        {t(
          'The inbox shows pull requests for the current account. Pull requests on another server are opened with the account you connected for that server.',
        )}
      </p>
      {list.length > 0 && (
        <ul className={styles.list} aria-label={t('Connected accounts')}>
          {list.map((account) => (
            <li key={account.id} className={styles.row}>
              <Avatar user={account} size={28} />
              <span className={styles.who}>
                <span className={styles.login}>{account.login}</span>
                <span className={styles.details}>
                  <span>{account.host}</span>
                  <span>{t(METHOD_LABELS[account.method])}</span>
                </span>
              </span>
              {confirming === account.id ? (
                <span className={styles.confirm}>
                  <span>{t('Forget this sign-in?')}</span>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() =>
                      removeAccount.mutate(account.id, {
                        onSettled: () => setConfirming(undefined),
                      })
                    }
                  >
                    {t('Remove')}
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setConfirming(undefined)}
                  >
                    {t('Keep')}
                  </button>
                </span>
              ) : (
                <>
                  {account.id === currentId ? (
                    <span className={styles.current}>{t('Current')}</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.secondary}
                      aria-label={t('Use {value0} on {value1}', {
                        value0: account.login,
                        value1: account.host,
                      })}
                      onClick={() => switchAccount.mutate(account.id)}
                    >
                      {t('Use')}
                    </button>
                  )}
                  <IconButton
                    label={t('Remove {value0} on {value1}', {
                      value0: account.login,
                      value1: account.host,
                    })}
                    onClick={() => setConfirming(account.id)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {failure && (
        <p className={styles.error} role="alert">
          {t(failure.message)}
        </p>
      )}
      {list.length === 0 || adding ? (
        <section className={styles.add} aria-labelledby="add-account">
          <h4 id="add-account" className={styles.addTitle}>
            {list.length === 0 ? t('Connect a GitHub account') : t('Add an account')}
          </h4>
          <ConnectGitHub onConnected={() => setAdding(false)} />
        </section>
      ) : (
        <button type="button" className={styles.addButton} onClick={() => setAdding(true)}>
          <Plus size={14} />
          {t(' Add an account')}
        </button>
      )}
    </div>
  );
}
