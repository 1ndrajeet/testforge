import pandas as pd
from collections import defaultdict

# Load Excel file
df = pd.read_excel('ec_1740_final.xlsx', dtype=str).fillna('')

# Extract all abbreviations with -TH from Excel
excel_data = defaultdict(lambda: {'schemes': set(), 'students': [], 'count': 0})

for idx, row in df.iterrows():
    subjects = str(row.get('subject_appearing_for', '')).strip()
    scheme = str(row.get('scheme', '')).strip()
    name = str(row.get('name', '')).strip()
    
    if subjects and subjects != 'nan':
        for sub in subjects.split(','):
            sub = sub.strip().upper()
            if '-TH' in sub:
                # Keep the full abbreviation with -TH
                full_abbr = sub.replace('-ESE', '').replace('-SA', '').replace('-PA', '').replace('-FA', '')
                excel_data[full_abbr]['schemes'].add(scheme)
                if name and name != 'nan':
                    excel_data[full_abbr]['students'].append(name)
                excel_data[full_abbr]['count'] += 1

excel_abbr = set(excel_data.keys())

# Load subjects CSV
subjects_df = pd.read_csv('subjects.csv', dtype=str).fillna('')
csv_abbr = set()

for idx, row in subjects_df.iterrows():
    abbr = str(row.get('abbr', '')).strip().upper()
    if abbr and abbr != 'nan' and abbr != '':
        # Keep the abbreviation as-is (including -TH suffix)
        csv_abbr.add(abbr)

# Find missing (Excel abbreviations not in CSV)
missing = sorted([a for a in excel_abbr if a not in csv_abbr])

# Sort by number of schemes (descending), then by abbreviation
missing_sorted = sorted(missing, key=lambda x: (len(excel_data[x]['schemes']), x), reverse=True)

print("Abbr,Schemes Count,Schemes,Student Count")
print("-" * 80)
for m in missing_sorted:
    details = excel_data[m]
    schemes_count = len(details['schemes'])
    schemes = ';'.join(sorted(details['schemes'])) if details['schemes'] else 'N/A'
    student_count = details['count']
    print(f"{m},{schemes_count},{schemes},{student_count}")