'use server';

import { revalidatePath } from 'next/cache';

import { getExamCenterId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Exam Center & Institute Mutations
// =============================================================================

export async function updateExamCenter(data: {
  code?: string;
  name?: string;
  address?: string | null;
  officerIncharge?: string | null;
  sealingSupervisor?: string | null;
  distCenterCode?: string | null;
  distCenterName?: string | null;
  season?: string | null;
  examYear?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  departments?: string[];
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (data.code !== undefined) updateData.code = data.code;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.officerIncharge !== undefined) updateData.officer_incharge = data.officerIncharge;
    if (data.sealingSupervisor !== undefined)
      updateData.sealing_supervisor = data.sealingSupervisor;
    if (data.distCenterCode !== undefined) updateData.dist_center_code = data.distCenterCode;
    if (data.distCenterName !== undefined) updateData.dist_center_name = data.distCenterName;
    if (data.season !== undefined) updateData.season = data.season;
    if (data.examYear !== undefined) updateData.exam_year = data.examYear;
    if (data.startDate !== undefined) {
      updateData.start_date = data.startDate
        ? typeof data.startDate === 'string'
          ? data.startDate
          : data.startDate.toISOString()
        : null;
    }
    if (data.endDate !== undefined) {
      updateData.end_date = data.endDate
        ? typeof data.endDate === 'string'
          ? data.endDate
          : data.endDate.toISOString()
        : null;
    }
    if (data.departments !== undefined) updateData.departments = data.departments;

    const { data: updated, error } = await supabase
      .from('exam_centers')
      .update(updateData)
      .eq('id', examCenterId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/center-profile');
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update exam center',
    };
  }
}

export async function addConnectedInstitute(data: {
  instituteCode: string;
  instituteName: string;
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('connected_institutes')
      .select('id')
      .eq('exam_center_id', examCenterId)
      .eq('institute_code', data.instituteCode)
      .maybeSingle();

    if (existing) {
      return { success: false, error: `Institute ${data.instituteCode} already connected` };
    }

    const { data: institute, error } = await supabase
      .from('connected_institutes')
      .insert({
        exam_center_id: examCenterId,
        institute_code: data.instituteCode,
        institute_name: data.instituteName,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/center-profile');
    return {
      success: true,
      data: { CODE: institute.institute_code, NAME: institute.institute_name, id: institute.id },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add institute',
    };
  }
}

export async function removeConnectedInstitute(id: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const { error } = await supabase
      .from('connected_institutes')
      .delete()
      .eq('id', id)
      .eq('exam_center_id', examCenterId);

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/center-profile');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove institute',
    };
  }
}

export async function updateInstituteName(id: string, name: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const { error } = await supabase
      .from('connected_institutes')
      .update({ institute_name: name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('exam_center_id', examCenterId);

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/center-profile');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update institute',
    };
  }
}

// =============================================================================
// Block Mutations
// =============================================================================

export async function createBlock(data: {
  blockNo: string;
  location: string;
  name: string;
  strength: number;
  distribution?: number[];
  template?: number;
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from('blocks')
      .insert({
        exam_center_id: examCenterId,
        block_no: data.blockNo,
        location: data.location,
        name: data.name,
        strength: data.strength,
        distribution: data.distribution || [10, 10, 10, 10],
        template: data.template || 1,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/block');
    return { success: true, data: created };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create block',
    };
  }
}

export async function updateBlock(data: {
  id: string;
  blockNo?: string;
  location?: string;
  name?: string;
  strength?: number;
  distribution?: number[];
  template?: number;
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const updateObj: Record<string, any> = { updated_at: new Date().toISOString() };

    if (data.blockNo !== undefined) updateObj.block_no = data.blockNo;
    if (data.location !== undefined) updateObj.location = data.location;
    if (data.name !== undefined) updateObj.name = data.name;
    if (data.strength !== undefined) updateObj.strength = data.strength;
    if (data.distribution !== undefined) updateObj.distribution = data.distribution;
    if (data.template !== undefined) updateObj.template = data.template;

    const { data: updated, error } = await supabase
      .from('blocks')
      .update(updateObj)
      .eq('id', data.id)
      .eq('exam_center_id', examCenterId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/block');
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update block',
    };
  }
}

export async function deleteBlock(id: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const { error } = await supabase
      .from('blocks')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('exam_center_id', examCenterId);

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/block');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete block',
    };
  }
}

export async function bulkCreateBlocks(
  data:
    | Array<{
        blockNo: string;
        location: string;
        name: string;
        strength: number;
        distribution?: number[];
        template?: number;
      }>
    | {
        blocks: Array<{
          blockNo: string;
          location: string;
          name: string;
          strength: number;
          distribution?: number[];
          template?: number;
        }>;
        overwrite?: boolean;
      },
) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const blockList = Array.isArray(data) ? data : data.blocks;

    const supabase = await createClient();
    const rows = blockList.map((b) => ({
      exam_center_id: examCenterId,
      block_no: b.blockNo,
      location: b.location,
      name: b.name,
      strength: b.strength,
      distribution: b.distribution || [10, 10, 10, 10],
      template: b.template || 1,
    }));

    const { data: created, error } = await supabase.from('blocks').insert(rows).select();
    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/block');
    return { success: true, data: created };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bulk create blocks',
    };
  }
}

// =============================================================================
// Staff Mutations
// =============================================================================

export async function createStaff(data: {
  uid: string;
  name: string;
  department: string;
  email?: string | null;
  staffType: string;
  role?: string | null;
  designation?: string | null;
  postHeldInExamination?: string | null;
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from('staff')
      .insert({
        exam_center_id: examCenterId,
        uid: data.uid,
        name: data.name,
        department: data.department,
        email: data.email || null,
        staff_type: data.staffType,
        role: data.role || null,
        designation: data.designation || null,
        post_held_in_examination: data.postHeldInExamination || null,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/supervisors');
    return { success: true, data: created };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create staff',
    };
  }
}

export async function updateStaff(data: {
  id: string;
  uid?: string;
  name?: string;
  department?: string;
  email?: string | null;
  staffType?: string;
  role?: string | null;
  designation?: string | null;
  postHeldInExamination?: string | null;
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const updateObj: Record<string, any> = { updated_at: new Date().toISOString() };

    if (data.uid !== undefined) updateObj.uid = data.uid;
    if (data.name !== undefined) updateObj.name = data.name;
    if (data.department !== undefined) updateObj.department = data.department;
    if (data.email !== undefined) updateObj.email = data.email;
    if (data.staffType !== undefined) updateObj.staff_type = data.staffType;
    if (data.role !== undefined) updateObj.role = data.role;
    if (data.designation !== undefined) updateObj.designation = data.designation;
    if (data.postHeldInExamination !== undefined)
      updateObj.post_held_in_examination = data.postHeldInExamination;

    const { data: updated, error } = await supabase
      .from('staff')
      .update(updateObj)
      .eq('id', data.id)
      .eq('exam_center_id', examCenterId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/supervisors');
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update staff',
    };
  }
}

export async function deleteStaff(id: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const { error } = await supabase
      .from('staff')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('exam_center_id', examCenterId);

    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/supervisors');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete staff',
    };
  }
}

export async function bulkCreateStaff(
  data:
    | Array<{
        uid: string;
        name: string;
        department: string;
        email?: string | null;
        staffType: string;
        role?: string | null;
        designation?: string | null;
        postHeldInExamination?: string | null;
      }>
    | {
        staff: Array<{
          uid: string;
          name: string;
          department: string;
          email?: string | null;
          staffType: string;
          role?: string | null;
          designation?: string | null;
          postHeldInExamination?: string | null;
        }>;
        overwrite?: boolean;
      },
) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const staffList = Array.isArray(data) ? data : data.staff;

    const supabase = await createClient();
    const rows = staffList.map((s) => ({
      exam_center_id: examCenterId,
      uid: s.uid,
      name: s.name,
      department: s.department,
      email: s.email || null,
      staff_type: s.staffType,
      role: s.role || null,
      designation: s.designation || null,
      post_held_in_examination: s.postHeldInExamination || null,
    }));

    const { data: created, error } = await supabase.from('staff').insert(rows).select();
    if (error) throw error;

    revalidatePath('/exam-center/exam-setup/supervisors');
    return { success: true, data: created };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bulk create staff',
    };
  }
}
