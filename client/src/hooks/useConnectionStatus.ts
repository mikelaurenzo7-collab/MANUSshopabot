/**
 * useConnectionStatus — Hook to check connection status for all platforms
 * Returns: { isConnected: boolean, connectedAt?: Date, accountName?: string }
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

export interface ConnectionStatus {
  isConnected: boolean;
  connectedAt?: Date;
  accountName?: string | null;
  platform: string;
}

export function useConnectionStatus(platform: string): ConnectionStatus {
  const { data: credentials } = trpc.connectors.listCredentials.useQuery();
  const { data: socialAccounts } = trpc.connectors.listSocialAccounts.useQuery();

  return useMemo(() => {
    // Check ecommerce credentials
    if (credentials) {
      const cred = credentials.find((c: any) => c.platform === platform);
      if (cred) {
        return {
          isConnected: true,
          connectedAt: cred.createdAt ? new Date(cred.createdAt) : undefined,
          accountName: cred.platform,
          platform,
        };
      }
    }

    // Check social accounts
    if (socialAccounts) {
      const account = socialAccounts.find((a: any) => a.platform === platform);
      if (account) {
        return {
          isConnected: true,
          connectedAt: account.updatedAt ? new Date(account.updatedAt) : undefined,
          accountName: account.accountName,
          platform,
        };
      }
    }

    return { isConnected: false, platform };
  }, [credentials, socialAccounts, platform]);
}

export function useAllConnectionStatus() {
  const { data: credentials } = trpc.connectors.listCredentials.useQuery();
  const { data: socialAccounts } = trpc.connectors.listSocialAccounts.useQuery();

  return useMemo(() => {
    const status: Record<string, ConnectionStatus> = {};

    if (credentials) {
      credentials.forEach((c: any) => {
        status[c.platform] = {
          isConnected: true,
          connectedAt: c.createdAt ? new Date(c.createdAt) : undefined,
          accountName: c.platform,
          platform: c.platform,
        };
      });
    }

    if (socialAccounts) {
      socialAccounts.forEach((a: any) => {
        status[a.platform] = {
          isConnected: true,
          connectedAt: a.updatedAt ? new Date(a.updatedAt) : undefined,
          accountName: a.accountName,
          platform: a.platform,
        };
      });
    }

    return status;
  }, [credentials, socialAccounts]);
}
