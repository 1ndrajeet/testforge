// src/components/layout/Sidebar.tsx
'use client';

import { memo, useCallback, useEffect, useState } from 'react';

import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Building2,
  Calculator,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Crown,
  Eye,
  FileBadge,
  FileCode,
  FilePlus,
  FileSpreadsheet,
  FileText,
  Grid2x2,
  Grid3x3,
  LayoutDashboard,
  LayoutGrid,
  Map,
  Moon,
  Package,
  PackageCheck,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Star,
  Sun,
  Trash2,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  UserX,
  Users2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useSidebar } from '@/hooks/useSidebar';
import { useUser } from '@/hooks/useUser';

import { cn } from '@/lib/utils';

import modulesConfig from '@/config/modules.json';

import { Skeleton } from '../ui/skeleton';

// ============================================
// Types
// ============================================
interface ModuleChild {
  id: string;
  name: string;
  description?: string;
  route: string;
  icon?: string;
  tooltip?: string;
  premium?: boolean;
  children?: ModuleChild[];
}

interface Module {
  id: string;
  name: string;
  icon: string;
  description: string;
  route: string;
  tooltip?: string;
  order: number;
  premium?: boolean;
  children?: ModuleChild[];
}

// ============================================
// Icon Map
// ============================================
const iconMap: Record<string, any> = {
  LayoutDashboard: LayoutDashboard,
  Building2: Building2,
  FileText: FileText,
  Settings: Settings,
  CalendarDays: CalendarDays,
  UserCog: UserCog,
  Users2: Users2,
  Radio: Radio,
  Grid2x2: Grid2x2,
  LayoutGrid: LayoutGrid,
  FileSpreadsheet: FileSpreadsheet,
  Package: Package,
  Grid3x3: Grid3x3,
  Map: Map,
  UserCheck: UserCheck,
  UserPlus: UserPlus,
  RefreshCw: RefreshCw,
  Trash2: Trash2,
  ClipboardList: ClipboardList,
  UserX: UserX,
  AlertTriangle: AlertTriangle,
  Calculator: Calculator,
  FileCode: FileCode,
  PackageCheck: PackageCheck,
  Eye: Eye,
  Star: Star,
  UserMinus: UserMinus,
  FilePlus: FilePlus,
  FileBadge: FileBadge,
  ChevronRight: ChevronRight,
  ChevronDown: ChevronDown,
  Crown: Crown,
};

// ============================================
// Search Component
// ============================================
const SidebarSearch = memo(({ onSearch }: { onSearch?: (query: string) => void }) => {
  const [query, setQuery] = useState('');

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      onSearch?.(value);
    },
    [onSearch]
  );

  return (
    <div className="px-4 pt-4 pb-3 flex-shrink-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search modules..."
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 py-2 pl-9 pr-3 text-sm placeholder:text-neutral-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 transition-all"
          aria-label="Search modules"
        />
      </div>
    </div>
  );
});

SidebarSearch.displayName = 'SidebarSearch';

// ============================================
// Sidebar Footer
// ============================================
const SidebarFooter = memo(() => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { user, isLoading } = useUser();
  const { close } = useSidebar();

  useEffect(() => {
    setMounted(true);
  }, []);

  const getInitials = useCallback(() => {
    if (!user?.name) return 'U';
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [user?.name]);

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 flex-shrink-0">
      {isLoading ? (
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-3 w-20 mb-1" />
            <Skeleton className="h-2 w-16" />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
              <span className="text-xs font-bold text-white">{getInitials()}</span>
            </div>
            <div>
              <p className="text-xs font-medium truncate max-w-[120px]">{user?.name || 'User'}</p>
              <p className="text-[10px] text-neutral-500 truncate max-w-[120px]">
                {user?.email?.split('@')[0] || 'user'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Toggle theme"
            >
              {mounted &&
                (theme === 'dark' ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                ))}
            </button>
            <Link
              href="/settings"
              onClick={close}
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
});

SidebarFooter.displayName = 'SidebarFooter';

// ============================================
// Sidebar Component (Slide-out)
// ============================================
export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredModules, setFilteredModules] = useState<Module[]>(
    modulesConfig.modules as Module[]
  );

  // Filter modules based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredModules(modulesConfig.modules);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filterModules = (modules: Module[]): Module[] => {
      return modules
        .map((module) => {
          // Check if module matches
          const moduleMatches =
            module.name.toLowerCase().includes(query) ||
            module.description.toLowerCase().includes(query);

          // Filter children
          let filteredChildren: ModuleChild[] | undefined;
          if (module.children) {
            filteredChildren = module.children.filter(
              (child) =>
                child.name.toLowerCase().includes(query) ||
                (child.description && child.description.toLowerCase().includes(query))
            );
          }

          // Include if module matches OR has matching children
          if (moduleMatches || (filteredChildren && filteredChildren.length > 0)) {
            return {
              ...module,
              children: filteredChildren,
            };
          }
          return null;
        })
        .filter(Boolean) as Module[];
    };

    setFilteredModules(filterModules(modulesConfig.modules as Module[]));
  }, [searchQuery]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, close]);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 z-50 h-full w-80 bg-white dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800 flex flex-col shadow-2xl"
            role="navigation"
            aria-label="Main sidebar"
          >
            {/* Header with close button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">TF</span>
                </div>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  TestForge
                </span>
                <Badge variant="outline" className="text-[9px] px-1">
                  v{modulesConfig.version}
                </Badge>
              </div>
              <button
                onClick={close}
                className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors lg:hidden"
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <SidebarSearch onSearch={setSearchQuery} />

            <Separator className="flex-shrink-0" />

            {/* Navigation - Scrollable area */}
            <ScrollArea className="flex-1">
              <nav className="px-3 py-3 space-y-1">
                {filteredModules.map((module) => (
                  <NavItem
                    key={module.id}
                    module={module}
                    pathname={pathname}
                    onNavigate={close}
                    level={0}
                    searchQuery={searchQuery}
                  />
                ))}

                {/* Empty state for search */}
                {filteredModules.length === 0 && (
                  <div className="text-center py-8">
                    <Search className="h-8 w-8 mx-auto text-neutral-400 mb-2" />
                    <p className="text-sm text-neutral-500">No modules found</p>
                    <p className="text-xs text-neutral-400 mt-1">Try a different search term</p>
                  </div>
                )}
              </nav>
            </ScrollArea>

            {/* Footer */}
            <SidebarFooter />
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================
// Navigation Item (Recursive)
// ============================================
interface NavItemProps {
  module: Module | ModuleChild;
  pathname: string;
  onNavigate?: () => void;
  level: number;
  searchQuery?: string;
}

function NavItem({ module, pathname, onNavigate, level, searchQuery }: NavItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = module.children && module.children.length > 0;
  const Icon = iconMap[module.icon || 'FileText'] || FileText;
  const isActive =
    pathname === `/exam-center${module.route}` ||
    pathname.startsWith(`/exam-center${module.route}/`);

  // Auto-expand when searching
  useEffect(() => {
    if (searchQuery && hasChildren && module.children?.length) {
      setIsExpanded(true);
    }
  }, [searchQuery, hasChildren, module.children]);

  // Auto-expand if child is active
  useEffect(() => {
    if (hasChildren && module.children) {
      const hasActiveChild = module.children.some(
        (child) =>
          pathname === `/exam-center${child.route}` ||
          pathname.startsWith(`/exam-center${child.route}/`)
      );
      if (hasActiveChild && !isExpanded) {
        setIsExpanded(true);
      }
    }
  }, [pathname, module.children, hasChildren, isExpanded]);

  const handleToggle = useCallback(() => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  }, [hasChildren, isExpanded]);

  const handleNavigate = useCallback(() => {
    if (!hasChildren && onNavigate) {
      onNavigate();
    }
  }, [hasChildren, onNavigate]);

  // Get tooltip text
  const getTooltipText = (item: Module | ModuleChild): string => {
    if ((item as ModuleChild).tooltip) return (item as ModuleChild).tooltip!;
    if (item.description) return item.description;
    return item.name;
  };

  // MSBTE Reports special handling
  const isMsbteReports = module.id === 'msbte-reports' && level === 1;
  const reportCount = isMsbteReports ? module.children?.length || 22 : 0;

  // Parent with children
  if (hasChildren) {
    return (
      <div className="space-y-1">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleToggle}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                  'hover:bg-neutral-100 dark:hover:bg-neutral-900',
                  isActive &&
                    !hasChildren &&
                    'bg-neutral-100 dark:bg-neutral-900 text-emerald-600 dark:text-emerald-400'
                )}
                aria-expanded={isExpanded}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn('h-4 w-4', isActive ? 'text-emerald-500' : 'text-neutral-500')}
                  />
                  <span>{module.name}</span>
                  {module.premium && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                  {isMsbteReports && (
                    <Badge className="h-5 px-1.5 text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                      {reportCount}
                    </Badge>
                  )}
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-4 w-4 text-neutral-400" />
                </motion.div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {getTooltipText(module)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  'ml-7 mt-1 space-y-0.5',
                  !isMsbteReports && 'border-l border-neutral-200 dark:border-neutral-800 pl-2'
                )}
              >
                {module.children?.map((child) => (
                  <NavItem
                    key={child.id}
                    module={child}
                    pathname={pathname}
                    onNavigate={onNavigate}
                    level={level + 1}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Leaf node - use Link for navigation
  const linkHref = `/exam-center${module.route}`;
  const isLinkActive = pathname === linkHref || pathname.startsWith(`${linkHref}/`);

  const linkContent = (
    <Link
      href={linkHref}
      onClick={handleNavigate}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
        'hover:bg-neutral-100 dark:hover:bg-neutral-900',
        isLinkActive
          ? 'bg-neutral-100 dark:bg-neutral-900 text-emerald-600 dark:text-emerald-400'
          : 'text-neutral-700 dark:text-neutral-300'
      )}
    >
      <Icon className={cn('h-4 w-4', isLinkActive ? 'text-emerald-500' : 'text-neutral-500')} />
      <span className="flex-1 truncate">
        {module.id?.startsWith('f') ? `${module.name} - ${module.description}` : module.name}
      </span>
      {module.premium && <Crown className="h-3 w-3 text-amber-500" />}
    </Link>
  );

  // Wrap leaf node with tooltip
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs max-w-[200px]">
          <p>{getTooltipText(module)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
