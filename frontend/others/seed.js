  const fs = require('fs');
  const path = require('path');
  const { randomUUID } = require('crypto');
  const crypto = require('crypto');

  // ============================================
  // Configuration - Your Real IDs
  // ============================================

  const CONFIG = {
    USER_ID: 'wLYz7PKxDBedCs4JbB5vEp03gjJnAaju',
    USER_NAME: 'MMCOE',
    USER_EMAIL: 'bruce@testforge.dc',
    ORG_ID: '86f836d5-d039-4de8-9202-57048bc9016c',
    ORG_NAME: 'MMCOE',
    ORG_SLUG: 'mmcoe',
    EC_CODE: '1740',
    NOW: new Date().toISOString(),
    INSERT_USER: true,
  };

  // ============================================
  // UUID Maps
  // ============================================

  const maps = {
    subjects: new Map(),
    staff: new Map(),
    institutes: new Map(),
    blocks: new Map(),
    controlRoomCounter: 1,
    pendingOrders: [],
  };

  // ============================================
  // Output Buffer
  // ============================================

  const output = [];

  function writeLine(sql) {
    output.push(sql + '\n');
  }

  function escape(str) {
    if (str === null || str === undefined) return 'NULL';
    if (str === 'NULL') return 'NULL';
    return `'${String(str).replace(/'/g, "''")}'`;
  }

  function jsonb(obj) {
    if (!obj) return 'NULL';
    if (Array.isArray(obj) && obj.length === 0) return `'[]'::jsonb`;
    return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
  }

  function safeJson(value, fallback = []) {
    if (!value || value === 'NULL' || value === "''") return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function generateUuidFromString(str) {
    const hash = crypto.createHash('sha256').update(str).digest('hex');
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join('-');
  }

  // ============================================
  // Parse MySQL INSERT - Handles multi-line properly
  // ============================================

  function parseInsert(statement) {
    // Match INSERT INTO `table` ... VALUES
    const insertMatch = statement.match(/INSERT\s+INTO\s+`?(\w+)`?\s+.*?VALUES\s+/is);
    if (!insertMatch) return null;

    const tableName = insertMatch[1];

    // Extract everything after VALUES
    const valuesStart = statement.indexOf('VALUES', insertMatch.index) + 6;
    let valuesPart = statement.substring(valuesStart).trim();

    // Remove trailing semicolon
    valuesPart = valuesPart.replace(/;+\s*$/, '');

    const rows = [];
    let depth = 0;
    let start = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < valuesPart.length; i++) {
      const ch = valuesPart[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (ch === '\\') {
        escapeNext = true;
        continue;
      }

      if (ch === "'") {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (ch === '(') {
          if (depth === 0) start = i + 1;
          depth++;
        } else if (ch === ')') {
          depth--;
          if (depth === 0) {
            const rowStr = valuesPart.substring(start, i);
            const values = parseRowValues(rowStr);
            if (values.length > 0) rows.push(values);
          }
        }
      }
    }

    return { tableName, rows };
  }

  function parseRowValues(rowStr) {
    const values = [];
    let current = '';
    let inQuote = false;
    let escapeNext = false;

    for (let i = 0; i < rowStr.length; i++) {
      const ch = rowStr[i];

      if (escapeNext) {
        current += ch;
        escapeNext = false;
        continue;
      }

      if (ch === '\\') {
        escapeNext = true;
        current += ch;
        continue;
      }

      if (ch === "'") {
        inQuote = !inQuote;
        current += ch;
        continue;
      }

      if (!inQuote && ch === ',') {
        values.push(cleanValue(current.trim()));
        current = '';
        continue;
      }

      current += ch;
    }

    if (current.trim()) {
      values.push(cleanValue(current.trim()));
    }

    return values;
  }

  function cleanValue(val) {
    if (val === 'NULL' || val === "''") return null;
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      return val.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
    }
    return val;
  }

  // ============================================
  // Data Collections
  // ============================================

  const data = {
    subjects: [],
    examCenters: null,
    connectedInstitutes: [],
    students: [],
    staff: [],
    blocks: [],
    blockAllocations: [],
    timetable: [],
    orders: [],
    qpInventory: [],
    eMarksheets: [],
  };

  // ============================================
  // Process Functions
  // ============================================

  function processSubjects(rows) {
    for (const values of rows) {
      const [id, code, name, scheme, abbr] = values;
      const key = `${code}_${scheme}`;

      if (!maps.subjects.has(key)) {
        maps.subjects.set(key, generateUuidFromString(key));
        data.subjects.push({
          id: maps.subjects.get(key),
          code,
          name,
          scheme,
          abbr: abbr || null,
          isDeleted: false,
          createdAt: CONFIG.NOW,
          updatedAt: CONFIG.NOW,
        });
      }
    }
  }

  function processExamCenterConfig(rows) {
    for (const values of rows) {
      const [id, ecCode, ecInfoJson, conInstJson, examInfoJson, dcInfoJson, departmentsJson] = values;

      if (ecCode !== CONFIG.EC_CODE) continue;

      const ecInfo = safeJson(ecInfoJson, {});
      const conInst = safeJson(conInstJson, []);
      const examInfo = safeJson(examInfoJson, {});
      const dcInfo = safeJson(dcInfoJson, {});
      const departments = safeJson(departmentsJson, []);

      const EXAM_CENTER_ID = generateUuidFromString(`EC_${CONFIG.EC_CODE}`);

      data.examCenters = {
        id: EXAM_CENTER_ID,
      orgId: CONFIG.ORG_ID,
        code: ecCode,
        name: ecInfo.NAME || '',
        address: ecInfo.ADDRESS || null,
        officerIncharge: ecInfo.OFFICER_INCHARGE || null,
        sealingSupervisor: ecInfo.SEALING_SUPERVISOR || null,
        distCenterCode: dcInfo.CODE || null,
        distCenterName: dcInfo.NAME || null,
        season: examInfo.SEASON || null,
        examYear: examInfo.YEAR ? parseInt(examInfo.YEAR) : null,
        startDate: examInfo.START_DATE || null,
        endDate: examInfo.END_DATE || null,
        departments: departments,
        isActive: true,
        isDeleted: false,
        createdAt: CONFIG.NOW,
        updatedAt: CONFIG.NOW,
      };

      for (const inst of conInst) {
        const instCode = inst.CODE;
        if (!maps.institutes.has(instCode)) {
          const instUuid = generateUuidFromString(`INST_${instCode}`);
          maps.institutes.set(instCode, instUuid);
          data.connectedInstitutes.push({
            id: instUuid,
            
            examCenterId: EXAM_CENTER_ID,
            instituteCode: instCode,
            instituteName: inst.NAME,
            isActive: true,
            createdAt: CONFIG.NOW,
            updatedAt: CONFIG.NOW,
          });
        }
      }
    }
  }

  function processSupervisor(rows) {
    // Wait for examCenters to be processed first
    if (!data.examCenters) {
      console.warn('   ⚠️ examCenters not yet initialized, supervisor processing may have wrong ID');
      return;
    }
    for (const values of rows) {
      const [id, uid, name, department, role, email] = values;
      if (!maps.staff.has(uid)) {
        maps.staff.set(uid, generateUuidFromString(uid));
        data.staff.push({
          id: maps.staff.get(uid),
          
          examCenterId: data.examCenters.id,  // Use the actual exam center ID
          uid,
          name,
          department: department || 'UNKNOWN',
          email: email || null,
          staffType: 'SUPERVISOR',
          role: role || null,
          designation: null,
          postHeldInExamination: null,
          isDeleted: false,
          createdAt: CONFIG.NOW,
          updatedAt: CONFIG.NOW,
        });
      }
    }
  }

  function processReliever(rows) {
    if (!data.examCenters) {
      console.warn('   ⚠️ examCenters not yet initialized, reliever processing may have wrong ID');
      return;
    }
    for (const values of rows) {
      const [id, uid, name, department, email] = values;
      if (!maps.staff.has(uid)) {
        maps.staff.set(uid, generateUuidFromString(uid));
        data.staff.push({
          id: maps.staff.get(uid),
          
          examCenterId: data.examCenters.id,  // Use the actual exam center ID
          uid,
          name,
          department: department || 'UNKNOWN',
          email: email || null,
          staffType: 'RELIEVER',
          role: null,
          designation: null,
          postHeldInExamination: null,
          isDeleted: false,
          createdAt: CONFIG.NOW,
          updatedAt: CONFIG.NOW,
        });
      }
    }
  }

  function processControlRoom(rows) {
    if (!data.examCenters) {
      console.warn('   ⚠️ examCenters not yet initialized, control room processing may have wrong ID');
      return;
    }
    for (const values of rows) {
      const [id, name, designation, postHeld] = values;
      const fakeUid = `CR-${maps.controlRoomCounter++}`;
      maps.staff.set(fakeUid, generateUuidFromString(fakeUid));
      data.staff.push({
        id: maps.staff.get(fakeUid),
        
        examCenterId: data.examCenters.id,  // Use the actual exam center ID
        uid: fakeUid,
        name,
        department: 'CONTROL_ROOM',
        email: null,
        staffType: 'CONTROL_ROOM',
        role: null,
        designation: designation || null,
        postHeldInExamination: postHeld || null,
        isDeleted: false,
        createdAt: CONFIG.NOW,
        updatedAt: CONFIG.NOW,
      });
    }
  }

  function processBlockDetails(rows) {
    for (const values of rows) {
      const [id, location, strength, name, distributionJson] = values;
      maps.blocks.set(location, generateUuidFromString(location));
      data.blocks.push({
        id: maps.blocks.get(location),
        
        examCenterId: data.examCenters?.id,
        blockNo: id.toString(),
        location,
        name,
        strength: parseInt(strength),
        distribution: safeJson(distributionJson, [10, 10, 10, 10]),
        isDeleted: false,
        createdAt: CONFIG.NOW,
        updatedAt: CONFIG.NOW,
      });
    }
  }

  function processTimetable(rows) {
    for (const values of rows) {
      const [
        id,
        date,
        session,
        timeSlot,
        subjectCode,
        subjectName,
        scheme,
        subjectAbbr,
        absentNumbersJson,
        cpsStudentsJson,
        totalStudents,
      ] = values;

      const subjectKey = `${subjectCode}_${scheme}`;
      const subjectId = maps.subjects.get(subjectKey);

      data.timetable.push({
        id: generateUuidFromString(`${date}_${session}_${subjectCode}_${scheme}`),
        
        examCenterId: data.examCenters?.id,
        subjectId,
        date,
        session,
        timeSlot,
        subjectCode,
        subjectName,
        scheme,
        subjectAbbr: subjectAbbr || null,
        totalStudents: totalStudents ? parseInt(totalStudents) : 0,
        absentNumbers: safeJson(absentNumbersJson, []),
        cpsStudents: safeJson(cpsStudentsJson, []),
        createdAt: CONFIG.NOW,
        updatedAt: CONFIG.NOW,
      });
    }
  }

  function processStudent(rows) {
    for (const values of rows) {
      const [id, instCode, seatNo, enrollment, name, scheme, subjectsJson, subCodesJson] = values;

      let instituteUuid = maps.institutes.get(instCode);
      if (!instituteUuid && instCode) {
        instituteUuid = generateUuidFromString(`INST_${instCode}`);
        maps.institutes.set(instCode, instituteUuid);
        data.connectedInstitutes.push({
          id: instituteUuid,
          
          examCenterId: data.examCenters?.id,
          instituteCode: instCode,
          instituteName: `Institute ${instCode}`,
          isActive: true,
          createdAt: CONFIG.NOW,
          updatedAt: CONFIG.NOW,
        });
      }

      data.students.push({
        id: generateUuidFromString(`${instCode}_${seatNo}`),
        
        examCenterId: data.examCenters?.id,
        connectedInstituteId: instituteUuid || null,
        seatNumber: seatNo ? parseInt(seatNo) : null,
        instituteCode: instCode,
        enrollmentNumber: enrollment || null,
        name: name || null,
        scheme: scheme || null,
        subjects: safeJson(subjectsJson, []),
        subCodes: safeJson(subCodesJson, []),
        isDeleted: false,
        createdAt: CONFIG.NOW,
        updatedAt: CONFIG.NOW,
      });
    }
  }

  function processBlockAllocation(rows) {
    for (const values of rows) {
      const [
        id,
        instCode,
        date,
        session,
        timeslot,
        blockNo,
        location,
        scheme,
        subjectCode,
        subjectName,
        seatNumbersJson,
        first,
        last,
        assigned,
        strength,
        supervisorUid,
        supervisorName,
      ] = values;

      data.blockAllocations.push({
        id: generateUuidFromString(`${date}_${session}_${location}_${subjectCode}`),
        
        examCenterId: data.examCenters?.id,
        date,
        session,
        timeslot: timeslot || null,
        blockNo: blockNo || null,
        blockId: maps.blocks.get(location),
        location,
        scheme,
        subjectCode,
        subjectName,
        seatNumbers: safeJson(seatNumbersJson, []),
        firstSeat: first ? parseInt(first) : null,
        lastSeat: last ? parseInt(last) : null,
        assignedCount: assigned ? parseInt(assigned) : null,
        strength: strength ? parseInt(strength) : null,
        supervisorUid: supervisorUid || null,
        supervisorName: supervisorName || null,
        createdAt: CONFIG.NOW,
        updatedAt: CONFIG.NOW,
      });
    }
  }

  function processSupervisorOrder(rows) {
    for (const values of rows) {
      const [id, date, session, supervisorId, supervisorUid] = values;
      if (supervisorUid) {
        maps.pendingOrders.push({ type: 'SUPERVISOR', uid: supervisorUid, date, session });
      }
    }
  }

  function processRelieverOrder(rows) {
    for (const values of rows) {
      const [id, date, session, relieverId, relieverUid] = values;
      if (relieverUid) {
        maps.pendingOrders.push({ type: 'RELIEVER', uid: relieverUid, date, session });
      }
    }
  }

  function processInventory(rows) {
    for (const values of rows) {
      const [
        id,
        day,
        date,
        session,
        subjectCode,
        expectedStudents,
        expectedPackets,
        receivedPackets,
        receivedQps,
      ] = values;

      data.qpInventory.push({
        id: generateUuidFromString(`${date}_${session}_${subjectCode}`),
        
        examCenterId: data.examCenters?.id,
        day: day ? parseInt(day) : null,
        date,
        session,
        subjectCode,
        expectedStudents: expectedStudents ? parseInt(expectedStudents) : null,
        expectedPackets: expectedPackets ? parseInt(expectedPackets) : null,
        receivedPackets: receivedPackets ? parseInt(receivedPackets) : 0,
        receivedQps: receivedQps ? parseInt(receivedQps) : 0,
        createdAt: CONFIG.NOW,
        updatedAt: CONFIG.NOW,
      });
    }
  }

  function processEMarksheet(rows) {
    for (const values of rows) {
      const [id, sheetNo, subjectName, scheme, subjectHead, paperCode, fileName] = values;

      data.eMarksheets.push({
        id: generateUuidFromString(`${paperCode}_${scheme}_${sheetNo}`),
        
        examCenterId: data.examCenters?.id,
        sheetNo: sheetNo || null,
        subjectName: subjectName || null,
        scheme: scheme || null,
        subjectHead: subjectHead || null,
        paperCode: paperCode || null,
        fileName: fileName || null,
        processedAt: null,
        createdAt: CONFIG.NOW,
      });
    }
  }

  function resolveOrders() {
    for (const pending of maps.pendingOrders) {
      const staffId = maps.staff.get(pending.uid);
      if (staffId) {
        data.orders.push({
          id: generateUuidFromString(`${pending.date}_${pending.session}_${pending.uid}`),
          
          examCenterId: data.examCenters?.id,
          staffId,
          orderType: pending.type,
          date: pending.date,
          session: pending.session,
          orderKey: null,
          sentAt: null,
          createdAt: CONFIG.NOW,
          updatedAt: CONFIG.NOW,
        });
      }
    }
  }

  // ============================================
  // Process line by line (accumulating multi-line statements)
  // ============================================
  // ============================================
  // Process line by line - FIXED to handle separate INSERTs for same table
  // ============================================

  function processFile(content) {
    let currentStatement = '';
    let inStatement = false;
    let processed = 0;

    // Track pending rows for tables that have multiple INSERT statements
    const pendingRows = new Map();

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) {
        continue;
      }

      // Start of INSERT statement
      if (!inStatement && trimmed.toUpperCase().startsWith('INSERT INTO')) {
        inStatement = true;
        currentStatement = line;
      }
      // Continue building multi-line statement
      else if (inStatement) {
        currentStatement += ' ' + line;

        // Check if statement ends (with semicolon)
        if (line.includes(';')) {
          const parsed = parseInsert(currentStatement);
          if (parsed) {
            const { tableName, rows } = parsed;

            // For TH_CROOM_1740, collect rows from multiple INSERTs
            if (tableName === 'TH_CROOM_1740') {
              if (!pendingRows.has(tableName)) {
                pendingRows.set(tableName, []);
              }
              pendingRows.get(tableName).push(...rows);
            } else {
              // Process other tables immediately
              processTableRows(tableName, rows);
            }

            processed++;
            if (processed % 50 === 0) {
              console.log(`   Processed ${processed} INSERT statements...`);
            }
          }
          inStatement = false;
          currentStatement = '';
        }
      }
    }

    // Process collected rows for TH_CROOM_1740
    if (pendingRows.has('TH_CROOM_1740')) {
      const allRows = pendingRows.get('TH_CROOM_1740');
      console.log(
        `   📋 TH_CROOM_1740: collected ${allRows.length} rows from ${allRows.length} INSERT statements`
      );
      processControlRoom(allRows);
    }

    return processed;
  }

  // Helper function to process table rows
  function processTableRows(tableName, rows) {
    switch (tableName) {
      case 'THC_SCHEME_DETAILS':
        processSubjects(rows);
        break;
      case 'THC_EC_CONFIG':
        processExamCenterConfig(rows);
        break;
      case 'TH_SUP_1740':
        processSupervisor(rows);
        break;
      case 'TH_REL_1740':
        processReliever(rows);
        break;
      case 'THC_BLOCK_DETAILS_1740':
        processBlockDetails(rows);
        break;
      case 'TH_TT_1740':
        processTimetable(rows);
        break;
      case 'TH_SC_1740':
        processStudent(rows);
        break;
      case 'TH_BLOCK_CONFIG_1740':
      case 'THC_BLOCK_CONFIG_1740':
        processBlockAllocation(rows);
        break;
      case 'TH_SUP_ORD_1740':
        processSupervisorOrder(rows);
        break;
      case 'TH_REL_ORD_1740':
        processRelieverOrder(rows);
        break;
      case 'TH_IV_1740':
        processInventory(rows);
        break;
      case 'TH_EM_1740':
        processEMarksheet(rows);
        break;
    }
  }

  // ============================================
  // Generate PostgreSQL SQL
  // ============================================
// ============================================
// Generate PostgreSQL SQL
// ============================================
function generatePostgresSQL() {
  writeLine('BEGIN;');
  writeLine('');

  if (CONFIG.INSERT_USER) {
    writeLine('-- ============================================');
    writeLine('-- 0. User');
    writeLine('-- ============================================');
    writeLine('');
    writeLine(`INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at) VALUES (`);
    writeLine(`  ${escape(CONFIG.USER_ID)}, ${escape(CONFIG.USER_NAME)}, ${escape(CONFIG.USER_EMAIL)},`);
    writeLine(`  true, NULL, ${escape(CONFIG.NOW)}, ${escape(CONFIG.NOW)}`);
    writeLine(`) ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 1. Organizations
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 1. Organizations');
  writeLine('-- ============================================');
  writeLine('');
  writeLine(`INSERT INTO organizations (id, name, slug, owner_id, subscription_tier, subscription_expires_at, trial_started_at, trial_ends_at, settings, created_at, updated_at) VALUES (`);
  writeLine(`  ${escape(CONFIG.ORG_ID)}, ${escape(CONFIG.ORG_NAME)}, ${escape(CONFIG.ORG_SLUG)}, ${escape(CONFIG.USER_ID)},`);
  writeLine(`  'trial', NULL, ${escape(CONFIG.NOW)}, ${escape(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())},`);
  writeLine(`  '{}', ${escape(CONFIG.NOW)}, ${escape(CONFIG.NOW)}`);
  writeLine(`) ON CONFLICT (id) DO NOTHING;`);
  writeLine('');

  // ==========================================
  // 2. Exam Centers
  // ==========================================
  if (data.examCenters) {
    writeLine('-- ============================================');
    writeLine('-- 2. Exam Centers');
    writeLine('-- ============================================');
    writeLine('');
    const ec = data.examCenters;
    writeLine(`INSERT INTO exam_centers (id, org_id, code, name, address, officer_incharge, sealing_supervisor, dist_center_code, dist_center_name, season, exam_year, start_date, end_date, departments, is_active, is_deleted, created_at, updated_at) VALUES (`);
    writeLine(`  ${escape(ec.id)}, ${escape(ec.orgId)}, ${escape(ec.code)}, ${escape(ec.name)}, ${escape(ec.address)},`);
    writeLine(`  ${escape(ec.officerIncharge)}, ${escape(ec.sealingSupervisor)}, ${escape(ec.distCenterCode)}, ${escape(ec.distCenterName)},`);
    writeLine(`  ${escape(ec.season)}, ${ec.examYear}, ${escape(ec.startDate)}, ${escape(ec.endDate)},`);
    writeLine(`  ${jsonb(ec.departments)}, ${ec.isActive}, ${ec.isDeleted}, ${escape(ec.createdAt)}, ${escape(ec.updatedAt)}`);
    writeLine(`) ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 3. Connected Institutes
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 3. Connected Institutes');
  writeLine('-- ============================================');
  writeLine('');

  if (!data.examCenters) {
    writeLine('-- No exam centers found, skipping connected institutes');
    writeLine('');
  } else {
    const uniqueInstitutes = new Map();
    for (const ci of data.connectedInstitutes) {
      const key = `${ci.examCenterId}_${ci.instituteCode}`;
      if (!uniqueInstitutes.has(key)) uniqueInstitutes.set(key, ci);
    }

    if (uniqueInstitutes.size > 0) {
      const institutesArray = Array.from(uniqueInstitutes.values());
      const examCenterId = data.examCenters.id;
      
      writeLine(`INSERT INTO connected_institutes (id, exam_center_id, institute_code, institute_name, is_active, created_at, updated_at) VALUES`);
      for (let i = 0; i < institutesArray.length; i++) {
        const ci = institutesArray[i];
        const isLast = i === institutesArray.length - 1;
        writeLine(`  (${escape(ci.id)}, ${escape(examCenterId)}, ${escape(ci.instituteCode)}, ${escape(ci.instituteName)}, ${ci.isActive}, ${escape(ci.createdAt)}, ${escape(ci.updatedAt)})${isLast ? '' : ','}`);
      }
      writeLine(` ON CONFLICT (id) DO NOTHING;`);
      writeLine('');
    }
  }

  // ==========================================
  // 4. Subjects
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 4. Subjects');
  writeLine('-- ============================================');
  writeLine('');
  if (data.subjects.length > 0) {
    writeLine(`INSERT INTO subjects (id, code, name, scheme, abbr, is_deleted, created_at, updated_at) VALUES`);
    for (let i = 0; i < data.subjects.length; i++) {
      const subj = data.subjects[i];
      const isLast = i === data.subjects.length - 1;
      writeLine(`  (${escape(subj.id)}, ${escape(subj.code)}, ${escape(subj.name)}, ${escape(subj.scheme)}, ${escape(subj.abbr)}, ${subj.isDeleted}, ${escape(subj.createdAt)}, ${escape(subj.updatedAt)})${isLast ? '' : ','}`);
    }
    writeLine(` ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 5. Staff (NO org_id - only exam_center_id)
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 5. Staff');
  writeLine('-- ============================================');
  writeLine('');
  const uniqueStaff = new Map();
  for (const staff of data.staff) {
    if (!uniqueStaff.has(staff.uid)) uniqueStaff.set(staff.uid, staff);
  }

  if (uniqueStaff.size > 0) {
    const staffArray = Array.from(uniqueStaff.values());
    console.log(`   📝 Generating bulk INSERT for ${staffArray.length} staff members`);
    writeLine(`INSERT INTO staff (id, exam_center_id, uid, name, department, email, staff_type, role, designation, post_held_in_examination, is_deleted, created_at, updated_at) VALUES`);
    for (let i = 0; i < staffArray.length; i++) {
      const staff = staffArray[i];
      const isLast = i === staffArray.length - 1;
      writeLine(`  (${escape(staff.id)}, ${escape(staff.examCenterId)}, ${escape(staff.uid)}, ${escape(staff.name)}, ${escape(staff.department)}, ${escape(staff.email)}, ${escape(staff.staffType)}, ${escape(staff.role)}, ${escape(staff.designation)}, ${escape(staff.postHeldInExamination)}, ${staff.isDeleted}, ${escape(staff.createdAt)}, ${escape(staff.updatedAt)})${isLast ? '' : ','}`);
    }
    writeLine(` ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 6. Blocks (NO org_id)
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 6. Blocks');
  writeLine('-- ============================================');
  writeLine('');
  if (data.blocks.length > 0 && data.examCenters) {
    writeLine(`INSERT INTO blocks (id, exam_center_id, block_no, location, name, strength, distribution, is_deleted, created_at, updated_at) VALUES`);
    for (let i = 0; i < data.blocks.length; i++) {
      const block = data.blocks[i];
      const isLast = i === data.blocks.length - 1;
      writeLine(`  (${escape(block.id)}, ${escape(data.examCenters.id)}, ${escape(block.blockNo)}, ${escape(block.location)}, ${escape(block.name)}, ${block.strength}, ${jsonb(block.distribution)}, ${block.isDeleted}, ${escape(block.createdAt)}, ${escape(block.updatedAt)})${isLast ? '' : ','}`);
    }
    writeLine(` ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 7. Timetable (NO org_id)
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 7. Timetable');
  writeLine('-- ============================================');
  writeLine('');
  if (data.timetable.length > 0 && data.examCenters) {
    writeLine(`INSERT INTO timetable (id, exam_center_id, subject_id, date, session, time_slot, subject_code, subject_name, scheme, subject_abbr, total_students, absent_numbers, cps_students, created_at, updated_at) VALUES`);
    for (let i = 0; i < data.timetable.length; i++) {
      const tt = data.timetable[i];
      const isLast = i === data.timetable.length - 1;
      writeLine(`  (${escape(tt.id)}, ${escape(data.examCenters.id)}, ${escape(tt.subjectId)}, ${escape(tt.date)}, ${escape(tt.session)}, ${escape(tt.timeSlot)}, ${escape(tt.subjectCode)}, ${escape(tt.subjectName)}, ${escape(tt.scheme)}, ${escape(tt.subjectAbbr)}, ${tt.totalStudents}, ${jsonb(tt.absentNumbers)}, ${jsonb(tt.cpsStudents)}, ${escape(tt.createdAt)}, ${escape(tt.updatedAt)})${isLast ? '' : ','}`);
    }
    writeLine(` ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 8. Students (NO org_id)
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 8. Students');
  writeLine('-- ============================================');
  writeLine('');
  if (data.students.length > 0 && data.examCenters) {
    writeLine(`INSERT INTO students (id, exam_center_id, connected_institute_id, seat_number, institute_code, enrollment_number, name, scheme, subjects, sub_codes, is_deleted, created_at, updated_at) VALUES`);
    for (let i = 0; i < data.students.length; i++) {
      const student = data.students[i];
      const isLast = i === data.students.length - 1;
      writeLine(`  (${escape(student.id)}, ${escape(data.examCenters.id)}, ${escape(student.connectedInstituteId)}, ${student.seatNumber}, ${escape(student.instituteCode)}, ${escape(student.enrollmentNumber)}, ${escape(student.name)}, ${escape(student.scheme)}, ${jsonb(student.subjects)}, ${jsonb(student.subCodes)}, ${student.isDeleted}, ${escape(student.createdAt)}, ${escape(student.updatedAt)})${isLast ? '' : ','}`);
    }
    writeLine(` ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 9. Block Allocations (NO org_id)
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 9. Block Allocations');
  writeLine('-- ============================================');
  writeLine('');
  if (data.blockAllocations.length > 0 && data.examCenters) {
    writeLine(`INSERT INTO block_allocations (id, exam_center_id, date, session, timeslot, block_no, block_id, location, scheme, subject_code, subject_name, seat_numbers, first_seat, last_seat, assigned_count, strength, supervisor_uid, supervisor_name, created_at, updated_at) VALUES`);
    for (let i = 0; i < data.blockAllocations.length; i++) {
      const ba = data.blockAllocations[i];
      const isLast = i === data.blockAllocations.length - 1;
      writeLine(`  (${escape(ba.id)}, ${escape(data.examCenters.id)}, ${escape(ba.date)}, ${escape(ba.session)}, ${escape(ba.timeslot)}, ${escape(ba.blockNo)}, ${escape(ba.blockId)}, ${escape(ba.location)}, ${escape(ba.scheme)}, ${escape(ba.subjectCode)}, ${escape(ba.subjectName)}, ${jsonb(ba.seatNumbers)}, ${ba.firstSeat}, ${ba.lastSeat}, ${ba.assignedCount}, ${ba.strength}, ${escape(ba.supervisorUid)}, ${escape(ba.supervisorName)}, ${escape(ba.createdAt)}, ${escape(ba.updatedAt)})${isLast ? '' : ','}`);
    }
    writeLine(` ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 10. Orders (NO org_id)
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 10. Orders');
  writeLine('-- ============================================');
  writeLine('');
  if (data.orders.length > 0 && data.examCenters) {
    writeLine(`INSERT INTO orders (id, exam_center_id, staff_id, order_type, date, session, order_key, sent_at, created_at, updated_at) VALUES`);
    for (let i = 0; i < data.orders.length; i++) {
      const order = data.orders[i];
      const isLast = i === data.orders.length - 1;
      writeLine(`  (${escape(order.id)}, ${escape(data.examCenters.id)}, ${escape(order.staffId)}, ${escape(order.orderType)}, ${escape(order.date)}, ${escape(order.session)}, ${escape(order.orderKey)}, ${escape(order.sentAt)}, ${escape(order.createdAt)}, ${escape(order.updatedAt)})${isLast ? '' : ','}`);
    }
    writeLine(` ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 11. QP Inventory (NO org_id)
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 11. QP Inventory');
  writeLine('-- ============================================');
  writeLine('');
  if (data.qpInventory.length > 0 && data.examCenters) {
    writeLine(`INSERT INTO qp_inventory (id, exam_center_id, day, date, session, subject_code, expected_students, expected_packets, received_packets, received_qps, created_at, updated_at) VALUES`);
    for (let i = 0; i < data.qpInventory.length; i++) {
      const inv = data.qpInventory[i];
      const isLast = i === data.qpInventory.length - 1;
      writeLine(`  (${escape(inv.id)}, ${escape(data.examCenters.id)}, ${inv.day}, ${escape(inv.date)}, ${escape(inv.session)}, ${escape(inv.subjectCode)}, ${inv.expectedStudents}, ${inv.expectedPackets}, ${inv.receivedPackets}, ${inv.receivedQps}, ${escape(inv.createdAt)}, ${escape(inv.updatedAt)})${isLast ? '' : ','}`);
    }
    writeLine(` ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  // ==========================================
  // 12. E-Marksheets (NO org_id)
  // ==========================================
  writeLine('-- ============================================');
  writeLine('-- 12. E-Marksheets');
  writeLine('-- ============================================');
  writeLine('');
  if (data.eMarksheets.length > 0 && data.examCenters) {
    writeLine(`INSERT INTO e_marksheets (id, exam_center_id, sheet_no, subject_name, scheme, subject_head, paper_code, file_name, processed_at, created_at) VALUES`);
    for (let i = 0; i < data.eMarksheets.length; i++) {
      const em = data.eMarksheets[i];
      const isLast = i === data.eMarksheets.length - 1;
      writeLine(`  (${escape(em.id)}, ${escape(data.examCenters.id)}, ${escape(em.sheetNo)}, ${escape(em.subjectName)}, ${escape(em.scheme)}, ${escape(em.subjectHead)}, ${escape(em.paperCode)}, ${escape(em.fileName)}, ${escape(em.processedAt)}, ${escape(em.createdAt)})${isLast ? '' : ','}`);
    }
    writeLine(` ON CONFLICT (id) DO NOTHING;`);
    writeLine('');
  }

  writeLine('COMMIT;');
}

  // ============================================
  // Main
  // ============================================

  async function main() {
    const inputFile = process.argv[2] || 'defaultdb.sql';
    const outputFile = process.argv[3] || 'postgres.sql';

    console.log(`📖 Reading ${inputFile}...`);
    const content = fs.readFileSync(inputFile, 'utf8');

    console.log(`📊 Processing file...`);
    const processed = processFile(content);

    console.log(`✅ Processed ${processed} INSERT statements`);
    console.log('');

    console.log('🔗 Resolving order relationships...');
    resolveOrders();

    console.log('📈 Data counts:');
    console.log(`   Subjects: ${data.subjects.length}`);
    console.log(`   Exam Centers: ${data.examCenters ? 1 : 0}`);
    console.log(`   Connected Institutes: ${data.connectedInstitutes.length}`);
    console.log(`   Staff: ${data.staff.length}`);
    console.log(`   Blocks: ${data.blocks.length}`);
    console.log(`   Timetable: ${data.timetable.length}`);
    console.log(`   Students: ${data.students.length}`);
    console.log(`   Block Allocations: ${data.blockAllocations.length}`);
    console.log(`   Orders: ${data.orders.length}`);
    console.log(`   QP Inventory: ${data.qpInventory.length}`);
    console.log(`   E-Marksheets: ${data.eMarksheets.length}`);

    console.log('');
    console.log(`📝 Generating PostgreSQL SQL to ${outputFile}...`);
    generatePostgresSQL();

    fs.writeFileSync(outputFile, output.join(''));

    console.log(`✅ Done! Output written to ${outputFile}`);
    console.log('');
    console.log('Next steps:');
    console.log(`   psql -d your_database -f ${outputFile}`);
  }

  main().catch(console.error);
    