import csv
from collections import defaultdict
import json
# Load subjects from CSV
subjects = []
with open('subjects.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Clean up fields
        row['code'] = row['code'].strip()
        row['scheme'] = row['scheme'].strip()
        row['name'] = row['name'].strip()
        row['abbr'] = row['abbr'].strip() if row['abbr'] else ''
        subjects.append(row)

# Group subjects by scheme
subjects_by_scheme = defaultdict(list)
for sub in subjects:
    scheme = sub['scheme']
    # Skip empty schemes
    if not scheme:
        continue
    # Split multiple schemes (comma separated)
    for s in scheme.split(','):
        s = s.strip()
        if s:
            subjects_by_scheme[s].append(sub)

print(f"Total subjects loaded: {len(subjects)}")
print(f"Unique schemes: {len(subjects_by_scheme)}")
print()

# Hardcoded Excel missing data
excel_missing_data = {
    "AAC": {"schemes": ["AE-6-I"], "students": 38},
    "AAE": {"schemes": ["AE-4-I"], "students": 5},
    "ACD": {"schemes": ["AE-5-I"], "students": 1},
    "ACN": {"schemes": ["CO-5-I", "HA-5-I"], "students": 12},
    "AEE": {"schemes": ["AE-6-I"], "students": 36},
    "AEN": {"schemes": ["AE-3-I", "ME-6-I"], "students": 105},
    "AET": {"schemes": ["AE-4-K"], "students": 26},
    "AJP": {"schemes": ["CO-5-I", "HA-5-I"], "students": 10},
    "AME": {"schemes": ["AE-2-I", "CE-2-I", "EE-2-I", "ME-2-I"], "students": 29},
    "AMI": {"schemes": ["CO-2-I", "HA-2-I"], "students": 3},
    "AMP": {"schemes": ["AE-2-I", "AE-4-I", "AE-4-K", "ME-2-I", "ME-5-I"], "students": 57},
    "AMS": {"schemes": ["AE-2-K", "CE-2-I", "CE-2-K", "CO-2-K", "EE-2-K", "HA-2-K", "ME-2-K", "MK-2-K"], "students": 930},
    "ASB": {"schemes": ["AE-4-I"], "students": 4},
    "ASC": {"schemes": ["AE-2-K", "CE-2-K", "EE-2-K", "ME-2-K", "MK-2-K"], "students": 538},
    "ASE": {"schemes": ["EE-2-I"], "students": 2},
    "ASM": {"schemes": ["AE-2-I", "CE-2-I"], "students": 2},
    "ASU": {"schemes": ["CE-3-I", "CE-3-K"], "students": 17},
    "ASY": {"schemes": ["AE-4-K"], "students": 26},
    "ATS": {"schemes": ["AE-3-I", "AE-3-K"], "students": 6},
    "BCO": {"schemes": ["CE-3-I"], "students": 3},
    "BEC": {"schemes": ["CO-2-I", "HA-2-I"], "students": 3},
    "BEE": {"schemes": ["AE-3-I", "CO-2-K", "ME-3-I"], "students": 371},
    "BMC": {"schemes": ["CE-2-K"], "students": 128},
    "BME": {"schemes": ["EE-2-I"], "students": 4},
    "BMS": {"schemes": ["AE-1-I", "AE-1-K", "CE-1-I", "CE-1-K", "CO-1-K", "EE-1-I", "EE-1-K", "ME-1-I", "ME-1-K", "MK-1-K"], "students": 207},
    "BPD": {"schemes": ["CE-4-I"], "students": 4},
    "BSC": {"schemes": ["AE-1-K", "CE-1-I", "CE-1-K", "CO-1-K", "EE-1-I", "EE-1-K", "ME-1-K", "MK-1-K"], "students": 161},
    "BSU": {"schemes": ["CE-2-I"], "students": 3},
    "CAA": {"schemes": ["CE-6-I"], "students": 92},
    "CAR": {"schemes": ["HA-3-I"], "students": 1},
    "CGR": {"schemes": ["CO-3-I"], "students": 3},
    "CMA": {"schemes": ["CE-2-I"], "students": 1},
    "CNE": {"schemes": ["EE-4-I"], "students": 5},
    "CTE": {"schemes": ["CE-3-I", "CE-3-K"], "students": 13},
    "DCC": {"schemes": ["CO-4-I", "HA-4-I"], "students": 7},
    "DCN": {"schemes": ["CO-4-K", "HA-4-K"], "students": 364},
    "DEM": {"schemes": ["EE-4-I", "EE-4-K"], "students": 139},
    "DMS": {"schemes": ["CO-3-I", "CO-3-K", "HA-3-I", "HA-3-K"], "students": 17},
    "DMT": {"schemes": ["EE-4-K"], "students": 134},
    "DSR": {"schemes": ["CE-5-I"], "students": 6},
    "DSU": {"schemes": ["CO-3-I", "CO-3-K", "HA-3-I", "HA-3-K"], "students": 10},
    "DTE": {"schemes": ["CO-3-I", "CO-3-K", "HA-3-K"], "students": 43},
    "EAC": {"schemes": ["CE-5-I"], "students": 6},
    "ECA": {"schemes": ["EE-5-I"], "students": 9},
    "ECG": {"schemes": ["CE-5-I"], "students": 5},
    "ECI": {"schemes": ["EE-3-I"], "students": 1},
    "ECN": {"schemes": ["EE-3-K"], "students": 14},
    "ECV": {"schemes": ["CE-4-K"], "students": 80},
    "EDG": {"schemes": ["AE-2-K", "ME-2-K", "MK-2-K"], "students": 288},
    "EDR": {"schemes": ["AE-2-I", "ME-2-I"], "students": 7},
    "EEC": {"schemes": ["EE-4-K", "EE-6-I", "HA-2-I"], "students": 255},
    "EEM": {"schemes": ["EE-3-I", "EE-3-K"], "students": 25},
    "EES": {"schemes": ["AE-4-K", "CE-4-K", "CO-4-K", "EE-4-K", "HA-4-K", "ME-4-K"], "students": 708},
    "EGM": {"schemes": ["AE-2-K", "CE-2-K", "ME-2-K", "MK-2-K"], "students": 439},
    "EMD": {"schemes": ["ME-5-I"], "students": 26},
    "EME": {"schemes": ["ME-3-I"], "students": 15},
    "EMW": {"schemes": ["EE-3-I"], "students": 2},
    "ENG": {"schemes": ["AE-1-K", "CE-1-I", "CE-1-K", "CO-1-K", "EE-1-I", "EE-1-K", "ME-1-K", "MK-1-K"], "students": 93},
    "EOE": {"schemes": ["EE-2-I", "EE-2-K"], "students": 145},
    "EPG": {"schemes": ["EE-3-I"], "students": 2},
    "EPT": {"schemes": ["EE-4-I"], "students": 1},
    "ESP": {"schemes": ["EE-6-I"], "students": 124},
    "EST": {"schemes": ["AE-5-I", "CE-4-I", "CO-5-I", "EE-4-I", "HA-5-I", "ME-4-I"], "students": 29},
    "ETC": {"schemes": ["CE-6-I"], "students": 90},
    "ETI": {"schemes": ["CO-6-I", "HA-6-I"], "students": 348},
    "ETM": {"schemes": ["AE-6-I", "ME-6-I"], "students": 139},
    "ETP": {"schemes": ["EE-6-I"], "students": 120},
    "FAE": {"schemes": ["AE-3-K"], "students": 4},
    "FEE": {"schemes": ["EE-2-I", "EE-2-K"], "students": 149},
    "FMM": {"schemes": ["ME-3-K", "ME-4-I"], "students": 49},
    "FPE": {"schemes": ["EE-3-I", "EE-3-K"], "students": 27},
    "GTD": {"schemes": ["EE-3-K"], "students": 16},
    "GTE": {"schemes": ["CE-4-I", "CE-4-K"], "students": 87},
    "HEN": {"schemes": ["CE-3-I", "CE-3-K"], "students": 9},
    "HPC": {"schemes": ["AE-6-I"], "students": 37},
    "HPE": {"schemes": ["AE-4-I"], "students": 5},
    "HRY": {"schemes": ["CE-4-I"], "students": 16},
    "HYD": {"schemes": ["CE-4-K"], "students": 80},
    "IAM": {"schemes": ["EE-5-I"], "students": 8},
    "IEB": {"schemes": ["EE-5-I"], "students": 11},
    "IEQ": {"schemes": ["ME-6-I"], "students": 105},
    "IHP": {"schemes": ["ME-6-I"], "students": 103},
    "IME": {"schemes": ["EE-4-I"], "students": 1},
    "JPR": {"schemes": ["CO-4-I", "CO-4-K", "HA-4-I", "HA-4-K"], "students": 373},
    "MAD": {"schemes": ["CO-6-I", "HA-6-I"], "students": 350},
    "MAM": {"schemes": ["ME-4-K"], "students": 104},
    "MAN": {"schemes": ["AE-6-I", "CE-6-I", "CO-6-I", "EE-5-I", "HA-6-I", "ME-5-I"], "students": 490},
    "MCR": {"schemes": ["HA-4-I"], "students": 6},
    "MEE": {"schemes": ["EE-6-I"], "students": 120},
    "MEM": {"schemes": ["ME-3-I", "ME-4-I", "ME-4-K"], "students": 136},
    "MIC": {"schemes": ["CO-4-I", "CO-4-K", "HA-4-K"], "students": 369},
    "MMP": {"schemes": ["AE-3-I"], "students": 2},
    "MOS": {"schemes": ["CE-3-I"], "students": 8},
    "MPR": {"schemes": ["AE-2-K", "ME-2-K", "ME-4-I", "MK-2-K"], "students": 300},
    "MRS": {"schemes": ["CE-6-I"], "students": 93},
    "MWC": {"schemes": ["HA-5-I"], "students": 5},
    "MWM": {"schemes": ["ME-3-I"], "students": 11},
    "OOP": {"schemes": ["CO-3-I", "CO-3-K", "HA-3-I", "HA-3-K"], "students": 19},
    "OSY": {"schemes": ["CO-5-I", "HA-5-I"], "students": 10},
    "PDR": {"schemes": ["ME-3-K"], "students": 6},
    "PER": {"schemes": ["ME-5-I"], "students": 12},
    "PHE": {"schemes": ["CE-5-I"], "students": 5},
    "PIC": {"schemes": ["CO-2-K", "HA-2-K"], "students": 348},
    "PPE": {"schemes": ["ME-5-I"], "students": 22},
    "PPR": {"schemes": ["ME-4-K"], "students": 104},
    "PWP": {"schemes": ["CO-6-I", "HA-6-I"], "students": 349},
    "RBE": {"schemes": ["CE-4-I"], "students": 10},
    "RBT": {"schemes": ["CE-4-K"], "students": 80},
    "RET": {"schemes": ["ME-6-I"], "students": 103},
    "SAP": {"schemes": ["EE-5-I"], "students": 13},
    "SEN": {"schemes": ["CO-4-I", "HA-4-I"], "students": 19},
    "SOM": {"schemes": ["AE-3-I", "AE-3-K", "CE-3-K", "ME-3-I", "ME-3-K"], "students": 80},
    "STE": {"schemes": ["CO-5-I"], "students": 5},
    "SUY": {"schemes": ["CE-2-K"], "students": 146},
    "SWM": {"schemes": ["CE-6-I"], "students": 91},
    "TEG": {"schemes": ["ME-3-K"], "students": 14},
    "TEN": {"schemes": ["ME-3-I"], "students": 15},
    "TMM": {"schemes": ["AE-5-I"], "students": 3},
    "TOM": {"schemes": ["AE-3-K", "AE-4-I", "ME-4-I", "ME-4-K"], "students": 126},
    "TOS": {"schemes": ["CE-4-I"], "students": 22},
    "TTW": {"schemes": ["AE-4-K"], "students": 26},
    "UEE": {"schemes": ["EE-4-K", "EE-6-I"], "students": 256},
    "WBP": {"schemes": ["CO-6-I", "HA-6-I"], "students": 351},
    "WRE": {"schemes": ["CE-5-I"], "students": 5},
    "WWE": {"schemes": ["CE-4-K"], "students": 80}
}

# Sort abbreviations by number of schemes (most first)
sorted_abbr = sorted(excel_missing_data.items(), key=lambda x: len(x[1]['schemes']), reverse=True)

print("="*80)
print("INTERACTIVE ABBR MAPPING - FROM subjects.csv")
print("="*80)
print(f"Total abbreviations to process: {len(sorted_abbr)}")
print()

subject_abbr_map = {}
sql_statements = []
assigned_count = 0

for idx, (abbr, abbr_info) in enumerate(sorted_abbr, 1):
    abbr_schemes = set(abbr_info['schemes'])
    
    print(f"\n[{idx}/{len(sorted_abbr)}] 📋 Abbreviation: {abbr}-TH")
    print(f"   Schemes ({len(abbr_schemes)}): {', '.join(sorted(abbr_schemes))}")
    print(f"   Students in Excel: {abbr_info['students']}")
    
    # Find subjects WITHOUT abbr that have these schemes
    subjects_found = []
    for scheme in abbr_schemes:
        if scheme in subjects_by_scheme:
            for sub in subjects_by_scheme[scheme]:
                if not sub['abbr']:  # Only if no abbreviation
                    subjects_found.append({
                        'code': sub['code'],
                        'name': sub['name'],
                        'scheme': scheme
                    })
    
    if not subjects_found:
        print(f"   ⚠️ No subjects without abbreviation found with these schemes")
        continue
    
    # Group by subject code
    subject_groups = defaultdict(lambda: {'name': '', 'schemes': []})
    for sub in subjects_found:
        if not subject_groups[sub['code']]['name']:
            subject_groups[sub['code']]['name'] = sub['name']
        subject_groups[sub['code']]['schemes'].append(sub['scheme'])
    
    # Show subjects
    display_list = []
    print(f"\n   📚 Subjects WITHOUT abbreviation that can use '{abbr}-TH':")
    for i, (code, data) in enumerate(sorted(subject_groups.items()), 1):
        schemes_str = ', '.join(sorted(data['schemes']))
        display_list.append({
            'index': i,
            'code': code,
            'name': data['name'],
            'schemes': schemes_str
        })
        print(f"     {i:2}. {code} - {data['name'][:50]}")
        print(f"         Schemes: {schemes_str}")
    
    # Ask user
    print(f"\n   Select subjects to assign '{abbr}-TH' (enter numbers separated by commas)")
    print(f"   Or press 0 to skip this abbreviation")
    selection = input(f"   Numbers (e.g., 1,2,3) or 0: ").strip()
    
    if selection == '0' or selection == '':
        print(f"   ⏭️ Skipping {abbr}")
        continue
    
    try:
        selected_indices = [int(x.strip()) for x in selection.split(',')]
        for sel_idx in selected_indices:
            if 1 <= sel_idx <= len(display_list):
                selected_sub = display_list[sel_idx-1]
                code = selected_sub['code']
                subject_abbr_map[code] = abbr
                sql_statements.append(f"UPDATE subjects SET abbr = '{abbr}-TH' WHERE code = '{code}';")
                print(f"   ✅ Assigned {abbr}-TH to {code} - {selected_sub['name']}")
                assigned_count += 1
            else:
                print(f"   ❌ Invalid number: {sel_idx}")
    except ValueError:
        print(f"   ❌ Invalid input")

# Generate SQL file
with open('update_abbr.sql', 'w') as f:
    f.write("-- ============================================\n")
    f.write("-- SUBJECTS ABBREVIATION UPDATES\n")
    f.write("-- Generated: " + str(__import__('datetime').datetime.now()) + "\n")
    f.write("-- Total updates: " + str(len(sql_statements)) + "\n")
    f.write("-- ============================================\n\n")
    for sql in sql_statements:
        f.write(sql + "\n")
    f.write("\n-- ============================================\n")
    f.write("-- VERIFY UPDATES:\n")
    f.write("-- SELECT code, name, abbr FROM subjects WHERE code IN ('" + "', '".join(subject_abbr_map.keys()) + "');\n")

print("\n" + "="*80)
print("SUMMARY")
print("="*80)
print(f"Total abbreviations processed: {len(sorted_abbr)}")
print(f"Subjects assigned: {assigned_count}")
print(f"SQL statements: {len(sql_statements)}")
print(f"\n✅ SQL updates saved to 'update_abbr.sql'")
print(f"✅ Mapping saved to 'abbr_mapping.json'")

with open('abbr_mapping.json', 'w') as f:
    json.dump(subject_abbr_map, f, indent=2)