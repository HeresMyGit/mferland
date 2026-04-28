import type { ClientInput } from "@mferland/shared";

export type TrackedInput = ClientInput & {
  receivedAt: number;
};
