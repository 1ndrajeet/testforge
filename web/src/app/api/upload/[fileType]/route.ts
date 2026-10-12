import { NextRequest, NextResponse } from 'next/server';

import { parseEMarksheetExcel } from '@/lib/parsers/emarksheet';
import { parseInventoryExcel, TimetableLookupCache } from '@/lib/parsers/inventory';
import {
  applyArrangementCorrections,
  parseSeatingArrangementExcel,
  validateSeatingArrangement,
} from '@/lib/parsers/seatingarrangement';
import { buildSchemeSubjectMap, parseSeatingChartExcel } from '@/lib/parsers/seatingchart';
import { chunkArray, computeFileHash } from '@/lib/parsers/shared';
import { buildSubjectCache, parseTimetableHtml } from '@/lib/parsers/timetable';
import { getExamCenterId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileType: string }> },
) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileType } = await params;
    const contentType = request.headers.get('content-type') || '';
    const supabase = await createClient();

    // =========================================================================
    // 1. JSON Request (Action: process, fix-mismatches, status)
    // =========================================================================
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { action, stored_filename, connected_institute_id } = body;

      // Status check action
      if (action === 'status') {
        let query = supabase
          .from('uploads')
          .select('*')
          .eq('exam_center_id', examCenterId)
          .eq('file_type', fileType)
          .order('created_at', { ascending: false })
          .limit(1);

        if (connected_institute_id) {
          query = query.eq('connected_institute_id', connected_institute_id);
        }

        const { data: upload } = await query.maybeSingle();

        return NextResponse.json({
          success: true,
          data: {
            fileExists: !!upload,
            isProcessed: upload?.status === 'PROCESSED',
            fileName: upload?.original_filename,
            storedFilename: upload?.stored_filename,
            recordCount: upload?.record_count,
            uploadedAt: upload?.created_at,
            processedAt: upload?.processed_at,
            status: upload?.status,
          },
        });
      }

      // Re-process or Fix Mismatches
      if (action === 'process' || action === 'fix-mismatches' || action === 'CONFIRM_FIX') {
        let uploadQuery = supabase
          .from('uploads')
          .select('*')
          .eq('exam_center_id', examCenterId)
          .eq('file_type', fileType);

        if (stored_filename) {
          uploadQuery = uploadQuery.eq('stored_filename', stored_filename);
        } else {
          uploadQuery = uploadQuery.order('created_at', { ascending: false }).limit(1);
        }

        const { data: upload, error: uploadErr } = await uploadQuery.maybeSingle();
        if (uploadErr || !upload) {
          return NextResponse.json({ error: 'Uploaded file not found' }, { status: 404 });
        }

        // Download file from Supabase Storage
        const { data: fileData, error: downloadErr } = await supabase.storage
          .from('uploads')
          .download(upload.file_path);

        if (downloadErr || !fileData) {
          return NextResponse.json(
            { error: 'Failed to download file from storage' },
            { status: 500 },
          );
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());

        // Process file buffer
        return await processFileBuffer({
          buffer,
          fileType,
          examCenterId,
          connectedInstituteId: upload.connected_institute_id,
          uploadRecordId: upload.id,
          originalFilename: upload.original_filename,
          storedFilename: upload.stored_filename,
          isFixConfirm: action === 'fix-mismatches' || action === 'CONFIRM_FIX',
          supabase,
        });
      }

      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // =========================================================================
    // 2. Multipart Form-Data (Upload + Process)
    // =========================================================================
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const connectedInstituteId = (formData.get('connected_institute_id') as string) || null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = computeFileHash(buffer);
    const timestamp = Date.now();
    const storedFilename = `${timestamp}_${file.name}`;
    const storagePath = `${examCenterId}/${fileType}/${storedFilename}`;

    // Upload to Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (storageError) {
      console.error('Storage upload error:', storageError);
      return NextResponse.json({ error: 'Failed to save file to storage' }, { status: 500 });
    }

    // Insert record in uploads table
    const { data: uploadRecord, error: uploadInsertErr } = await supabase
      .from('uploads')
      .insert({
        exam_center_id: examCenterId,
        connected_institute_id: connectedInstituteId,
        file_type: fileType,
        original_filename: file.name,
        stored_filename: storedFilename,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        file_hash: fileHash,
        status: 'PROCESSING',
      })
      .select()
      .single();

    if (uploadInsertErr) {
      console.error('Upload table insert error:', uploadInsertErr);
      return NextResponse.json({ error: 'Failed to record upload' }, { status: 500 });
    }

    // Run Parser and Batch Upsert
    return await processFileBuffer({
      buffer,
      fileType,
      examCenterId,
      connectedInstituteId,
      uploadRecordId: uploadRecord.id,
      originalFilename: file.name,
      storedFilename,
      isFixConfirm: false,
      supabase,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

// =============================================================================
// Helper: Process file buffer based on fileType
// =============================================================================
async function processFileBuffer({
  buffer,
  fileType,
  examCenterId,
  connectedInstituteId,
  uploadRecordId,
  originalFilename,
  storedFilename,
  isFixConfirm,
  supabase,
}: {
  buffer: Buffer;
  fileType: string;
  examCenterId: string;
  connectedInstituteId?: string | null;
  uploadRecordId: string;
  originalFilename: string;
  storedFilename: string;
  isFixConfirm: boolean;
  supabase: any;
}) {
  try {
    // -------------------------------------------------------------------------
    // 1. TIMETABLE
    // -------------------------------------------------------------------------
    if (fileType === 'timetable') {
      const htmlText = buffer.toString('utf-8');
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, code, scheme, abbr, name')
        .eq('is_deleted', false);

      const subjectCache = buildSubjectCache(subjects || []);
      const entries = parseTimetableHtml(htmlText, subjectCache);

      if (entries.length === 0) {
        await supabase
          .from('uploads')
          .update({ status: 'FAILED', error_message: 'No valid timetable entries found' })
          .eq('id', uploadRecordId);
        return NextResponse.json(
          { error: 'No valid timetable entries found in file' },
          { status: 400 },
        );
      }

      // Delete old timetable for this center
      await supabase.from('timetable').delete().eq('exam_center_id', examCenterId);

      // Batch insert entries in chunks of 250
      const chunks = chunkArray(entries, 250);
      for (const chunk of chunks) {
        const rows = chunk.map((e) => ({
          exam_center_id: examCenterId,
          exam_day: e.exam_day,
          date: e.date,
          session: e.session,
          time_slot: e.time_slot,
          subject_code: e.subject_code,
          subject_name: e.subject_name,
          scheme: e.scheme,
          subject_id: e.subject_id,
          subject_abbr: e.subject_abbr,
        }));
        const { error: insertErr } = await supabase.from('timetable').insert(rows);
        if (insertErr) throw insertErr;
      }

      // Update upload record
      await supabase
        .from('uploads')
        .update({
          status: 'PROCESSED',
          record_count: entries.length,
          processed_at: new Date().toISOString(),
        })
        .eq('id', uploadRecordId);

      return NextResponse.json({
        success: true,
        message: `Timetable processed successfully (${entries.length} entries)`,
        data: { record_count: entries.length, stored_filename: storedFilename },
      });
    }

    // -------------------------------------------------------------------------
    // 2. SEATING CHART
    // -------------------------------------------------------------------------
    if (fileType === 'seatingchart') {
      const { data: subjects } = await supabase
        .from('subjects')
        .select('code, abbr, scheme')
        .eq('is_deleted', false);

      const schemeMap = buildSchemeSubjectMap(subjects || []);
      const students = parseSeatingChartExcel(buffer, schemeMap);

      if (students.length === 0) {
        await supabase
          .from('uploads')
          .update({ status: 'FAILED', error_message: 'No student records found' })
          .eq('id', uploadRecordId);
        return NextResponse.json(
          { error: 'No valid student records found in file' },
          { status: 400 },
        );
      }

      // Get institute code if connectedInstituteId provided
      let instCode = '';
      if (connectedInstituteId) {
        const { data: inst } = await supabase
          .from('connected_institutes')
          .select('institute_code')
          .eq('id', connectedInstituteId)
          .maybeSingle();
        instCode = inst?.institute_code || '';
      }

      // Upsert students in chunks of 250
      const chunks = chunkArray(students, 250);
      for (const chunk of chunks) {
        const rows = chunk.map((s) => ({
          exam_center_id: examCenterId,
          connected_institute_id: connectedInstituteId || null,
          seat_number: s.seat_number,
          institute_code: instCode || '0000',
          enrollment_number: s.enrollment_number,
          name: s.name,
          scheme: s.scheme,
          subjects: s.subjects,
          sub_codes: s.sub_codes,
          is_deleted: false,
        }));
        const { error: upsertErr } = await supabase
          .from('students')
          .upsert(rows, { onConflict: 'exam_center_id,seat_number' });
        if (upsertErr) throw upsertErr;
      }

      // Recalculate timetable total_students
      await recalculateTimetableCounts(supabase, examCenterId);

      // Update upload record
      await supabase
        .from('uploads')
        .update({
          status: 'PROCESSED',
          record_count: students.length,
          processed_at: new Date().toISOString(),
        })
        .eq('id', uploadRecordId);

      return NextResponse.json({
        success: true,
        message: 'Seating chart processed successfully',
        data: { total_students: students.length, stored_filename: storedFilename },
      });
    }

    // -------------------------------------------------------------------------
    // 3. SEATING ARRANGEMENT
    // -------------------------------------------------------------------------
    if (fileType === 'seatingarrangement') {
      const parsedData = parseSeatingArrangementExcel(buffer);

      if (parsedData.size === 0) {
        await supabase
          .from('uploads')
          .update({ status: 'FAILED', error_message: 'No seating arrangement records found' })
          .eq('id', uploadRecordId);
        return NextResponse.json(
          { error: 'No valid seating arrangement records found' },
          { status: 400 },
        );
      }

      // Query existing students
      const { data: dbStudents } = await supabase
        .from('students')
        .select('seat_number, sub_codes, scheme')
        .eq('exam_center_id', examCenterId)
        .eq('is_deleted', false);

      const dbStudentRefs = (dbStudents || []).map((s: any) => ({
        seat_number: s.seat_number,
        sub_codes: (s.sub_codes as string[]) || [],
        scheme: s.scheme,
      }));

      // Validation
      const validation = validateSeatingArrangement(parsedData, dbStudentRefs, uploadRecordId);

      if (validation.status === 'needs_correction' && !isFixConfirm) {
        await supabase
          .from('uploads')
          .update({
            status: 'UPLOADED',
            record_count: parsedData.size,
            error_message: `${validation.mismatch_count} mismatches found`,
          })
          .eq('id', uploadRecordId);

        return NextResponse.json({
          success: true,
          status: 'needs_correction',
          data: {
            temp_session_id: uploadRecordId,
            total_students: validation.total_students,
            mismatch_count: validation.mismatch_count,
            mismatches: validation.mismatches,
            stored_filename: storedFilename,
          },
          message: `Found ${validation.mismatch_count} mismatches. Please review and confirm fixes.`,
        });
      }

      // If confirming fix or no mismatches, apply corrections and save
      const finalData = isFixConfirm
        ? applyArrangementCorrections(parsedData, dbStudentRefs)
        : parsedData;

      const studentArray = Array.from(finalData.values());
      const chunks = chunkArray(studentArray, 250);

      for (const chunk of chunks) {
        const rows = chunk.map((s) => ({
          exam_center_id: examCenterId,
          connected_institute_id: connectedInstituteId || null,
          seat_number: s.seat_number,
          institute_code: s.institute_code || '0000',
          scheme: s.scheme,
          sub_codes: s.paper_codes,
          is_deleted: false,
        }));
        const { error: upsertErr } = await supabase
          .from('students')
          .upsert(rows, { onConflict: 'exam_center_id,seat_number' });
        if (upsertErr) throw upsertErr;
      }

      await recalculateTimetableCounts(supabase, examCenterId);

      await supabase
        .from('uploads')
        .update({
          status: 'PROCESSED',
          record_count: finalData.size,
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', uploadRecordId);

      return NextResponse.json({
        success: true,
        status: 'saved',
        message: 'Seating arrangement processed successfully',
        data: {
          total_students: finalData.size,
          stored_filename: storedFilename,
        },
      });
    }

    // -------------------------------------------------------------------------
    // 4. INVENTORY
    // -------------------------------------------------------------------------
    if (fileType === 'inventory') {
      const { data: timetableRows } = await supabase
        .from('timetable')
        .select('subject_code, date, session, scheme, subject_abbr')
        .eq('exam_center_id', examCenterId);

      const cache = new TimetableLookupCache(timetableRows || []);
      const items = parseInventoryExcel(buffer, cache);

      if (items.length === 0) {
        await supabase
          .from('uploads')
          .update({ status: 'FAILED', error_message: 'No valid inventory items found' })
          .eq('id', uploadRecordId);
        return NextResponse.json({ error: 'No valid inventory items found' }, { status: 400 });
      }

      // Delete old inventory
      await supabase.from('qp_inventory').delete().eq('exam_center_id', examCenterId);

      // Filter items with timetable info
      const validItems = items.filter((i) => i.timetable_date);
      const chunks = chunkArray(validItems, 100);

      for (const chunk of chunks) {
        const rows = chunk.map((i) => ({
          exam_center_id: examCenterId,
          day: i.day,
          date: i.timetable_date!,
          session: i.timetable_session || i.session || 'Morning',
          subject_code: i.paper_code,
          expected_students: i.no_of_candidates,
          expected_packets: i.no_of_packets_required,
        }));
        const { error: insertErr } = await supabase.from('qp_inventory').insert(rows);
        if (insertErr) throw insertErr;
      }

      await supabase
        .from('uploads')
        .update({
          status: 'PROCESSED',
          record_count: validItems.length,
          processed_at: new Date().toISOString(),
        })
        .eq('id', uploadRecordId);

      return NextResponse.json({
        success: true,
        message: 'Inventory processed successfully',
        data: {
          total_items: items.length,
          inserted: validItems.length,
          skipped: items.length - validItems.length,
          stored_filename: storedFilename,
        },
      });
    }

    // -------------------------------------------------------------------------
    // 5. E-MARKSHEET
    // -------------------------------------------------------------------------
    if (fileType === 'emarksheet') {
      const items = parseEMarksheetExcel(buffer);

      if (items.length === 0) {
        await supabase
          .from('uploads')
          .update({ status: 'FAILED', error_message: 'No valid e-marksheet items found' })
          .eq('id', uploadRecordId);
        return NextResponse.json({ error: 'No valid e-marksheet items found' }, { status: 400 });
      }

      // Delete old e_marksheets
      await supabase.from('e_marksheets').delete().eq('exam_center_id', examCenterId);

      const chunks = chunkArray(items, 250);
      for (const chunk of chunks) {
        const rows = chunk.map((i) => ({
          exam_center_id: examCenterId,
          sheet_no: i.sheet_no,
          subject_name: i.subject_name,
          scheme: i.scheme,
          subject_head: i.subject_head,
          paper_code: i.paper_code,
          file_name: i.file_name,
          processed_at: new Date().toISOString(),
        }));
        const { error: insertErr } = await supabase.from('e_marksheets').insert(rows);
        if (insertErr) throw insertErr;
      }

      await supabase
        .from('uploads')
        .update({
          status: 'PROCESSED',
          record_count: items.length,
          processed_at: new Date().toISOString(),
        })
        .eq('id', uploadRecordId);

      return NextResponse.json({
        success: true,
        message: 'E-Marksheet processed successfully',
        data: {
          total_items: items.length,
          inserted: items.length,
          stored_filename: storedFilename,
        },
      });
    }

    return NextResponse.json({ error: `Unsupported file type: ${fileType}` }, { status: 400 });
  } catch (err: any) {
    console.error(`Processing failed for ${fileType}:`, err);
    await supabase
      .from('uploads')
      .update({ status: 'FAILED', error_message: err.message || 'Processing failed' })
      .eq('id', uploadRecordId);
    return NextResponse.json(
      { error: `Processing failed: ${err.message || 'Unknown error'}` },
      { status: 500 },
    );
  }
}

// =============================================================================
// Helper: Recalculate total_students in timetable
// =============================================================================
async function recalculateTimetableCounts(supabase: any, examCenterId: string) {
  const { data: students } = await supabase
    .from('students')
    .select('sub_codes, scheme')
    .eq('exam_center_id', examCenterId)
    .eq('is_deleted', false);

  if (!students) return;

  const counts = new Map<string, number>();
  for (const s of students) {
    const codes = (s.sub_codes as string[]) || [];
    const scheme = s.scheme || '';
    for (const c of codes) {
      const key = `${c}_${scheme}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  const { data: timetableEntries } = await supabase
    .from('timetable')
    .select('id, subject_code, scheme')
    .eq('exam_center_id', examCenterId);

  if (!timetableEntries) return;

  for (const entry of timetableEntries) {
    const key = `${entry.subject_code}_${entry.scheme || ''}`;
    const totalStudents = counts.get(key) || 0;
    await supabase.from('timetable').update({ total_students: totalStudents }).eq('id', entry.id);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileType: string }> },
) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileType } = await params;
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'status';
    const instituteId = url.searchParams.get('instituteId');
    const fileName = url.searchParams.get('file_name');

    const supabase = await createClient();

    if (action === 'download' && fileName) {
      const { data: upload } = await supabase
        .from('uploads')
        .select('file_path, original_filename')
        .eq('exam_center_id', examCenterId)
        .eq('file_type', fileType)
        .eq('stored_filename', fileName)
        .maybeSingle();

      const path = upload?.file_path || `${examCenterId}/${fileType}/${fileName}`;
      const { data: fileBlob, error } = await supabase.storage.from('uploads').download(path);

      if (error || !fileBlob) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      return new NextResponse(fileBlob, {
        headers: {
          'Content-Disposition': `attachment; filename="${upload?.original_filename || fileName}"`,
          'Content-Type': fileBlob.type || 'application/octet-stream',
        },
      });
    }

    // Default: status
    let query = supabase
      .from('uploads')
      .select('*')
      .eq('exam_center_id', examCenterId)
      .eq('file_type', fileType)
      .order('created_at', { ascending: false })
      .limit(1);

    if (instituteId) {
      query = query.eq('connected_institute_id', instituteId);
    }

    const { data: upload } = await query.maybeSingle();

    return NextResponse.json({
      success: true,
      data: {
        fileExists: !!upload,
        isProcessed: upload?.status === 'PROCESSED',
        fileName: upload?.original_filename,
        storedFilename: upload?.stored_filename,
        recordCount: upload?.record_count,
        uploadedAt: upload?.created_at,
        processedAt: upload?.processed_at,
        status: upload?.status,
        connectedInstituteId: upload?.connected_institute_id,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
