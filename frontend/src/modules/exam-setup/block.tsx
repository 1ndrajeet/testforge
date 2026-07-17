// app/exam-center/exam-setup/blocks/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AlignJustify,
  ArrowLeftRight,
  ArrowRightLeft,
  Blocks,
  Download,
  Edit,
  FileSpreadsheet,
  Grid3X3,
  Layers,
  LayoutGrid,
  LucideIcon,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  bulkCreateBlocks,
  createBlock,
  deleteBlock,
  getBlocks,
  getBlockStats,
  updateBlock,
} from '@/lib/actions2/block';
import { cn } from '@/lib/utils';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { PageHeader, PageToolbar } from '@/components/layout/page-layout';

// ============================================================================
// Types
// ============================================================================

interface Block {
  id: string;
  blockNo: string;
  location: string;
  name: string;
  strength: number;
  distribution: number[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface BlockStats {
  totalBlocks: number;
  totalCapacity: number;
  averageCapacity: number;
}

type SeatingTemplate = 'reverse-zigzag' | 'reverse' | 'linear' | 'linear-zigzag';

const BLOCK_CSV_HEADERS = ['Block No', 'Name', 'Location', 'Strength', 'Distribution'];

const TEMPLATE_MAP: Record<SeatingTemplate, number> = {
  'reverse-zigzag': 1,
  reverse: 2,
  linear: 3,
  'linear-zigzag': 4,
};

interface TemplateOption {
  id: SeatingTemplate;
  name: string;
  description: string;
  icon: LucideIcon;
}

function blockToCSVRow(block: Block): string[] {
  return [
    block.blockNo,
    block.name,
    block.location,
    String(block.strength),
    block.distribution.join('|'),
  ];
}

function csvRowToBlock(row: string[]): Partial<Block> {
  const [blockNo, name, location, strength, distribution] = row;
  return {
    blockNo: blockNo?.trim() || '',
    name: name?.trim() || '',
    location: location?.trim() || '',
    strength: parseInt(strength) || 0,
    distribution:
      distribution
        ?.split('|')
        .map(Number)
        .filter((n) => !isNaN(n)) || [],
  };
}

function downloadCSV(data: string[][], filename: string) {
  const csvContent = data.map((row) => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'reverse-zigzag',
    name: 'Reverse Zigzag',
    description: 'Starts top-right, snakes bottom-up',
    icon: ArrowRightLeft,
  },
  {
    id: 'reverse',
    name: 'Reverse Linear',
    description: 'Starts top-right, fills top-bottom',
    icon: ArrowLeftRight,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Starts top-left, fills top-bottom',
    icon: AlignJustify,
  },
  {
    id: 'linear-zigzag',
    name: 'Linear Zigzag',
    description: 'Starts top-left, snakes bottom-up',
    icon: Zap,
  },
];

// ============================================================================
// Seating Arrangement Generator
// ============================================================================

const generateSeatingArrangement = (
  seatNumbers: number[],
  distribution: number[],
  template: SeatingTemplate,
): (number | null)[][] => {
  const cols = distribution.length;
  const maxRows = Math.max(...distribution);
  const grid: (number | null)[][] = Array(cols)
    .fill(null)
    .map(() => Array(maxRows).fill(null));
  let seatIndex = 0;

  switch (template) {
    case 'reverse': {
      for (let col = cols - 1; col >= 0; col--) {
        const colSize = distribution[col];
        for (let row = 0; row < colSize && seatIndex < seatNumbers.length; row++) {
          grid[col][row] = seatNumbers[seatIndex++];
        }
      }
      break;
    }
    case 'linear': {
      for (let col = 0; col < cols; col++) {
        const colSize = distribution[col];
        for (let row = 0; row < colSize && seatIndex < seatNumbers.length; row++) {
          grid[col][row] = seatNumbers[seatIndex++];
        }
      }
      break;
    }
    case 'linear-zigzag': {
      for (let col = 0; col < cols; col++) {
        const colSize = distribution[col];
        if (col % 2 === 0) {
          for (let row = 0; row < colSize && seatIndex < seatNumbers.length; row++) {
            grid[col][row] = seatNumbers[seatIndex++];
          }
        } else {
          for (let row = colSize - 1; row >= 0 && seatIndex < seatNumbers.length; row--) {
            grid[col][row] = seatNumbers[seatIndex++];
          }
        }
      }
      break;
    }
    case 'reverse-zigzag':
    default: {
      for (let col = cols - 1; col >= 0; col--) {
        const colSize = distribution[col];
        const distanceFromRight = cols - 1 - col;
        if (distanceFromRight % 2 === 0) {
          for (let row = 0; row < colSize && seatIndex < seatNumbers.length; row++) {
            grid[col][row] = seatNumbers[seatIndex++];
          }
        } else {
          for (let row = colSize - 1; row >= 0 && seatIndex < seatNumbers.length; row--) {
            grid[col][row] = seatNumbers[seatIndex++];
          }
        }
      }
      break;
    }
  }

  return grid;
};

// ============================================================================
// Seating Preview Component
// ============================================================================

const SeatingPreview = ({
  distribution,
  template,
  maxDisplay = 50,
  className,
}: {
  distribution: number[];
  template: SeatingTemplate;
  maxDisplay?: number;
  className?: string;
}) => {
  const maxRows = Math.max(...distribution);
  const totalSeats = distribution.reduce((a, b) => a + b, 0);
  const displaySeats = Math.min(totalSeats, maxDisplay);
  const previewSeats = Array.from({ length: displaySeats }, (_, i) => i + 1);
  const grid = generateSeatingArrangement(previewSeats, distribution, template);

  const getCellSize = () => {
    const totalCells = grid.length * Math.max(...distribution);
    if (totalCells <= 20) return 'w-8 h-8 text-[10px]';
    if (totalCells <= 40) return 'w-7 h-7 text-[9px]';
    if (totalCells <= 60) return 'w-6 h-6 text-[8px]';
    return 'w-5 h-5 text-[7px]';
  };

  const cellSize = getCellSize();

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="flex min-w-max justify-center gap-1">
        {grid.map((column, colIdx) => (
          <div
            key={colIdx}
            className="flex flex-col gap-1"
          >
            {Array(maxRows)
              .fill(null)
              .map((_, rowIdx) => {
                const seat = column[rowIdx];
                const isEmpty = seat === null || seat > displaySeats;
                return (
                  <div
                    key={rowIdx}
                    className={cn(
                      cellSize,
                      'flex items-center justify-center rounded-md font-mono transition-all',
                      isEmpty
                        ? 'border border-dashed border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800'
                        : 'border border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                    )}
                  >
                    {!isEmpty && seat}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {totalSeats > maxDisplay && (
        <p className="mt-2 text-center text-[10px] text-neutral-400">
          Showing {maxDisplay} of {totalSeats} seats
        </p>
      )}
    </div>
  );
};

// ============================================================================
// Template Selector
// ============================================================================

const TemplateSelector = ({
  value,
  onChange,
}: {
  value: SeatingTemplate;
  onChange: (value: SeatingTemplate) => void;
}) => {
  const demoDistribution = [4, 4, 4];

  return (
    <div className="grid grid-cols-2 gap-4">
      {TEMPLATES.map((template) => {
        const Icon = template.icon;
        const isSelected = value === template.id;
        return (
          <button
            key={template.id}
            onClick={() => onChange(template.id)}
            className={cn(
              'relative rounded-xl border-2 p-4 text-left transition-all',
              isSelected
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20 dark:bg-emerald-950/20'
                : 'border-neutral-200 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:hover:border-neutral-700',
            )}
          >
            <div className="mb-3 flex items-start gap-3">
              <div
                className={cn(
                  'rounded-lg p-2 transition-colors',
                  isSelected
                    ? 'bg-emerald-500 text-white'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <h4
                  className={cn(
                    'font-semibold',
                    isSelected
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-neutral-900 dark:text-neutral-100',
                  )}
                >
                  {template.name}
                </h4>
                <p className="mt-0.5 text-xs text-neutral-500">{template.description}</p>
              </div>
            </div>

            <div className="mt-2 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900/50">
              <SeatingPreview
                distribution={demoDistribution}
                template={template.id}
                maxDisplay={12}
                className="origin-top-left scale-75"
              />
            </div>

            {isSelected && (
              <div className="absolute top-3 right-3">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ============================================================================
// Distribution Editor
// ============================================================================

interface DistributionEditorProps {
  distribution: number[];
  onChange: (distribution: number[]) => void;
  totalCapacity: number;
  onTotalChange: (total: number) => void;
}

const DistributionEditor = ({
  distribution,
  onChange,
  totalCapacity,
  onTotalChange,
}: DistributionEditorProps) => {
  const [rows, setRows] = useState(distribution.length);

  const updateRowCount = (newRowCount: number) => {
    if (newRowCount < 1) return;
    if (newRowCount > 10) {
      toast.error('Maximum 10 rows allowed');
      return;
    }

    const newDistribution = [...distribution];
    if (newRowCount > rows) {
      for (let i = rows; i < newRowCount; i++) {
        newDistribution.push(Math.floor(totalCapacity / newRowCount));
      }
    } else {
      newDistribution.length = newRowCount;
    }

    const currentTotal = newDistribution.reduce((sum, val) => sum + val, 0);
    if (currentTotal !== totalCapacity && totalCapacity > 0) {
      const lastIndex = newRowCount - 1;
      const otherSum = newDistribution.slice(0, lastIndex).reduce((sum, val) => sum + val, 0);
      newDistribution[lastIndex] = Math.max(1, totalCapacity - otherSum);
    }

    setRows(newRowCount);
    onChange(newDistribution);
  };

  const updateSeatCount = (index: number, value: number) => {
    const newDistribution = [...distribution];
    newDistribution[index] = Math.max(1, Math.min(200, value));
    const newTotal = newDistribution.reduce((sum, val) => sum + val, 0);
    onTotalChange(newTotal);
    onChange(newDistribution);
  };

  const addRow = () => updateRowCount(rows + 1);
  const removeRow = () => updateRowCount(rows - 1);

  const distributeEvenly = () => {
    const base = Math.floor(totalCapacity / rows);
    const remainder = totalCapacity % rows;

    const distribution = Array(rows).fill(base);

    const order = [];

    let l = 0;
    let r = rows - 1;

    while (l <= r) {
      if (l === r) {
        order.push(l);
      } else {
        order.push(l);
        order.push(r);
      }
      l++;
      r--;
    }

    for (let i = 0; i < remainder; i++) {
      distribution[order[i]]++;
    }

    onChange(distribution);
    toast.success('Polar-balanced distribution applied');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Columns
          </Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={removeRow}
              disabled={rows <= 1}
              className="h-7 w-7"
            >
              <X className="h-3 w-3" />
            </Button>
            <span className="w-8 text-center text-sm font-medium">{rows}</span>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              onClick={addRow}
              disabled={rows >= 10}
              className="h-7 w-7"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={distributeEvenly}
          className="h-7 text-xs"
        >
          Even Distribution
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
        <div className="space-y-3">
          {distribution.map((seats, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3"
            >
              <div className="w-20 text-xs font-medium text-neutral-500">Column {idx + 1}</div>
              <div className="relative flex-1">
                <Input
                  type="number"
                  value={seats}
                  onChange={(e) => updateSeatCount(idx, parseInt(e.target.value) || 1)}
                  min={1}
                  max={200}
                  className="h-9 text-center font-mono"
                />
                <Users className="absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-neutral-400" />
              </div>
              <div className="w-24 text-right">
                <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                    style={{ width: `${(seats / totalCapacity) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="text-sm">
          <span className="text-neutral-500">Total capacity:</span>{' '}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            {totalCapacity}
          </span>
          <span className="ml-1 text-xs text-neutral-400">students</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Block Form Dialog
// ============================================================================

interface BlockFormData {
  blockNo: string;
  location: string;
  name: string;
  strength: number;
  distribution: number[];
  template: SeatingTemplate;
}

const defaultFormData: BlockFormData = {
  blockNo: '',
  location: '',
  name: '',
  strength: 30,
  distribution: [10, 10, 10],
  template: 'reverse-zigzag',
};

interface BlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingBlock?: Block | null;
}

function BlockDialog({ open, onOpenChange, onSuccess, editingBlock }: BlockDialogProps) {
  const [formData, setFormData] = useState<BlockFormData>(defaultFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof BlockFormData, string>>>({});
  const [activeTab, setActiveTab] = useState('basic');
  const [touched, setTouched] = useState<Partial<Record<keyof BlockFormData, boolean>>>({});

  const isEditing = !!editingBlock;

  useEffect(() => {
    if (editingBlock) {
      setFormData({
        blockNo: editingBlock.blockNo,
        location: editingBlock.location,
        name: editingBlock.name,
        strength: editingBlock.strength,
        distribution: editingBlock.distribution || [10, 10, 10],
        template: 'reverse-zigzag',
      });
    } else {
      setFormData(defaultFormData);
    }
    setErrors({});
    setTouched({});
  }, [editingBlock, open]);

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof BlockFormData, string>> = {};

    if (!formData.blockNo.trim()) newErrors.blockNo = 'Block number is required';
    if (!formData.location.trim()) newErrors.location = 'Location is required';
    if (!formData.name.trim()) newErrors.name = 'Block name is required';

    if (formData.distribution.some((v) => v <= 0)) {
      newErrors.distribution = 'All columns must have at least 1 seat';
    }

    const sum = formData.distribution.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      newErrors.distribution = 'Invalid distribution';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const isFormValid = useCallback(() => {
    const hasErrors = Object.keys(errors).length > 0;
    const hasRequiredFields =
      !!formData.blockNo.trim() && !!formData.location.trim() && !!formData.name.trim();
    const distributionValid = formData.distribution.every((v) => v > 0);

    return hasRequiredFields && !hasErrors && distributionValid;
  }, [errors, formData]);

  useEffect(() => {
    validate();
  }, [formData, validate]);

  const handleFieldChange = (field: keyof BlockFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    setIsSubmitting(true);

    const templateNumber = TEMPLATE_MAP[formData.template];
    try {
      const strength = formData.distribution.reduce((a, b) => a + b, 0);

      let result;
      if (isEditing && editingBlock) {
        result = await updateBlock({
          id: editingBlock.id,
          blockNo: formData.blockNo,
          location: formData.location,
          name: formData.name,
          strength: strength,
          distribution: formData.distribution,
          template: templateNumber,
        });
      } else {
        result = await createBlock({
          blockNo: formData.blockNo,
          location: formData.location,
          name: formData.name,
          strength: strength,
          distribution: formData.distribution,
          template: templateNumber,
        });
      }

      if (result.success) {
        toast.success(isEditing ? 'Block updated successfully' : 'Block created successfully');
        onSuccess();
        onOpenChange(false);
      } else {
        const errorMsg = Array.isArray(result.error)
          ? result.error[0]?.message || 'Validation failed'
          : result.error;
        toast.error(errorMsg || `Failed to ${isEditing ? 'update' : 'create'} block`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${isEditing ? 'update' : 'create'} block`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateDistribution = (newDistribution: number[]) => {
    setFormData((prev) => ({
      ...prev,
      distribution: newDistribution,
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? 'Edit Block' : 'Create New Block'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update block configuration including seating distribution and arrangement template.'
              : 'Add a new examination block with its seating arrangement and choose a seating template.'}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="mt-4"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="distribution">Seat Distribution</TabsTrigger>
            <TabsTrigger value="template">Seating Template</TabsTrigger>
          </TabsList>

          <TabsContent
            value="basic"
            className="space-y-4 pt-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="blockNo">
                  Block Number <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="blockNo"
                  value={formData.blockNo}
                  onChange={(e) => handleFieldChange('blockNo', e.target.value)}
                  placeholder="e.g., 1, 2, A, B"
                  className={errors.blockNo && touched.blockNo ? 'border-rose-500' : ''}
                />
                {errors.blockNo && touched.blockNo && (
                  <p className="text-xs text-rose-500">{errors.blockNo}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">
                  Location <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleFieldChange('location', e.target.value)}
                  placeholder="e.g., 301, Room A, Lab 1"
                  className={errors.location && touched.location ? 'border-rose-500' : ''}
                />
                {errors.location && touched.location && (
                  <p className="text-xs text-rose-500">{errors.location}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">
                Block Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder="e.g., Block 301, Main Hall"
                className={errors.name && touched.name ? 'border-rose-500' : ''}
              />
              {errors.name && touched.name && (
                <p className="text-xs text-rose-500">{errors.name}</p>
              )}
            </div>
            <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Total Capacity (auto-calculated):</span>
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {formData.distribution.reduce((a, b) => a + b, 0)} students
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                Capacity is automatically calculated from the sum of all columns
              </p>
            </div>
          </TabsContent>

          <TabsContent
            value="distribution"
            className="space-y-4 pt-4"
          >
            <DistributionEditor
              distribution={formData.distribution}
              onChange={updateDistribution}
              totalCapacity={formData.distribution.reduce((a, b) => a + b, 0)}
              onTotalChange={() => {}}
            />
            {errors.distribution && <p className="text-xs text-rose-500">{errors.distribution}</p>}
          </TabsContent>

          <TabsContent
            value="template"
            className="space-y-4 pt-4"
          >
            <TemplateSelector
              value={formData.template}
              onChange={(template) => handleFieldChange('template', template)}
            />
            <div className="mt-6 rounded-lg border border-neutral-200 bg-gradient-to-r from-neutral-50 to-white p-4 dark:border-neutral-800 dark:from-neutral-900/50 dark:to-neutral-950">
              <Label className="mb-3 block text-sm font-medium">Live Preview</Label>
              <SeatingPreview
                distribution={formData.distribution}
                template={formData.template}
              />
              <p className="mt-3 text-center text-xs text-neutral-400">
                Numbers represent seat order. Green cells show seat numbers, empty cells are unused
                positions.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {activeTab === 'template' && (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !isFormValid()}
              className="gap-2"
            >
              {isSubmitting && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              <Save className="h-4 w-4" />
              {isEditing ? 'Save Changes' : 'Create Block'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Import Dialog
// ============================================================================

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (blocks: Partial<Block>[]) => Promise<void>;
  isLoading?: boolean;
}

function ImportDialog({ open, onOpenChange, onImport, isLoading }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Partial<Block>[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter((line) => line.trim());

        if (lines.length < 2) {
          toast.error('CSV file must have a header row and at least one data row');
          setPreview([]);
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().toUpperCase());
        const expectedHeaders = BLOCK_CSV_HEADERS.map((h) => h.toUpperCase());

        const headerMatch = expectedHeaders.every((h) => headers.includes(h));
        if (!headerMatch) {
          toast.error(`CSV must have headers: ${BLOCK_CSV_HEADERS.join(', ')}`);
          setPreview([]);
          return;
        }

        const parsed: Partial<Block>[] = [];
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',').map((c) => c.trim());
          if (row.length < 3) continue;

          const block = csvRowToBlock(row);
          if (block.blockNo && block.name && block.location) {
            // Calculate strength from distribution if not provided
            if (!block.strength && block.distribution && block.distribution.length > 0) {
              block.strength = block.distribution.reduce((a, b) => a + b, 0);
            }
            parsed.push(block);
          }
        }

        if (parsed.length === 0) {
          toast.error('No valid block records found in CSV');
          setPreview([]);
          return;
        }

        setPreview(parsed);
        toast.success(`Parsed ${parsed.length} block records`);
      } catch (error) {
        toast.error('Failed to parse CSV file');
        console.error(error);
        setPreview([]);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleImportClick = async () => {
    if (!Array.isArray(preview) || preview.length === 0) {
      toast.error('No data to import');
      return;
    }

    setIsProcessing(true);
    try {
      await onImport(preview);
      setFile(null);
      setPreview([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import blocks');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setFile(null);
    setPreview([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleCancel}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Blocks from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with the following columns: {BLOCK_CSV_HEADERS.join(', ')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="hover:border-primary rounded-lg border-2 border-dashed p-6 text-center transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="block cursor-pointer"
            >
              <FileSpreadsheet className="mx-auto mb-2 h-12 w-12 text-neutral-400" />
              <p className="text-sm text-neutral-600">
                {file ? file.name : 'Click to select CSV file or drag and drop'}
              </p>
              <p className="mt-1 text-xs text-neutral-400">CSV files only</p>
            </label>
          </div>

          {Array.isArray(preview) && preview.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Preview ({preview.length} records)</p>
              <div className="max-h-60 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-50">
                    <tr>
                      {BLOCK_CSV_HEADERS.map((h) => (
                        <th
                          key={h}
                          className="px-2 py-1 text-left font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((block, i) => (
                      <tr
                        key={i}
                        className="border-t"
                      >
                        <td className="px-2 py-1">{block.blockNo}</td>
                        <td className="px-2 py-1">{block.name}</td>
                        <td className="px-2 py-1">{block.location}</td>
                        <td className="px-2 py-1">{block.strength}</td>
                        <td className="px-2 py-1">{block.distribution?.join('|') || ''}</td>
                      </tr>
                    ))}
                    {preview.length > 10 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-2 py-1 text-center text-neutral-400"
                        >
                          +{preview.length - 10} more records
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isProcessing || isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImportClick}
            disabled={!Array.isArray(preview) || preview.length === 0 || isProcessing || isLoading}
            className="gap-2"
          >
            {isProcessing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import {Array.isArray(preview) ? preview.length : 0} Record
                {Array.isArray(preview) && preview.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Stats Cards Component
// ============================================================================

const StatsCards = ({ stats, isLoading }: { stats: BlockStats; isLoading: boolean }) => {
  if (isLoading) {
    return (
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-24 w-full"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="relative overflow-hidden rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500/10 to-transparent" />
        <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          {stats.totalBlocks}
        </p>
        <p className="mt-1 text-xs text-neutral-500">Total Blocks</p>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-20 w-20 rounded-full bg-gradient-to-br from-blue-500/10 to-transparent" />
        <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          {stats.totalCapacity.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-neutral-500">Total Capacity</p>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-20 w-20 rounded-full bg-gradient-to-br from-purple-500/10 to-transparent" />
        <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          {Math.round(stats.averageCapacity)}
        </p>
        <p className="mt-1 text-xs text-neutral-500">Avg. per Block</p>
      </div>
    </div>
  );
};

// ============================================================================
// Block Card Component
// ============================================================================

const BlockCard = ({
  block,
  onEdit,
  onDelete,
  template,
}: {
  block: Block;
  onEdit: (block: Block) => void;
  onDelete: (block: Block) => void;
  template: SeatingTemplate;
}) => {
  const totalSeats = block.distribution.reduce((sum, val) => sum + val, 0);
  const displaySeats = Math.min(totalSeats, 40);
  const previewSeats = Array.from({ length: displaySeats }, (_, i) => i + 1);
  const grid = generateSeatingArrangement(previewSeats, block.distribution, template);
  const maxRows = Math.max(...block.distribution);
  const cols = block.distribution.length;

  const getCellSize = () => {
    const totalCells = cols * maxRows;
    if (totalCells <= 16) return 'w-8 h-8 text-[10px]';
    if (totalCells <= 30) return 'w-7 h-7 text-[9px]';
    if (totalCells <= 48) return 'w-6 h-6 text-[8px]';
    return 'w-5 h-5 text-[7px]';
  };

  const cellSize = getCellSize();

  return (
    <div className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all hover:border-emerald-200 hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-emerald-800">
      <div className="absolute top-0 right-0 -mt-16 -mr-16 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-500/5 to-transparent transition-transform duration-500 group-hover:scale-150" />

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="font-mono text-xs"
              >
                {block.blockNo}
              </Badge>
              <h3 className="truncate font-semibold text-neutral-900 dark:text-neutral-100">
                {block.name}
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500"> {block.location}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onEdit(block)}
                    className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit block</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onDelete(block)}
                    className="h-7 w-7 text-rose-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete block</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="mb-3 flex items-baseline gap-2">
          <span className="bg-gradient-to-r from-neutral-900 to-neutral-600 bg-clip-text text-2xl font-bold text-transparent dark:from-neutral-100 dark:to-neutral-400">
            {totalSeats}
          </span>
          <span className="text-xs text-neutral-500">total seats</span>
          <span className="ml-auto text-xs text-neutral-400">{cols} columns</span>
        </div>

        <div className="mb-3 overflow-x-auto rounded-lg border border-neutral-100 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900/50">
          <div className="flex min-w-max justify-center gap-1">
            {grid.map((column, colIdx) => (
              <div
                key={colIdx}
                className="flex flex-col gap-1"
              >
                {Array(maxRows)
                  .fill(null)
                  .map((_, rowIdx) => {
                    const seat = column[rowIdx];
                    const isEmpty = seat === null;
                    return (
                      <div
                        key={rowIdx}
                        className={cn(
                          cellSize,
                          'flex items-center justify-center rounded-md font-mono transition-all',
                          isEmpty
                            ? 'border border-dashed border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900'
                            : 'border border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                        )}
                      >
                        {!isEmpty && seat}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-neutral-500">
            {displaySeats < totalSeats
              ? `Showing ${displaySeats}/${totalSeats}`
              : `${totalSeats} seats`}
          </span>
          <Badge
            variant="outline"
            className="font-mono text-[10px]"
          >
            {Math.round(totalSeats / cols)} avg/col
          </Badge>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Block Table View
// ============================================================================

const BlockTableView = ({
  blocks,
  onEdit,
  onDelete,
  isLoading,
}: {
  blocks: Block[];
  onEdit: (block: Block) => void;
  onDelete: (block: Block) => void;
  isLoading: boolean;
}) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-12 w-full"
          />
        ))}
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-gradient-to-b from-neutral-50 to-white py-16 dark:border-neutral-800 dark:from-neutral-900/50 dark:to-neutral-950">
        <Layers className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-700" />
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          No blocks configured
        </h3>
        <p className="mt-2 text-sm text-neutral-500">
          Create your first examination block to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-900/80">
            <TableRow>
              <TableHead className="text-xs font-semibold tracking-wide uppercase">
                Block No
              </TableHead>
              <TableHead className="text-xs font-semibold tracking-wide uppercase">Name</TableHead>
              <TableHead className="text-xs font-semibold tracking-wide uppercase">
                Location
              </TableHead>
              <TableHead className="text-xs font-semibold tracking-wide uppercase">
                Capacity
              </TableHead>
              <TableHead className="text-xs font-semibold tracking-wide uppercase">
                Distribution
              </TableHead>
              <TableHead className="w-24 text-right text-xs font-semibold tracking-wide uppercase">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocks.map((block) => (
              <TableRow
                key={block.id}
                className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <TableCell className="px-4 py-3 font-mono text-sm font-medium">
                  {block.blockNo}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm">{block.name}</TableCell>
                <TableCell className="px-4 py-3 text-sm">{block.location}</TableCell>
                <TableCell className="px-4 py-3 text-sm font-semibold">{block.strength}</TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {block.distribution.map((seats, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="font-mono text-xs"
                      >
                        {seats}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(block)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(block)}
                      className="text-rose-500 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export default function BlocksPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [stats, setStats] = useState<BlockStats>({
    totalBlocks: 0,
    totalCapacity: 0,
    averageCapacity: 0,
  });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [template] = useState<SeatingTemplate>('reverse-zigzag');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [blockToDelete, setBlockToDelete] = useState<Block | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const fetchBlocks = useCallback(async () => {
    setLoading(true);
    try {
      const [blocksResult, statsResult] = await Promise.all([getBlocks(), getBlockStats()]);

      if (blocksResult.success) {
        const filteredBlocks = blocksResult.data.filter(
          (b) =>
            b.name.toLowerCase() !== 'test' &&
            !b.name.toLowerCase().includes('xxx') &&
            b.location.toLowerCase() !== 'xxx',
        );
        setBlocks(filteredBlocks);
      } else {
        toast.error(blocksResult.error || 'Failed to load blocks');
      }

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      }
    } catch (error) {
      console.error('Failed to load blocks:', error);
      toast.error('Failed to load blocks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  const handleExport = useCallback(() => {
    if (blocks.length === 0) {
      toast.error('No blocks to export');
      return;
    }

    const csvData = [BLOCK_CSV_HEADERS, ...blocks.map((block) => blockToCSVRow(block))];
    const filename = `blocks-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csvData, filename);
    toast.success(`Exported ${blocks.length} blocks`);
  }, [blocks]);

  const handleImport = useCallback(
    async (importedBlocks: Partial<Block>[]) => {
      const invalidBlocks = importedBlocks.filter((b) => !b.blockNo || !b.name || !b.location);
      if (invalidBlocks.length > 0) {
        toast.error(
          `${invalidBlocks.length} blocks missing required fields (Block No, Name, Location)`,
        );
        return;
      }

      const blockNos = importedBlocks.map((b) => b.blockNo);
      const duplicates = blockNos.filter((no, index) => blockNos.indexOf(no) !== index);
      if (duplicates.length > 0) {
        toast.error(`Duplicate Block No found: ${duplicates.join(', ')}`);
        return;
      }

      try {
        // Prepare blocks for bulk import
        const blocksToImport = importedBlocks.map((blockData) => {
          const strength =
            blockData.strength || blockData.distribution?.reduce((a, b) => a + b, 0) || 30;
          const distribution = blockData.distribution || [
            Math.ceil(strength / 3),
            Math.ceil(strength / 3),
            Math.ceil(strength / 3),
          ];

          return {
            blockNo: blockData.blockNo!,
            name: blockData.name!,
            location: blockData.location!,
            strength: strength,
            distribution: distribution,
            template: 1,
          };
        });

        // ✅ Use bulkCreateBlocks instead of individual creates
        const result = await bulkCreateBlocks({
          blocks: blocksToImport,
          overwrite: false, // Don't overwrite existing blocks
        });

        if (result.success) {
          const count = result.data?.length || 0;
          const total = importedBlocks.length;
          const skipped = total - count;

          if (skipped > 0) {
            toast.success(`Imported ${count} blocks (${skipped} skipped due to duplicates)`);
          } else {
            toast.success(`Successfully imported ${count} blocks`);
          }

          await fetchBlocks();
          setImportDialogOpen(false);
        } else {
          const errorMsg =
            typeof result.error === 'string' ? result.error : 'Failed to import blocks';
          toast.error(errorMsg);
        }
      } catch (error) {
        console.error('Import error:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to import blocks');
      }
    },
    [fetchBlocks],
  );

  const handleEdit = (block: Block) => {
    setEditingBlock(block);
    setDialogOpen(true);
  };

  const handleDelete = (block: Block) => {
    setBlockToDelete(block);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!blockToDelete) return;

    try {
      const result = await deleteBlock(blockToDelete.id);
      if (result.success) {
        toast.success(`Block "${blockToDelete.name}" deleted successfully`);
        await fetchBlocks();
      } else {
        toast.error(result.error || 'Failed to delete block');
      }
    } catch {
      toast.error('Failed to delete block');
    } finally {
      setDeleteDialogOpen(false);
      setBlockToDelete(null);
    }
  };

  const handleCreate = () => {
    setEditingBlock(null);
    setDialogOpen(true);
  };

  const handleDialogSuccess = () => {
    fetchBlocks();
  };

  const toolbarActions = [
    {
      id: 'export',
      label: 'Export',
      icon: <Download className="h-3.5 w-3.5" />,
      onClick: handleExport,
      variant: 'ghost' as const,
    },
    {
      id: 'import',
      label: 'Import',
      icon: <Upload className="h-3.5 w-3.5" />,
      onClick: () => setImportDialogOpen(true),
      variant: 'ghost' as const,
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onClick: fetchBlocks,
      variant: 'outline' as const,
    },
    {
      id: 'viewMode',
      label: viewMode === 'grid' ? 'Table View' : 'Grid View',
      icon:
        viewMode === 'grid' ? (
          <LayoutGrid className="h-3.5 w-3.5" />
        ) : (
          <Grid3X3 className="h-3.5 w-3.5" />
        ),
      onClick: () => setViewMode(viewMode === 'grid' ? 'table' : 'grid'),
      variant: 'ghost' as const,
    },
    {
      id: 'add',
      label: 'Create Block',
      icon: <Plus className="h-3.5 w-3.5" />,
      onClick: handleCreate,
      variant: 'default' as const,
    },
  ];

  if (loading && blocks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-24 w-full"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-64 w-full"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Block Management"
        description="Configure examination blocks and their seating arrangements with visual preview."
        icon={Blocks}
      />
      <StatsCards
        stats={stats}
        isLoading={loading}
      />
      <PageToolbar
        actions={toolbarActions}
        searchValue=""
        onSearchChange={() => {}}
        searchPlaceholder=""
      />

      <div className="mt-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {blocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                onEdit={handleEdit}
                onDelete={handleDelete}
                template={template}
              />
            ))}
            {blocks.length === 0 && !loading && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-gradient-to-b from-neutral-50 to-white py-16 dark:border-neutral-800 dark:from-neutral-900/50 dark:to-neutral-950">
                <Layers className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-700" />
                <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                  No blocks configured
                </h3>
                <p className="mt-2 text-sm text-neutral-500">
                  Create your first examination block to get started.
                </p>
                <Button
                  className="mt-6 gap-2"
                  onClick={handleCreate}
                >
                  <Plus className="h-4 w-4" />
                  Create Block
                </Button>
              </div>
            )}
          </div>
        ) : (
          <BlockTableView
            blocks={blocks}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isLoading={loading}
          />
        )}
      </div>

      <BlockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleDialogSuccess}
        editingBlock={editingBlock}
      />

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImport}
        isLoading={loading}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Block</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete block "{blockToDelete?.name}"? This action cannot be
              undone. Allocations associated with this block will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
