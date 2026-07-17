// modules/admin/admin-panel.tsx

'use client';

import { useCallback, useEffect, useState } from 'react';

import { format } from 'date-fns';
import {
  Activity,
  Banknote,
  Bell,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Crown,
  Download,
  FileText,
  Mail,
  MailCheck,
  MailX,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Trash2,
  User,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  createPromoCode,
  deleteOrganization,
  deletePromoCode,
  deleteUser,
  getAdminStats,
  getAuditLogs,
  getEmailLogs,
  getOrganizations,
  getPayments,
  getPromoCodes,
  getSystemHealth,
  getUsers,
  updateOrganization,
  updateUserRole,
} from '@/lib/actions/admin';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { PageHeader } from '@/components/layout/page-layout';

import { useAuth } from '@/components/auth/AuthProvider';

// ============================================================================
// Types
// ============================================================================

interface StatCard {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color?: string;
  subtext?: string;
}

// ============================================================================
// Stat Cards
// ============================================================================

const StatCards = ({ stats, loading }: { stats: any; loading: boolean }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-28 rounded-xl"
          />
        ))}
      </div>
    );
  }

  const cards: StatCard[] = [
    { label: 'Organizations', value: stats.totalOrgs, icon: Building2 },
    { label: 'Users', value: stats.totalUsers, icon: Users },
    { label: 'Exam Centers', value: stats.totalExamCenters, icon: Activity },
    { label: 'Students', value: stats.totalStudents, icon: User, color: 'text-blue-600' },
    { label: 'Staff', value: stats.totalStaff, icon: UserCog, color: 'text-purple-600' },
    {
      label: 'Active Subs',
      value: stats.activeSubscriptions,
      icon: Crown,
      color: 'text-emerald-500',
    },
    {
      label: 'Trial',
      value: stats.trialOrgs,
      icon: UserCog,
      color: 'text-amber-500',
    },
    {
      label: 'Revenue',
      value: `₹${(stats.totalRevenue / 100).toLocaleString()}`,
      icon: Banknote,
      color: 'text-emerald-600',
      subtext: `₹${(stats.monthlyRevenue / 100).toLocaleString()} this month`,
    },
    {
      label: 'Payments',
      value: stats.totalPayments,
      icon: Banknote,
    },
    {
      label: 'Emails',
      value: stats.totalEmails,
      icon: Mail,
      subtext: `${stats.failedEmails} failed`,
    },
    {
      label: 'Uploads',
      value: stats.totalUploads,
      icon: Download,
    },
    {
      label: 'Orders',
      value: stats.totalOrders,
      icon: FileText,
      color: 'text-indigo-600',
    },
    {
      label: 'Allocations',
      value: stats.totalAllocations,
      icon: Activity,
      color: 'text-teal-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card
            key={idx}
            className="group relative overflow-hidden border-0 bg-gradient-to-br from-white to-neutral-50/50 shadow-sm transition-all hover:shadow-md dark:from-neutral-950 dark:to-neutral-900/50"
          >
            <div className="absolute top-0 right-0 left-0 h-0.5 bg-gradient-to-r from-emerald-500/50 via-blue-500/50 to-purple-500/50 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-500/5 to-blue-500/5 blur-2xl transition-opacity group-hover:opacity-100" />
            <CardContent className="relative p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {card.label}
                  </p>
                  <p className={cn('mt-0.5 text-2xl font-bold tracking-tight', card.color)}>
                    {card.value}
                  </p>
                  {card.subtext && (
                    <p className="truncate text-[10px] text-neutral-400">{card.subtext}</p>
                  )}
                </div>
                <div
                  className={cn(
                    'rounded-xl p-2.5 transition-all group-hover:scale-105',
                    card.color
                      ? card.color.replace('text-', 'bg-').replace('dark:', '') + '/10'
                      : 'bg-neutral-100 dark:bg-neutral-800',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      card.color || 'text-neutral-500 dark:text-neutral-400',
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// ============================================================================
// System Health Card
// ============================================================================

const SystemHealthCard = () => {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    const result = await getSystemHealth();
    if (result.success) {
      setHealth(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!health) return null;

  const isHealthy = health.status === 'healthy';

  return (
    <Card
      className={cn(
        'border-0 shadow-sm transition-all hover:shadow-md',
        isHealthy
          ? 'bg-gradient-to-r from-emerald-50/50 to-emerald-100/30 dark:from-emerald-950/20 dark:to-emerald-900/10'
          : 'bg-gradient-to-r from-amber-50/50 to-amber-100/30 dark:from-amber-950/20 dark:to-amber-900/10',
      )}
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'rounded-full p-2.5',
                isHealthy
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
              )}
            >
              {isHealthy ? <CheckCircle className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">System {isHealthy ? 'Healthy' : 'Degraded'}</p>
                <Badge
                  variant={isHealthy ? 'default' : 'destructive'}
                  className="text-[10px] font-medium"
                >
                  {health.status}
                </Badge>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {health.emailFailures24h > 0 &&
                  `${health.emailFailures24h} email failures in 24h · `}
                {health.pendingUploads > 0 && `${health.pendingUploads} pending uploads`}
                {health.emailFailures24h === 0 &&
                  health.pendingUploads === 0 &&
                  'All systems operational'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Database: {health.database}
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">Frontend: {health.frontend}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">
              Last checked: {format(new Date(health.timestamp), 'HH:mm:ss')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================================
// Organizations Tab
// ============================================================================

const OrganizationsTab = () => {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const result = await getOrganizations({
      search: search || undefined,
      tier: filterTier === 'all' ? undefined : filterTier,
      limit: 20,
      offset: (page - 1) * 20,
    });
    if (result.success) {
      setOrgs(result.data);
      setTotal(result.total);
    } else {
      toast.error(result.error || 'Failed to fetch organizations');
    }
    setLoading(false);
  }, [search, filterTier, page]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const handleUpdateTier = async (id: string, tier: string) => {
    const result = await updateOrganization(id, { subscriptionTier: tier as any });
    if (result.success) {
      toast.success('Organization updated');
      fetchOrgs();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this organization?')) return;
    const result = await deleteOrganization(id);
    if (result.success) {
      toast.success('Organization deleted');
      fetchOrgs();
    }
  };

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      enterprise:
        'border-amber-500/30 text-amber-700 bg-amber-50/50 dark:border-amber-800/30 dark:text-amber-400 dark:bg-amber-950/20',
      premium:
        'border-emerald-500/30 text-emerald-700 bg-emerald-50/50 dark:border-emerald-800/30 dark:text-emerald-400 dark:bg-emerald-950/20',
      trial:
        'border-blue-500/30 text-blue-700 bg-blue-50/50 dark:border-blue-800/30 dark:text-blue-400 dark:bg-blue-950/20',
      inactive:
        'border-neutral-300/30 text-neutral-600 bg-neutral-50/50 dark:border-neutral-700/30 dark:text-neutral-400 dark:bg-neutral-900/20',
    };
    return colors[tier] || colors.inactive;
  };

  if (loading && page === 1) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl border-neutral-200/60 bg-white/50 pl-9 backdrop-blur-sm focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-800/60 dark:bg-neutral-950/50"
          />
        </div>
        <Select
          value={filterTier}
          onValueChange={setFilterTier}
        >
          <SelectTrigger className="h-10 w-36 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={fetchOrgs}
          className="h-10 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm hover:bg-neutral-100 dark:border-neutral-800/60 dark:bg-neutral-950/50 dark:hover:bg-neutral-900"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
        <Table>
          <TableHeader className="bg-neutral-50/50 dark:bg-neutral-900/30">
            <TableRow>
              <TableHead className="w-6" />
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Organization
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Slug
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Tier
              </TableHead>
              <TableHead className="text-right text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Expires
              </TableHead>
              <TableHead className="text-center text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Centers
              </TableHead>
              <TableHead className="text-center text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Users
              </TableHead>
              <TableHead className="text-center text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Payments
              </TableHead>
              <TableHead className="text-right text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
                    <p className="text-sm text-neutral-500">No organizations found</p>
                    <p className="text-xs text-neutral-400">Try adjusting your search or filters</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              orgs.map((org) => (
                <>
                  <TableRow
                    key={org.id}
                    className="transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30"
                  >
                    <TableCell>
                      <button
                        onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}
                        className="p-1 text-neutral-400 transition-colors hover:text-neutral-600"
                      >
                        {expandedOrg === org.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="font-semibold">{org.name}</TableCell>
                    <TableCell className="font-mono text-sm text-neutral-500 dark:text-neutral-400">
                      {org.slug}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn('border font-medium', getTierBadge(org.subscriptionTier))}
                      >
                        {org.subscriptionTier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-neutral-600 dark:text-neutral-400">
                      {org.subscriptionExpiresAt
                        ? format(new Date(org.subscriptionExpiresAt), 'dd MMM yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-center font-medium">{org.examCenterCount}</TableCell>
                    <TableCell className="text-center font-medium">{org.userCount}</TableCell>
                    <TableCell className="text-center font-medium">{org.paymentCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Select
                          value={org.subscriptionTier}
                          onValueChange={(v) => handleUpdateTier(org.id, v)}
                        >
                          <SelectTrigger className="h-8 w-28 rounded-lg border-neutral-200/60 bg-white/50 text-xs dark:border-neutral-800/60 dark:bg-neutral-950/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                            <SelectItem value="premium">Premium</SelectItem>
                            <SelectItem value="trial">Trial</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(org.id)}
                          className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedOrg === org.id && (
                    <TableRow className="bg-neutral-50/30 dark:bg-neutral-900/20">
                      <TableCell
                        colSpan={9}
                        className="p-4"
                      >
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                              Organization Details
                            </p>
                            <div className="mt-2 space-y-1">
                              <p>
                                <span className="text-neutral-500">ID:</span>{' '}
                                <span className="font-mono text-xs">{org.id}</span>
                              </p>
                              <p>
                                <span className="text-neutral-500">Owner:</span> {org.ownerId}
                              </p>
                              <p>
                                <span className="text-neutral-500">Created:</span>{' '}
                                {format(new Date(org.createdAt), 'dd MMM yyyy HH:mm')}
                              </p>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                              Quick Actions
                            </p>
                            <div className="mt-2 flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg border-neutral-200/60 text-xs"
                              >
                                View Details
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg border-neutral-200/60 text-xs"
                              >
                                View Users
                              </Button>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
        <span>
          Showing <span className="font-medium">{orgs.length}</span> of{' '}
          <span className="font-medium">{total}</span> organizations
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Users Tab
// ============================================================================

const UsersTab = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const result = await getUsers({
      search: search || undefined,
      limit: 20,
      offset: (page - 1) * 20,
    });
    if (result.success) {
      setUsers(result.data);
      setTotal(result.total);
    } else {
      toast.error(result.error || 'Failed to fetch users');
    }
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, role: string) => {
    const result = await updateUserRole(userId, role as any);
    if (result.success) {
      toast.success('User role updated');
      fetchUsers();
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Delete this user?')) return;
    const result = await deleteUser(userId);
    if (result.success) {
      toast.success('User deleted');
      fetchUsers();
    }
  };

  if (loading && page === 1) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl border-neutral-200/60 bg-white/50 pl-9 backdrop-blur-sm focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-800/60 dark:bg-neutral-950/50"
          />
        </div>
        <Button
          variant="outline"
          onClick={fetchUsers}
          className="h-10 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm hover:bg-neutral-100 dark:border-neutral-800/60 dark:bg-neutral-950/50 dark:hover:bg-neutral-900"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
        <Table>
          <TableHeader className="bg-neutral-50/50 dark:bg-neutral-900/30">
            <TableRow>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                User
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Email
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Verified
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Role
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Organization
              </TableHead>
              <TableHead className="text-right text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
                    <p className="text-sm text-neutral-500">No users found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow
                  key={user.id}
                  className="transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30"
                >
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-sm">{user.email}</TableCell>
                  <TableCell>
                    {user.emailVerified ? (
                      <Badge className="border-emerald-500/30 bg-emerald-50/50 text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-neutral-300/30 text-neutral-400"
                      >
                        <XCircle className="mr-1 h-3 w-3" />
                        Unverified
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium"
                    >
                      {user.role || 'member'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-neutral-500 dark:text-neutral-400">
                    {user.organization?.name || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Select
                        value={user.role || 'member'}
                        onValueChange={(v) => handleRoleChange(user.id, v)}
                      >
                        <SelectTrigger className="h-8 w-24 rounded-lg border-neutral-200/60 bg-white/50 text-xs dark:border-neutral-800/60 dark:bg-neutral-950/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(user.id)}
                        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
        <span>
          Showing <span className="font-medium">{users.length}</span> of{' '}
          <span className="font-medium">{total}</span> users
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Email Logs Tab
// ============================================================================

const EmailLogsTab = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const result = await getEmailLogs({
      status: status === 'all' ? undefined : (status as any),
      search: search || undefined,
      limit: 20,
      offset: (page - 1) * 20,
    });
    if (result.success) {
      setLogs(result.data);
      setTotal(result.total);
    } else {
      toast.error(result.error || 'Failed to fetch email logs');
    }
    setLoading(false);
  }, [status, search, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (loading && page === 1) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl border-neutral-200/60 bg-white/50 pl-9 backdrop-blur-sm focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-800/60 dark:bg-neutral-950/50"
          />
        </div>
        <Select
          value={status}
          onValueChange={setStatus}
        >
          <SelectTrigger className="h-10 w-36 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={fetchLogs}
          className="h-10 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm hover:bg-neutral-100 dark:border-neutral-800/60 dark:bg-neutral-950/50 dark:hover:bg-neutral-900"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
        <Table>
          <TableHeader className="bg-neutral-50/50 dark:bg-neutral-900/30">
            <TableRow>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Date
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Recipient
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Subject
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Type
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Status
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Error
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Mail className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
                    <p className="text-sm text-neutral-500">No email logs found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow
                  key={log.id}
                  className="transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30"
                >
                  <TableCell className="text-sm whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                    {format(new Date(log.sentAt), 'dd MMM HH:mm')}
                  </TableCell>
                  <TableCell className="font-medium">{log.recipientEmail}</TableCell>
                  <TableCell className="max-w-xs truncate">{log.subject}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium"
                    >
                      {log.orderType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.status === 'sent' ? (
                      <Badge className="border-emerald-500/30 bg-emerald-50/50 text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400">
                        <MailCheck className="mr-1 h-3 w-3" />
                        Sent
                      </Badge>
                    ) : (
                      <Badge
                        variant="destructive"
                        className="text-xs"
                      >
                        <MailX className="mr-1 h-3 w-3" />
                        Failed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-red-500">
                    {log.errorMessage || '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
        <span>
          Showing <span className="font-medium">{logs.length}</span> of{' '}
          <span className="font-medium">{total}</span> logs
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Payments Tab
// ============================================================================

const PaymentsTab = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const result = await getPayments({
      status: status === 'all' ? undefined : status,
      limit: 20,
      offset: (page - 1) * 20,
    });
    if (result.success) {
      setPayments(result.data);
      setTotal(result.total);
    } else {
      toast.error(result.error || 'Failed to fetch payments');
    }
    setLoading(false);
  }, [status, page]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  if (loading && page === 1) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select
          value={status}
          onValueChange={setStatus}
        >
          <SelectTrigger className="h-10 w-40 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={fetchPayments}
          className="h-10 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm hover:bg-neutral-100 dark:border-neutral-800/60 dark:bg-neutral-950/50 dark:hover:bg-neutral-900"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
        <Table>
          <TableHeader className="bg-neutral-50/50 dark:bg-neutral-900/30">
            <TableRow>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Organization
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Plan
              </TableHead>
              <TableHead className="text-right text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Amount
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Status
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Date
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Payment ID
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Banknote className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
                    <p className="text-sm text-neutral-500">No payments found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => (
                <TableRow
                  key={payment.id}
                  className="transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30"
                >
                  <TableCell className="font-medium">{payment.organization?.name || '—'}</TableCell>
                  <TableCell>{payment.planName}</TableCell>
                  <TableCell className="text-right font-semibold">
                    ₹{(payment.amount / 100).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        'font-medium',
                        payment.status === 'paid' &&
                          'border-emerald-500/30 bg-emerald-50/50 text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400',
                        payment.status === 'pending' &&
                          'border-amber-500/30 bg-amber-50/50 text-amber-700 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-400',
                        payment.status === 'failed' &&
                          'border-red-500/30 bg-red-50/50 text-red-700 dark:border-red-800/30 dark:bg-red-950/20 dark:text-red-400',
                        payment.status === 'refunded' &&
                          'border-neutral-300/30 bg-neutral-50/50 text-neutral-600 dark:border-neutral-700/30 dark:bg-neutral-900/20 dark:text-neutral-400',
                      )}
                    >
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-neutral-600 dark:text-neutral-400">
                    {format(new Date(payment.createdAt), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-neutral-500 dark:text-neutral-400">
                    {payment.razorpayPaymentId?.slice(0, 12) || '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
        <span>
          Showing <span className="font-medium">{payments.length}</span> of{' '}
          <span className="font-medium">{total}</span> payments
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Audit Logs Tab
// ============================================================================

const AuditLogsTab = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const result = await getAuditLogs({
      search: search || undefined,
      type: type === 'all' ? undefined : type,
      limit: 20,
      offset: (page - 1) * 20,
    });
    if (result.success) {
      setLogs(result.data);
      setTotal(result.total);
    } else {
      toast.error(result.error || 'Failed to fetch audit logs');
    }
    setLoading(false);
  }, [search, type, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (loading && page === 1) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl border-neutral-200/60 bg-white/50 pl-9 backdrop-blur-sm focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-800/60 dark:bg-neutral-950/50"
          />
        </div>
        <Select
          value={type}
          onValueChange={setType}
        >
          <SelectTrigger className="h-10 w-40 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
            <SelectItem value="upload">Upload</SelectItem>
            <SelectItem value="auth">Auth</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={fetchLogs}
          className="h-10 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm hover:bg-neutral-100 dark:border-neutral-800/60 dark:bg-neutral-950/50 dark:hover:bg-neutral-900"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
        <Table>
          <TableHeader className="bg-neutral-50/50 dark:bg-neutral-900/30">
            <TableRow>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Time
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                User
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Action
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Entity
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Details
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Activity className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
                    <p className="text-sm text-neutral-500">No audit logs found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow
                  key={log.id}
                  className="transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30"
                >
                  <TableCell className="text-sm whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                    {format(new Date(log.createdAt), 'dd MMM HH:mm:ss')}
                  </TableCell>
                  <TableCell>{log.user?.name || 'System'}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium"
                    >
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-neutral-500 dark:text-neutral-400">
                    {log.entityType}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-neutral-500 dark:text-neutral-400">
                    {log.entityId || '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
        <span>
          Showing <span className="font-medium">{logs.length}</span> of{' '}
          <span className="font-medium">{total}</span> logs
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border-neutral-200/60"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Promo Codes Tab
// ============================================================================

const PromoCodesTab = () => {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCode, setNewCode] = useState({
    code: '',
    type: 'trial',
    durationDays: 30,
    amount: 100,
    expiresAt: '',
  });

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    const result = await getPromoCodes();
    if (result.success) {
      setCodes(result.data);
    } else {
      toast.error(result.error || 'Failed to fetch promo codes');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const handleCreate = async () => {
    if (!newCode.code) {
      toast.error('Code is required');
      return;
    }
    const result = await createPromoCode({
      ...newCode,
      expiresAt: newCode.expiresAt ? new Date(newCode.expiresAt) : undefined,
    });
    if (result.success) {
      toast.success('Promo code created');
      fetchCodes();
      setDialogOpen(false);
      setNewCode({ code: '', type: 'trial', durationDays: 30, amount: 100, expiresAt: '' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this promo code?')) return;
    const result = await deletePromoCode(id);
    if (result.success) {
      toast.success('Promo code deleted');
      fetchCodes();
    }
  };

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {codes.length} promo code{codes.length !== 1 ? 's' : ''}
        </p>
        <Button
          onClick={() => setDialogOpen(true)}
          className="gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm hover:shadow-md"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Create Code
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white/50 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/50">
        <Table>
          <TableHeader className="bg-neutral-50/50 dark:bg-neutral-900/30">
            <TableRow>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Code
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Type
              </TableHead>
              <TableHead className="text-right text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Amount
              </TableHead>
              <TableHead className="text-center text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Status
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Expires
              </TableHead>
              <TableHead className="text-right text-xs font-medium tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Plus className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
                    <p className="text-sm text-neutral-500">No promo codes found</p>
                    <p className="text-xs text-neutral-400">Create your first promo code</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              codes.map((code) => (
                <TableRow
                  key={code.id}
                  className="transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30"
                >
                  <TableCell className="font-mono font-medium">{code.code}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium"
                    >
                      {code.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    ₹{(code.amount / 100).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">
                    {code.isUsed ? (
                      <Badge
                        variant="destructive"
                        className="text-xs"
                      >
                        Used
                      </Badge>
                    ) : (
                      <Badge className="border-emerald-500/30 bg-emerald-50/50 text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400">
                        Available
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-600 dark:text-neutral-400">
                    {code.expiresAt ? format(new Date(code.expiresAt), 'dd MMM yyyy') : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(code.id)}
                      className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <DialogContent className="max-w-md rounded-2xl border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Shield className="h-5 w-5 text-emerald-500" />
              Create Promo Code
            </DialogTitle>
            <DialogDescription>Create a new promo code for trials or discounts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={newCode.code}
                onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                placeholder="e.g., TRIAL2024"
                className="rounded-xl border-neutral-200/60 font-mono focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={newCode.type}
                  onValueChange={(v) => setNewCode({ ...newCode, type: v })}
                >
                  <SelectTrigger className="rounded-xl border-neutral-200/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial 30 Day</SelectItem>
                    <SelectItem value="discount">Discount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount (paise)</Label>
                <Input
                  type="number"
                  value={newCode.amount}
                  onChange={(e) => setNewCode({ ...newCode, amount: Number(e.target.value) })}
                  className="rounded-xl border-neutral-200/60 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Duration (days)</Label>
                <Input
                  type="number"
                  value={newCode.durationDays}
                  onChange={(e) => setNewCode({ ...newCode, durationDays: Number(e.target.value) })}
                  className="rounded-xl border-neutral-200/60 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div className="space-y-2">
                <Label>Expires At</Label>
                <Input
                  type="date"
                  value={newCode.expiresAt}
                  onChange={(e) => setNewCode({ ...newCode, expiresAt: e.target.value })}
                  className="rounded-xl border-neutral-200/60 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="rounded-xl border-neutral-200/60"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm hover:shadow-md"
            >
              Create Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ============================================================================
// Main Admin Panel
// ============================================================================

export default function AdminPanel() {
  const { user } = useUserInfo();
  const { role } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('organizations');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const result = await getAdminStats();
    if (result.success) {
      setStats(result.data);
    } else {
      toast.error(result.error || 'Failed to fetch admin stats');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Allow both 'owner' and 'admin'
  if (role !== 'owner' && role !== 'admin') {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30">
            <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            You don't have permission to view this page. Only organization owners and admins can
            access the admin panel.
          </p>
          <Button className="mt-6 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm hover:shadow-md">
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Panel"
        description="Monitor and manage the entire TestForge platform from one place"
        icon={Settings}
        actions={
          <div className="flex items-center gap-2">
            <Badge className="border-0 bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 text-emerald-700 dark:from-emerald-400/20 dark:to-emerald-500/20 dark:text-emerald-400">
              <Shield className="mr-1 h-3 w-3" />
              Admin
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStats}
              className="gap-2 rounded-xl border-neutral-200/60 bg-white/50 backdrop-blur-sm hover:bg-neutral-100 dark:border-neutral-800/60 dark:bg-neutral-950/50 dark:hover:bg-neutral-900"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      <StatCards
        stats={stats}
        loading={loading}
      />

      <SystemHealthCard />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
          <TabsTrigger
            value="organizations"
            className="rounded-xl px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-950"
          >
            <Building2 className="mr-2 h-4 w-4" />
            Organizations
          </TabsTrigger>
          <TabsTrigger
            value="users"
            className="rounded-xl px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-950"
          >
            <Users className="mr-2 h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger
            value="emails"
            className="rounded-xl px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-950"
          >
            <Mail className="mr-2 h-4 w-4" />
            Email Logs
          </TabsTrigger>
          <TabsTrigger
            value="payments"
            className="rounded-xl px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-950"
          >
            <Banknote className="mr-2 h-4 w-4" />
            Payments
          </TabsTrigger>
          <TabsTrigger
            value="audit"
            className="rounded-xl px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-950"
          >
            <Activity className="mr-2 h-4 w-4" />
            Audit Logs
          </TabsTrigger>
          <TabsTrigger
            value="promo"
            className="rounded-xl px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-950"
          >
            <Plus className="mr-2 h-4 w-4" />
            Promo Codes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
          <OrganizationsTab />
        </TabsContent>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>

        <TabsContent value="emails">
          <EmailLogsTab />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsTab />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogsTab />
        </TabsContent>

        <TabsContent value="promo">
          <PromoCodesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
