// lib/actions/block.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { blockAllocations, blocks } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId, requireExamCenter } from '@/lib/session';
import { Block } from '@/lib/types';

const MODULE = 'blocks';

// ============================================
// Validation Schemas
// ============================================

const CreateBlockSchema = z.object({
  blockNo: z.string().min(1, 'Block number is required'),
  location: z.string().min(1, 'Location is required'),
  name: z.string().min(1, 'Block name is required'),
  strength: z.number().int().min(1, 'Strength must be at least 1'),
  distribution: z.array(z.number()).default([10, 10, 10, 10]),
  template: z.number().int().default(1),
});

const UpdateBlockSchema = CreateBlockSchema.partial().extend({
  id: z.string().uuid('Invalid block ID'),
});

// ============================================
// Read Operations
// ============================================

export async function getBlocks(): Promise<
  { success: true; data: Block[] } | { success: false; error: string }
> {
  const MODULE_FN = `${MODULE}.getBlocks`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const blockList = await db.query.blocks.findMany({
      where: and(eq(blocks.examCenterId, examCenterId), eq(blocks.isDeleted, false)),
      orderBy: [asc(blocks.blockNo)],
    });

    const normalizedBlockList: Block[] = blockList.map((block) => ({
      ...block,
      distribution: block.distribution ?? [10, 10, 10, 10],
      template: block.template ?? 1, // Add this line
    }));

    logger.debug(MODULE_FN, `Fetched ${normalizedBlockList.length} blocks`);
    return { success: true, data: normalizedBlockList };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch blocks', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getBlockById(id: string) {
  const MODULE_FN = `${MODULE}.getBlockById`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: null };
    }

    const block = await db.query.blocks.findFirst({
      where: and(
        eq(blocks.id, id),
        eq(blocks.examCenterId, examCenterId),
        eq(blocks.isDeleted, false),
      ),
    });

    if (!block) {
      logger.debug(MODULE_FN, 'Block not found', { id });
      return { success: true, data: null };
    }

    logger.debug(MODULE_FN, 'Block fetched', { id });
    return { success: true, data: block };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch block', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getBlockByLocation(location: string) {
  const MODULE_FN = `${MODULE}.getBlockByLocation`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: null };
    }

    const block = await db.query.blocks.findFirst({
      where: and(
        eq(blocks.examCenterId, examCenterId),
        eq(blocks.location, location),
        eq(blocks.isDeleted, false),
      ),
    });

    if (!block) {
      logger.debug(MODULE_FN, 'Block not found', { location });
      return { success: true, data: null };
    }

    logger.debug(MODULE_FN, 'Block fetched by location', { location });
    return { success: true, data: block };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch block by location', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getTotalBlockCapacity() {
  const MODULE_FN = `${MODULE}.getTotalBlockCapacity`;

  try {
    const blocksResult = await getBlocks();
    if (!blocksResult.success) {
      return { success: false, error: blocksResult.error };
    }

    const total = blocksResult.data.reduce((sum, block) => sum + block.strength, 0);

    logger.debug(MODULE_FN, `Total block capacity: ${total}`);
    return { success: true, data: total };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to calculate total capacity', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Write Operations
// ============================================

export async function createBlock(data: z.infer<typeof CreateBlockSchema>) {
  const MODULE_FN = `${MODULE}.createBlock`;

  try {
    const validated = CreateBlockSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Check for duplicate location
    const existing = await db.query.blocks.findFirst({
      where: and(
        eq(blocks.examCenterId, examCenter.id),
        eq(blocks.location, validated.location),
        eq(blocks.isDeleted, false),
      ),
    });

    if (existing) {
      logger.warn(MODULE_FN, 'Block already exists', { location: validated.location });
      return {
        success: false,
        error: `Block with location "${validated.location}" already exists`,
      };
    }

    const [created] = await db
      .insert(blocks)
      .values({
        examCenterId: examCenter.id,
        ...validated,
      })
      .returning();

    logger.info(MODULE_FN, 'Block created', {
      id: created.id,
      blockNo: created.blockNo,
      location: created.location,
      template: created.template,
    });
    revalidatePath('/exam-center/exam-setup/blocks');

    return { success: true, data: created };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { errors: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to create block', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create block',
    };
  }
}

export async function updateBlock(data: z.infer<typeof UpdateBlockSchema>) {
  const MODULE_FN = `${MODULE}.updateBlock`;

  try {
    const validated = UpdateBlockSchema.parse(data);
    const examCenter = await requireExamCenter();
    const { id, ...updates } = validated;

    // If updating location, check for duplicates
    if (updates.location) {
      const existing = await db.query.blocks.findFirst({
        where: and(
          eq(blocks.examCenterId, examCenter.id),
          eq(blocks.location, updates.location),
          eq(blocks.isDeleted, false),
          sql`${blocks.id} != ${id}`,
        ),
      });

      if (existing) {
        logger.warn(MODULE_FN, 'Block location already exists', { location: updates.location });
        return {
          success: false,
          error: `Block with location "${updates.location}" already exists`,
        };
      }
    }

    const [updated] = await db
      .update(blocks)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(blocks.id, id), eq(blocks.examCenterId, examCenter.id)))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'Block not found', { id });
      return { success: false, error: 'Block not found' };
    }

    logger.info(MODULE_FN, 'Block updated', { id });
    revalidatePath('/exam-center/exam-setup/blocks');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { errors: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to update block', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update block',
    };
  }
}

export async function deleteBlock(id: string) {
  const MODULE_FN = `${MODULE}.deleteBlock`;

  try {
    const examCenter = await requireExamCenter();

    // Check if block has active allocations
    const allocations = await db.query.blockAllocations.findMany({
      where: and(
        eq(blockAllocations.examCenterId, examCenter.id),
        eq(blockAllocations.blockId, id),
        sql`${blockAllocations.date} >= CURRENT_DATE`,
      ),
      limit: 1,
    });

    if (allocations.length > 0) {
      logger.warn(MODULE_FN, 'Cannot delete block with active allocations', { id });
      return {
        success: false,
        error:
          'Cannot delete block with active allocations. Please reassign or delete allocations first.',
      };
    }

    const [deleted] = await db
      .update(blocks)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(blocks.id, id), eq(blocks.examCenterId, examCenter.id)))
      .returning();

    if (!deleted) {
      logger.warn(MODULE_FN, 'Block not found', { id });
      return { success: false, error: 'Block not found' };
    }

    logger.info(MODULE_FN, 'Block deleted (soft)', { id });
    revalidatePath('/exam-center/exam-setup/blocks');

    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete block', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete block',
    };
  }
}

// ============================================
// Bulk Operations
// ============================================

const BulkCreateBlocksSchema = z.object({
  blocks: z.array(CreateBlockSchema),
  overwrite: z.boolean().default(false),
});

export async function bulkCreateBlocks(data: z.infer<typeof BulkCreateBlocksSchema>) {
  const MODULE_FN = `${MODULE}.bulkCreateBlocks`;

  try {
    const validated = BulkCreateBlocksSchema.parse(data);
    const examCenter = await requireExamCenter();

    if (validated.blocks.length === 0) {
      return { success: false, error: 'No blocks to import' };
    }

    const results = await db.transaction(async (tx) => {
      if (validated.overwrite) {
        await tx
          .update(blocks)
          .set({ isDeleted: true, updatedAt: new Date() })
          .where(eq(blocks.examCenterId, examCenter.id));
        logger.info(MODULE_FN, 'Soft deleted existing blocks', { examCenterId: examCenter.id });
      }

      const values = validated.blocks.map((block) => ({
        examCenterId: examCenter.id,
        ...block,
      }));

      return await tx.insert(blocks).values(values).returning();
    });

    logger.info(MODULE_FN, `Bulk created ${results.length} blocks`, {
      examCenterId: examCenter.id,
      count: results.length,
      overwrite: validated.overwrite,
    });
    revalidatePath('/exam-center/exam-setup/blocks');

    return { success: true, data: results };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { errors: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to bulk create blocks', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import blocks',
    };
  }
}

// ============================================
// Statistics
// ============================================

export async function getBlockStats() {
  const MODULE_FN = `${MODULE}.getBlockStats`;

  try {
    const blocksResult = await getBlocks();
    if (!blocksResult.success) {
      return { success: false, error: blocksResult.error };
    }

    const stats = {
      totalBlocks: blocksResult.data.length,
      totalCapacity: blocksResult.data.reduce((sum, b) => sum + b.strength, 0),
      averageCapacity:
        blocksResult.data.length > 0
          ? blocksResult.data.reduce((sum, b) => sum + b.strength, 0) / blocksResult.data.length
          : 0,
    };

    logger.debug(MODULE_FN, 'Block stats fetched', stats);
    return { success: true, data: stats };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch block stats', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
