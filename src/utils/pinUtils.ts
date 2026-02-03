// PIN Utilities for OSCE App
// Handles PIN hashing, verification, and backup code generation

import type { BackupCode } from '../types';

/**
 * Hash a PIN using SHA-256
 * @param pin - The plain text PIN (4-6 digits)
 * @returns Hashed PIN as hex string
 */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a PIN against a hashed PIN
 * @param pin - The plain text PIN to verify
 * @param hashedPin - The stored hashed PIN
 * @returns True if PIN matches
 */
export async function verifyPin(pin: string, hashedPin: string): Promise<boolean> {
  const inputHash = await hashPin(pin);
  return inputHash === hashedPin;
}

/**
 * Validate PIN format (4-6 digits)
 * @param pin - The PIN to validate
 * @returns True if PIN is valid format
 */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/**
 * Generate a random backup code (format: XXXX-XXXX)
 * @returns A backup code string
 */
function generateBackupCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: I, O, 0, 1
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate 5 backup codes for PIN recovery
 * @returns Array of backup codes (plain text) and their hashed versions
 */
export async function generateBackupCodes(): Promise<{
  plainCodes: string[];
  hashedCodes: BackupCode[];
}> {
  const plainCodes: string[] = [];
  const hashedCodes: BackupCode[] = [];

  for (let i = 0; i < 5; i++) {
    const code = generateBackupCode();
    plainCodes.push(code);
    hashedCodes.push({
      code: await hashPin(code),
      used: false,
    });
  }

  return { plainCodes, hashedCodes };
}

/**
 * Verify a backup code against stored hashed codes
 * @param inputCode - The backup code entered by user
 * @param storedCodes - Array of stored backup codes
 * @returns Index of matching code if found and unused, -1 otherwise
 */
export async function verifyBackupCode(
  inputCode: string,
  storedCodes: BackupCode[]
): Promise<number> {
  const normalizedInput = inputCode.toUpperCase().replace(/[^A-Z0-9]/g, '');

  for (let i = 0; i < storedCodes.length; i++) {
    const stored = storedCodes[i];
    if (stored.used) continue;

    const inputHash = await hashPin(normalizedInput);
    // Also try with dash format
    const inputWithDash = normalizedInput.slice(0, 4) + '-' + normalizedInput.slice(4);
    const inputHashWithDash = await hashPin(inputWithDash);

    if (stored.code === inputHash || stored.code === inputHashWithDash) {
      return i;
    }
  }

  return -1;
}

/**
 * Mark a backup code as used
 * @param codes - Array of backup codes
 * @param index - Index of code to mark as used
 * @returns Updated array of backup codes
 */
export function markBackupCodeUsed(codes: BackupCode[], index: number): BackupCode[] {
  return codes.map((code, i) =>
    i === index
      ? { ...code, used: true, usedAt: new Date() }
      : code
  );
}

/**
 * Get device ID for tracking which device locked/unlocked exam
 * Uses a combination of user agent and random ID stored in localStorage
 */
export function getDeviceId(): string {
  const storageKey = 'osce-device-id';
  let deviceId = localStorage.getItem(storageKey);

  if (!deviceId) {
    // Generate a simple device identifier
    const randomPart = Math.random().toString(36).substring(2, 10);
    const timePart = Date.now().toString(36);
    deviceId = `device-${randomPart}-${timePart}`;
    localStorage.setItem(storageKey, deviceId);
  }

  return deviceId;
}

/**
 * Format backup codes for display (adds visual separators)
 * @param codes - Array of plain text backup codes
 * @returns Formatted string for display
 */
export function formatBackupCodesForDisplay(codes: string[]): string {
  return codes.map((code, i) => `${i + 1}. ${code}`).join('\n');
}

/**
 * Copy backup codes to clipboard
 * @param codes - Array of plain text backup codes
 * @returns Promise that resolves when copied
 */
export async function copyBackupCodesToClipboard(codes: string[]): Promise<void> {
  const text = `OSCE App Backup Codes\n${'='.repeat(25)}\n\n${formatBackupCodesForDisplay(codes)}\n\nKeep these codes safe. Each code can only be used once.`;
  await navigator.clipboard.writeText(text);
}
