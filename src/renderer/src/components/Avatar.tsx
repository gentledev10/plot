import type { GitHubUser } from '@shared/github';
import { sizedAvatarUrl } from '../lib/format';
import styles from './Avatar.module.css';

interface AvatarProps {
  user: GitHubUser;
  size?: number;
}

export function Avatar({ user, size = 20 }: AvatarProps) {
  return (
    <img
      className={styles.avatar}
      src={sizedAvatarUrl(user.avatarUrl, size * 2)}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}
