import { safeStorage } from 'electron';
import type { SecretCipher } from '../accounts/account-store';

export const keychainCipher: SecretCipher = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data),
};
