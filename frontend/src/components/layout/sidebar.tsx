// src/components/layout/Sidebar.tsx
'use client';

import { memo, useCallback, useEffect, useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import modulesConfig from '@/config/modules.json';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  BarChart,
  Blocks,
  BookOpen,
  Building,
  Building2,
  Calculator,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Crown,
  Eye,
  FileBadge,
  FileCheck,
  FileCode,
  FileDown,
  FileInput,
  FileMinus,
  FileOutput,
  FilePlus,
  FileSignature,
  FileSpreadsheet,
  FileText,
  FileUp,
  Gavel,
  Grid2x2,
  Grid3x3,
  History,
  LayoutDashboard,
  LayoutGrid,
  Mail,
  MailCheck,
  MailOpen,
  MailPlus,
  Map,
  Package,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  Palette,
  Radio,
  RefreshCw,
  Scroll,
  ScrollText,
  Search,
  Settings,
  Settings2,
  ShieldAlert,
  Star,
  Trash2,
  UserCheck,
  UserCircle,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  Users2,
  UserX,
  X,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import { useSidebar } from '@/hooks/useSidebar';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { EmailDailyUsage } from '../admin/email-usage-stats';
import { Logo } from './header';

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
  Blocks: Blocks,
  LayoutDashboard: LayoutDashboard,
  Settings2: Settings2,
  Building2: Building2,
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
  CalendarCheck: CalendarCheck,
  FileMinus: FileMinus,
  BarChart: BarChart,
  Users: Users,
  Zap: Zap,
  MailCheck: MailCheck,
  MailPlus: MailPlus,
  Mail: Mail,
  MailOpen: MailOpen,
  Settings: Settings,
  UserCircle: UserCircle,
  Building: Building,
  Palette: Palette,
  History: History,
  // MSBTE Reports specific icons
  ScrollText: ScrollText,
  FileDown: FileDown,
  FileUp: FileUp,
  FileCheck: FileCheck,
  FileOutput: FileOutput,
  FileInput: FileInput,
  BookOpen: BookOpen,
  FileSignature: FileSignature,
  AlertOctagon: AlertOctagon,
  ShieldAlert: ShieldAlert,
  Gavel: Gavel,
  PackagePlus: PackagePlus,
  PackageOpen: PackageOpen,
  ClipboardCheck: ClipboardCheck,
  AlertCircle: AlertCircle,
  Scroll: Scroll,
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
    [onSearch],
  );

  return (
    <div className="flex-shrink-0 px-4 pt-4 pb-3">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search modules..."
          className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pr-3 pl-9 text-sm transition-all placeholder:text-neutral-400 focus:ring-2 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900"
          aria-label="Search modules"
        />
      </div>
    </div>
  );
});

SidebarSearch.displayName = 'SidebarSearch';

// ============================================
// Sidebar Component (Slide-out)
// ============================================
export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredModules, setFilteredModules] = useState<Module[]>(
    modulesConfig.modules as Module[],
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
                (child.description && child.description.toLowerCase().includes(query)),
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

      {/* Sidebar Panel - width auto with max-width */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 z-50 flex h-full max-h-screen w-auto max-w-[400px] min-w-[280px] flex-col border-r border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
            role="navigation"
            aria-label="Main sidebar"
          >
            {/* Header with close button - fixed at top */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <Logo />
              <button
                onClick={close}
                className="flex-shrink-0 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 lg:hidden dark:hover:bg-neutral-800"
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search - fixed */}
            <div className="flex-shrink-0">
              <SidebarSearch onSearch={setSearchQuery} />
              <Separator className="flex-shrink-0" />
            </div>

            {/* Navigation - Scrollable area with flex-1 and overflow-auto */}
            <div className="min-h-0 flex-1 overflow-auto">
              <nav className="space-y-1 px-3 py-3">
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
                  <div className="py-8 text-center">
                    <Search className="mx-auto mb-2 h-8 w-8 text-neutral-400" />
                    <p className="text-sm text-neutral-500">No modules found</p>
                    <p className="mt-1 text-xs text-neutral-400">Try a different search term</p>
                  </div>
                )}
                <EmailDailyUsage />
              </nav>
            </div>
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

  useEffect(() => {
    if (hasChildren && module.children) {
      const hasActiveChild = module.children.some(
        (child) =>
          pathname === `/exam-center${child.route}` ||
          pathname.startsWith(`/exam-center${child.route}/`),
      );
      if (hasActiveChild && !isExpanded) {
        setIsExpanded(true);
      }
    }
  }, [pathname, module.children, hasChildren]);

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
                    'text-primary dark:text-primary bg-neutral-100 dark:bg-neutral-900',
                )}
                aria-expanded={isExpanded}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon
                    className={cn(
                      'h-4 w-4 flex-shrink-0',
                      isActive ? 'text-primary' : 'text-neutral-500',
                    )}
                  />
                  <span className="truncate">{module.name}</span>
                  {module.premium && <Crown className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />}
                  {isMsbteReports && (
                    <Badge className="bg-primary 100 text-primary dark:bg-primary/30 dark:text-primary h-5 flex-shrink-0 border-0 px-1.5 text-[9px]">
                      {reportCount}
                    </Badge>
                  )}
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-shrink-0"
                >
                  <ChevronDown className="h-4 w-4 text-neutral-400" />
                </motion.div>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="text-xs"
            >
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
                  'mt-1 ml-7 space-y-0.5',
                  !isMsbteReports && 'border-l border-neutral-200 pl-2 dark:border-neutral-800',
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
          ? 'text-primary dark:text-primary bg-neutral-100 dark:bg-neutral-900'
          : 'text-neutral-700 dark:text-neutral-300',
      )}
    >
      <Icon
        className={cn('h-4 w-4 flex-shrink-0', isLinkActive ? 'text-primary' : 'text-neutral-500')}
      />
      <span className="flex-1 truncate">
        {module.id?.startsWith('f') ? `${module.name} - ${module.description}` : module.name}
      </span>
      {module.premium && <Crown className="h-3 w-3 flex-shrink-0 text-amber-500" />}
    </Link>
  );

  // Wrap leaf node with tooltip
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="max-w-[200px] text-xs"
        >
          <p>{getTooltipText(module)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
