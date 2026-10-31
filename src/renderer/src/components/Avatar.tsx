import type { GitHubUser } from '@shared/github';
import { useState } from 'react';
import { sizedAvatarUrl } from '../lib/format';
import styles from './Avatar.module.css';

interface AvatarProps {
  user: GitHubUser;
  size?: number;
}

export function Avatar({ user, size = 20 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  if (failed || user.avatarUrl === '') {
    return (
      <span
        className={`${styles.avatar} ${styles.initial}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
        aria-hidden="true"
      >
        {user.login.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className={styles.avatar}
      src={sizedAvatarUrl(user.avatarUrl, size * 2)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
