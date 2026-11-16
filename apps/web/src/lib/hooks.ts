'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Integration, Me, Provider, Role, SocialAccount } from './types';

const RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, EDITOR: 2, VIEWER: 1 };

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), staleTime: 60_000 });
}

/** Mirrors the API's role checks so the UI can hide actions the user can't perform. */
export function useCan(min: Role) {
  const { data } = useMe();
  return data ? RANK[data.role] >= RANK[min] : false;
}

export function useAccounts() {
  return useQuery({ queryKey: ['accounts'], queryFn: () => api<SocialAccount[]>('/accounts') });
}

export function useIntegrations() {
  return useQuery({ queryKey: ['integrations'], queryFn: () => api<Integration[]>('/integrations'), staleTime: 5 * 60_000 });
}

export interface DashboardData {
  stats: {
    scheduled: number;
    scheduledThisWeek: number;
    scheduledDelta: number;
    scheduledAddedToday: number;
    publishedToday: number;
    accounts: number;
    accountsNeedingAttention: number;
    accountsHealthy: number;
    unreadInbox: number;
    engagementRate: number | null;
    engagementRateChange: number | null;
    followers: number;
  };
  postCounts: { all: number; scheduled: number; published: number; failed: number; draft: number };
  issues: {
    id: string;
    type: 'error' | 'warning';
    title: string;
    provider: Provider | null;
    description: string;
    action: { label: string; href: string };
  }[];
  posts: {
    id: string;
    content: string;
    status: import('./types').PostStatus;
    scheduledAt: string | null;
    publishedAt: string | null;
    updatedAt: string;
    author: { id: string; name: string; avatarUrl: string | null } | null;
    targets: { status: string; error: string | null; socialAccount: { id: string; provider: Provider; name: string } }[];
  }[];
  accounts: {
    id: string;
    provider: Provider;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    followers: number | null;
    status: string;
    statusMessage: string | null;
    health: 'active' | 'expiring' | 'expired';
    daysUntilExpiry: number | null;
  }[];
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/dashboard'), refetchInterval: 60_000 });
}
