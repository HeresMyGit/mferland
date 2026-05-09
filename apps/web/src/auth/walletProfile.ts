import type { WalletCharacterPreview } from "@mferland/shared";

export type WalletProfileState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "existing"; character: WalletCharacterPreview }
  | { status: "new" }
  | { status: "error"; message: string };

export function getExistingWalletCharacter(walletProfile: WalletProfileState) {
  return walletProfile.status === "existing" ? walletProfile.character : null;
}

export function isWalletProfilePending(isConnected: boolean, walletProfile: WalletProfileState) {
  return isConnected && (walletProfile.status === "idle" || walletProfile.status === "loading");
}

export function canEnterWalletCharacter({
  hasAddress,
  profilePending,
  profileError,
  inviteRequired,
  hasInviteCode,
  needsCreation,
  cleanName,
}: {
  hasAddress: boolean;
  profilePending: boolean;
  profileError: boolean;
  inviteRequired: boolean;
  hasInviteCode: boolean;
  needsCreation: boolean;
  cleanName: string;
}) {
  return hasAddress
    && !profilePending
    && !profileError
    && !(inviteRequired && !hasInviteCode)
    && (!needsCreation || cleanName.trim().length > 0);
}

export function canRetryWalletProfile({
  hasAddress,
  profilePending,
  profileError,
}: {
  hasAddress: boolean;
  profilePending: boolean;
  profileError: boolean;
}) {
  return hasAddress && !profilePending && profileError;
}

export function getWalletEntryLabel({
  profilePending,
  profileError,
  needsCreation,
  hasExistingCharacter,
}: {
  profilePending: boolean;
  profileError: boolean;
  needsCreation: boolean;
  hasExistingCharacter: boolean;
}) {
  if (profilePending) return "checking saved mfer";
  if (profileError) return "retry wallet check";
  if (hasExistingCharacter) return "continue saved mfer";
  if (needsCreation) return "create verified mfer";
  return "enter as verified mfer";
}
